from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Header,
    HTTPException,
    Form,
)
from fastapi.responses import Response

from fastapi.middleware.cors import CORSMiddleware

import asyncio
import os
import random
import logging
import sys
import uuid

from dotenv import load_dotenv

from pydantic import BaseModel

from typing import Literal, Any

logger = logging.getLogger("flexdemy.api")


load_dotenv()


# ============================================================
# AI LAYER PATH
# ============================================================

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

AI_LAYER_PATH = os.path.join(
    BASE_DIR,
    "AI_Layer",
)

if AI_LAYER_PATH not in sys.path:

    sys.path.insert(
        0,
        AI_LAYER_PATH,
    )


# ============================================================
# MODELS
# ============================================================

from AI_Layer.models import (
    AdaptiveQuizAnswerRequest,
    AdaptiveSession,
    ChatTurn,
    Chunk,
    Concept,
    ConceptDraft,
    ConceptState,
    Difficulty,
    QuestionType,
)

from backend.supabase_client import (
    fetch_asked_question_texts,
    fetch_mastery,
    fetch_quiz_history,
    fetch_user_preferences,
    get_user_client,
    get_user_id,
    load_cached_material,
    load_quiz_material_data,
    load_quiz_session_data,
    record_asked_question,
    record_quiz_result,
    save_cached_material,
    save_quiz_material_data,
    save_quiz_session_data,
    save_user_preferences,
    update_task_status,
    upsert_mastery,
)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="Flexdemy API"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)





# ============================================================
# ADAPTIVE SESSIONS
# ============================================================

adaptive_sessions: dict[
    str,
    AdaptiveSession,
] = {}


# Keyed by session_id. Holds the raw chunks (+ lazily computed
# embeddings) behind a material so the grounded tutor chat can
# retrieve from it after the quiz has started.
materials: dict[
    str,
    dict,
] = {}


# Keyed by sha256(file bytes). Re-uploading the exact same file
# (extremely common during testing/demo rehearsal) would otherwise
# re-spend a Gemini call on concept extraction every single time —
# this skips that when nothing about the file has changed. Not
# durable across cold starts, but meaningfully cuts quota use within
# a warm instance's lifetime, which is the common case.
concept_extraction_cache: dict[
    str,
    list,
] = {}

material_chunks_cache: dict[
    str,
    tuple[str, list[Chunk]],
] = {}

material_concepts_cache: dict[
    str,
    list[Any],
] = {}

# Session-level concurrency locks to prevent race conditions during answer submission
_session_locks: dict[str, asyncio.Lock] = {}

def get_session_lock(session_id: str) -> asyncio.Lock:
    if session_id not in _session_locks:
        _session_locks[session_id] = asyncio.Lock()
    return _session_locks[session_id]

# Rate-limiting for public AI endpoints
_ai_rate_limits: dict[str, list[float]] = {}

def check_ai_rate_limit(client_id: str, max_requests: int = 30, window_seconds: int = 60) -> None:
    """
    In-memory sliding-window abuse protection for AI endpoints.
    Allows intended guest and student usage while preventing quota exhaustion.
    """
    import time
    now = time.time()
    history = _ai_rate_limits.setdefault(client_id, [])
    history[:] = [t for t in history if now - t < window_seconds]
    if len(history) >= max_requests:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded on AI generation endpoint. Please wait a moment before trying again.",
        )
    history.append(now)


# ============================================================
# SESSION / MATERIAL PERSISTENCE (cache-aside over Supabase)
#
# This backend runs as Vercel serverless functions, which don't
# share in-process memory across invocations. The dicts above are
# a fast in-process cache; Supabase is the durable backing store so
# a redeploy or a request landing on a different instance doesn't
# lose an in-progress quiz. Best-effort: if Supabase isn't
# configured, this silently degrades back to in-memory-only
# behavior (matches every other persistence call in this file).
# ============================================================

async def get_session(
    session_id: str,
    user_id: str | None = None,
    auth_client=None,
) -> AdaptiveSession | None:

    session = adaptive_sessions.get(session_id)

    if session is not None:
        if session.user_id and user_id and session.user_id != user_id:
            logger.warning("Unauthorized access to in-memory session %s by %s", session_id, user_id)
            return None
        return session

    data = await load_quiz_session_data(
        session_id,
        user_id=user_id,
        auth_client=auth_client,
    )

    if data is None:
        return None

    try:
        session = AdaptiveSession.model_validate(data)
    except Exception as e:
        print("Failed to restore session from Supabase:", repr(e))
        return None

    if session.user_id and user_id and session.user_id != user_id:
        logger.warning("Unauthorized access to restored session %s by %s", session_id, user_id)
        return None

    adaptive_sessions[session_id] = session

    return session


async def save_session(
    session: AdaptiveSession,
    auth_client=None,
) -> None:

    adaptive_sessions[session.session_id] = session

    await save_quiz_session_data(
        session.session_id,
        session.model_dump(mode="json"),
        user_id=session.user_id,
        auth_client=auth_client,
    )


async def get_material(
    session_id: str,
    user_id: str | None = None,
    auth_client=None,
) -> dict | None:

    material = materials.get(session_id)

    if material is not None:
        return material

    data = await load_quiz_material_data(
        session_id,
        user_id=user_id,
        auth_client=auth_client,
    )

    if data is None:
        return None

    try:
        data["chunks"] = [
            Chunk.model_validate(c) for c in data["chunks"]
        ]
    except Exception as e:
        print("Failed to restore material from Supabase:", repr(e))
        return None

    materials[session_id] = data

    return data


async def save_material(
    session_id: str,
    material: dict,
    user_id: str | None = None,
    auth_client=None,
) -> None:

    materials[session_id] = material

    await save_quiz_material_data(
        session_id,
        chunks_json=[
            c.model_dump(mode="json") for c in material["chunks"]
        ],
        embeddings_json=material.get("embeddings"),
        raw_bytes=material.get("raw_bytes"),
        content_type=material.get(
            "content_type", "application/octet-stream"
        ),
        filename=material.get("filename", "material"),
        user_id=user_id,
        auth_client=auth_client,
    )


# ============================================================
# BASIC ROUTES
# ============================================================

@app.get("/")
def root():

    return {
        "message": "Flexdemy API is running"
    }


@app.get("/test-ai")
async def test_ai():

    try:

        import AI_Layer.ai_core as ai_core

        return {
            "message": (
                "AI Layer imported successfully"
            ),

            "api_key_loaded": bool(
                ai_core.api_key
            ),

            "gemini_client_exists": (
                ai_core.client is not None
            ),
        }

    except Exception as e:

        return {
            "error": str(e)
        }


# ============================================================
# ADAPTIVE ENGINE CONSTANTS
# ============================================================

DIFFICULTY_ORDER = [
    "easy",
    "medium",
    "hard",
]

CONCEPT_WEIGHTS = {
    "weak": 3,
    "moderate": 2,
    "strong": 1,
}


# ============================================================
# DIFFICULTY CLAMP
# ============================================================

def clamp_difficulty(
    difficulty: Difficulty,
    direction: int,
) -> Difficulty:

    index = DIFFICULTY_ORDER.index(
        difficulty
    )

    new_index = max(
        0,
        min(
            len(DIFFICULTY_ORDER) - 1,
            index + direction,
        ),
    )

    return DIFFICULTY_ORDER[
        new_index
    ]


# ============================================================
# UPDATE ONE CONCEPT
# ============================================================

def update_concept_performance(
    state: ConceptState,
    is_correct: bool,
    question_type: str = "mcq",
) -> ConceptState:
    """
    Update performance statistics and in-session BKT mastery for the answered concept.
    """
    state.times_asked += 1

    if is_correct:
        state.correct_count += 1
    else:
        state.incorrect_count += 1

    from backend.supabase_client import bkt_update
    p_guess = 0.05 if question_type in ("numerical", "short_answer") else 0.20
    current_m = getattr(state, "mastery_score", 0.30)
    state.mastery_score = bkt_update(current_m, is_correct, p_guess=p_guess)

    return state


# ============================================================
# WEIGHTED CONCEPT SELECTION
# ============================================================

def choose_weighted_concept(
    session: AdaptiveSession,
) -> Concept:

    concepts = session.concepts

    if not concepts:
        raise HTTPException(
            status_code=400,
            detail="No concepts are available.",
        )

    if session.is_diagnostic:
        # Algorithmic Diagnostic Placement: Select 1 concept per major topic
        asked_topics = set()
        for item in session.history:
            c_match = next((c for c in concepts if c.label == item.concept_label), None)
            if c_match and c_match.topic:
                asked_topics.add(c_match.topic)
        unasked = [c for c in concepts if c.topic not in asked_topics]
        if unasked:
            return unasked[0]
        return min(concepts, key=lambda c: session.concept_states[c.label].times_asked)

    weights = []

    for concept in concepts:
        state = session.concept_states[concept.label]

        if state.times_asked == 0:
            weight = CONCEPT_WEIGHTS["weak"]
        else:
            mastery = getattr(state, "mastery_score", 0.30)
            if mastery < 0.45:
                weight = CONCEPT_WEIGHTS["weak"]
            elif mastery < 0.75:
                weight = CONCEPT_WEIGHTS["moderate"]
            else:
                weight = CONCEPT_WEIGHTS["strong"]

        weights.append(weight)

    return random.choices(
        concepts,
        weights=weights,
        k=1,
    )[0]


# ============================================================
# PREVIOUS QUESTION TEXTS
# ============================================================

def get_previous_question_texts(
    session: AdaptiveSession,
) -> list[str]:

    return [
        item.question.question_text
        for item in session.history
    ]


# ============================================================
# GENERATE NEXT UNIQUE QUESTION
# ============================================================

async def generate_next_question(
    session: AdaptiveSession,
    sb_client=None,
    question_types: list[str] | None = None,
    user_id: str | None = None,
):

    from AI_Layer.ai_core import (
        generate_validated_question,
    )


    # --------------------------------------------------------
    # 1. Choose concept using adaptive weights.
    # --------------------------------------------------------

    concept = choose_weighted_concept(
        session
    )





    # --------------------------------------------------------
    # 2. Use THAT concept's current difficulty.
    # --------------------------------------------------------

    difficulty = session.current_difficulty


    # --------------------------------------------------------
    # 3. Give Gemini previous questions so it avoids
    # duplicates, including questions asked in EARLIER
    # assessments (not just this session).
    # --------------------------------------------------------

    previous_questions = (
        get_previous_question_texts(
            session
        )
    )

    cross_session_questions = (
        await fetch_asked_question_texts(
            sb_client,
            concept.topic,
        )
    )

    previous_questions = (
        previous_questions + cross_session_questions
    )


    # --------------------------------------------------------
    # 3b. Round-robin through the requested question types.
    # --------------------------------------------------------

    question_types = question_types or ["mcq"]

    question_type = question_types[
        session.questions_asked % len(question_types)
    ]


    question = await generate_validated_question(

        concept=concept,

        difficulty=difficulty,

        previous_questions=previous_questions,

        question_type=question_type,
    )

    await record_asked_question(
        sb_client,
        concept.topic,
        question.question_text,
        user_id=user_id,
    )


    # --------------------------------------------------------
    # 4. Assign the NEXT question number.
    # --------------------------------------------------------

    question_number = (
        session.questions_asked + 1
    )


    session.questions_asked = (
        question_number
    )


    # --------------------------------------------------------
    # 5. Store active question.
    # --------------------------------------------------------

    session.current_concept_label = (
        concept.label
    )

    session.current_question = (
        question
    )

    session.current_question_number = (
        question_number
    )


    # --------------------------------------------------------
    # 6. Add to history.
    # --------------------------------------------------------

    from AI_Layer.models import AdaptiveQuestion

    session.history.append(
        AdaptiveQuestion(
            question_number=question_number,
            concept_label=concept.label,
            difficulty=difficulty,
            question=question,
        )
    )


    return (
        concept,
        question,
        question_number,
    )


# ============================================================
# READ UPLOADED MATERIAL
# ============================================================

VIDEO_EXTENSIONS = (
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
)

VIDEO_MIME_BY_EXT = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
}


async def read_uploaded_material(
    file: UploadFile,
    user_id: str | None = None,
    sb_client=None,
) -> list[Chunk]:

    file_bytes = await file.read()
    await file.seek(0)

    if not file_bytes or len(file_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty (0 bytes). Please upload a valid study document or lecture video.",
        )

    if len(file_bytes) > 100 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="Uploaded file exceeds the maximum 100MB size limit.",
        )

    raw_filename = file.filename or "uploaded_material"
    filename = raw_filename.lower()

    SUPPORTED_EXTENSIONS = (
        ".pdf", ".pptx", ".txt", ".md",
        ".mp4", ".mov", ".webm", ".mkv",
    )

    is_supported_ext = any(filename.endswith(ext) for ext in SUPPORTED_EXTENSIONS)
    is_supported_mime = bool(
        file.content_type and (
            file.content_type.startswith("text/")
            or file.content_type.startswith("video/")
            or file.content_type == "application/pdf"
            or file.content_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
    )

    if filename.endswith(".ppt") and not filename.endswith(".pptx"):
        raise HTTPException(
            status_code=415,
            detail=(
                f"Legacy PowerPoint format '{raw_filename}' (.ppt) is not supported. "
                "Please save your presentation as modern PowerPoint (.pptx) or export to PDF before uploading."
            ),
        )

    if not is_supported_ext and not is_supported_mime:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file format '{raw_filename}'. "
                "Flexdemy supports PDF textbooks (.pdf), presentation slides (.pptx), "
                "markdown/text notes (.md, .txt), and lecture videos (.mp4, .mov, .webm, .mkv)."
            ),
        )

    # Magic byte integrity checks to prevent spoofed/corrupted files
    detected_format = "pdf"
    if filename.endswith(".pdf") or file.content_type == "application/pdf":
        if not file_bytes.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=400,
                detail=f"Corrupted or invalid PDF '{raw_filename}': file does not have a valid %PDF- header.",
            )
        detected_format = "pdf"
    elif filename.endswith(".pptx") or file.content_type == "application/vnd.openxmlformats-officedocument.presentationml.presentation":
        if not file_bytes.startswith(b"PK\x03\x04"):
            raise HTTPException(
                status_code=400,
                detail=f"Corrupted or invalid PPTX '{raw_filename}': file does not have a valid PK ZIP signature.",
            )
        detected_format = "pptx"
    elif filename.endswith(VIDEO_EXTENSIONS) or (file.content_type or "").startswith("video/"):
        detected_format = "video"
    elif filename.endswith((".txt", ".md")) or (file.content_type or "").startswith("text/"):
        detected_format = "text"

    # Cache lookup AFTER format, size, and magic byte validation
    import hashlib
    content_hash = hashlib.sha256(file_bytes).hexdigest()

    # 1. In-memory instance cache check
    if content_hash in material_chunks_cache:
        cached_format, cached_chunks = material_chunks_cache[content_hash]
        if cached_format != detected_format:
            raise HTTPException(
                status_code=400,
                detail=f"Uploaded file '{raw_filename}' format ({detected_format}) conflicts with cached file content ({cached_format}).",
            )
        return [
            c.model_copy(update={
                "source_filename": raw_filename,
                "doc_id": f"{content_hash[:8]}_{raw_filename[:12]}",
                "mime_type": file.content_type or c.mime_type,
            })
            for c in cached_chunks
        ]

    # 2. Durable Supabase cache check (preserves extracted chunks across Vercel cold starts)
    cached_durable = await load_cached_material(content_hash, user_id=user_id, auth_client=sb_client)
    if cached_durable and cached_durable.get("chunks"):
        try:
            chunks = [Chunk.model_validate(c) for c in cached_durable["chunks"]]
            material_chunks_cache[content_hash] = (detected_format, chunks)
            return [
                c.model_copy(update={
                    "source_filename": raw_filename,
                    "doc_id": f"{content_hash[:8]}_{raw_filename[:12]}",
                    "mime_type": file.content_type or c.mime_type,
                })
                for c in chunks
            ]
        except Exception as e:
            logger.warning("Failed to restore cached chunks from Supabase: %s", e)

    chunks: list[Chunk] = []

    if detected_format == "text":
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = file_bytes.decode("latin-1")

        from AI_Layer.ai_core import extract_text_and_chunk
        chunks = extract_text_and_chunk(text, raw_filename)

    elif detected_format == "pptx":
        from AI_Layer.ai_core import extract_slide_deck
        chunks = await extract_slide_deck(file_bytes, raw_filename)

    elif detected_format == "video":
        from AI_Layer.ai_core import extract_video
        ext = next(
            (e for e in VIDEO_EXTENSIONS if filename.endswith(e)),
            ".mp4",
        )
        chunks = await extract_video(
            file_bytes,
            mime_type=VIDEO_MIME_BY_EXT.get(ext, "video/mp4"),
            source_filename=raw_filename,
        )

    else:
        # Default PDF extractor
        from AI_Layer.ai_core import extract_and_chunk
        chunks = await extract_and_chunk(file_bytes, raw_filename)

    # Standardize chunk metadata across formats (Requirement 1.2)
    mime = file.content_type or "application/octet-stream"
    for c in chunks:
        c.content_hash = content_hash
        c.doc_id = content_hash[:12]
        c.mime_type = mime
        if not c.source_filename:
            c.source_filename = raw_filename

    material_chunks_cache[content_hash] = (detected_format, chunks)

    # Persist chunks into durable cache asynchronously (best-effort)
    await save_cached_material(
        content_hash=content_hash,
        chunks_json=[c.model_dump(mode="json") for c in chunks],
        concept_drafts_json=[],
        content_type=mime,
        filename=raw_filename,
        user_id=user_id,
        auth_client=sb_client,
    )

    return chunks


# ============================================================
# SINGLE QUESTION
# ============================================================

class QuestionRequest(BaseModel):

    concept: str

    description: str

    difficulty: Literal[
        "easy",
        "medium",
        "hard",
    ]


@app.post("/generate-question")
async def generate_question_api(
    request: QuestionRequest,
):

    from AI_Layer.ai_core import (
        generate_validated_question,
    )


    concept = Concept(
        label=request.concept,
        description=request.description,
        source_chunk_indices=[0],
    )


    question = await generate_validated_question(
        concept,
        request.difficulty,
    )


    return question.model_dump()


# ============================================================
# CONCEPT EXTRACTION
# ============================================================

@app.post("/extract-concepts")
async def extract_concepts_api(
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):

    user_id = get_user_id(authorization)
    sb_client = get_user_client(authorization)
    check_ai_rate_limit(user_id or "client")

    from AI_Layer.ai_core import (
        extract_concepts,
    )
    from AI_Layer.exceptions import ConceptExtractionError, PDFProcessingError
    from AI_Layer.models import ConceptDraft

    # 1. Ingestion & Validation
    try:
        chunks = await read_uploaded_material(
            file,
            user_id=user_id,
            sb_client=sb_client,
        )
    except HTTPException:
        raise
    except PDFProcessingError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to read uploaded material '%s': %s", file.filename, e, exc_info=True)
        raise HTTPException(
            status_code=400,
            detail=f"Could not read uploaded file '{file.filename}': {str(e)}",
        )

    if not chunks:
        raise HTTPException(
            status_code=422,
            detail=f"No readable text or slide content could be extracted from '{file.filename}'. Please check that the file is not empty or image-only without OCR.",
        )

    # 2. Content Hash Cache Lookup (Instant response + 0 LLM tokens on re-extraction)
    content_hash = chunks[0].content_hash if (chunks and chunks[0].content_hash) else None
    if content_hash:
        # Check in-memory concepts cache
        if content_hash in material_concepts_cache:
            cached_concepts = material_concepts_cache[content_hash]
            return {
                "filename": file.filename,
                "chunk_count": len(chunks),
                "cached": True,
                "concepts": [c.model_dump() for c in cached_concepts],
            }

        # Check durable Supabase cache
        cached_durable = await load_cached_material(content_hash, user_id=user_id, auth_client=sb_client)
        if cached_durable and cached_durable.get("concept_drafts"):
            try:
                loaded_drafts = [ConceptDraft.model_validate(cd) for cd in cached_durable["concept_drafts"]]
                material_concepts_cache[content_hash] = loaded_drafts
                return {
                    "filename": file.filename,
                    "chunk_count": len(chunks),
                    "cached": True,
                    "concepts": [c.model_dump() for c in loaded_drafts],
                }
            except Exception as e:
                logger.warning("Failed to parse durable cached concepts: %s", e)

    # 3. Call Concept Extraction with safe diagnostic error codes
    try:
        concepts = await extract_concepts(chunks)
    except ConceptExtractionError as e:
        err_msg = str(e)
        if "GEMINI_API_KEY" in err_msg or "not initialized" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="Concept extraction requires a configured Gemini API key (GEMINI_API_KEY). Please configure GEMINI_API_KEY in your deployment environment.",
            )
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Gemini API rate limit exceeded. Please wait a moment and retry.",
            )
        raise HTTPException(
            status_code=502,
            detail=f"Concept extraction provider error: {err_msg}",
        )
    except Exception as e:
        logger.error("extract_concepts failed on '%s': %s", file.filename, e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Could not extract educational concepts from this document: {str(e)}",
        )

    if not concepts:
        raise HTTPException(
            status_code=422,
            detail="No distinct educational concepts could be identified in this file. Please verify that the file contains structured educational material.",
        )

    # 4. Save to in-memory & durable cache
    if content_hash:
        material_concepts_cache[content_hash] = concepts
        await save_cached_material(
            content_hash=content_hash,
            chunks_json=[c.model_dump(mode="json") for c in chunks],
            concept_drafts_json=[c.model_dump(mode="json") for c in concepts],
            content_type=file.content_type or "application/octet-stream",
            filename=file.filename or "material",
            user_id=user_id,
            auth_client=sb_client,
        )

    return {
        "filename": file.filename,
        "chunk_count": len(chunks),
        "cached": False,
        "concepts": [
            concept.model_dump()
            for concept in concepts
        ],
    }


# ============================================================
# START ADAPTIVE QUIZ
# ============================================================

@app.post("/start-adaptive-quiz")
async def start_adaptive_quiz(
    file: UploadFile = File(...),

    title: str = Form("Adaptive Quiz"),

    difficulty: Difficulty = "medium",

    question_count: int = 10,

    # Comma-separated, e.g. "mcq,short_answer,numerical".
    # Cycled round-robin across the quiz.
    question_types: str = Form("mcq"),

    # Comma-separated topic names the student chose to be quizzed on
    # (from a prior /extract-concepts preview). Empty = use everything
    # extracted from the material, preserving the old behavior.
    selected_topics: str = Form(""),

    # Concept drafts already extracted by a prior /extract-concepts
    # call on this same file, passed back as JSON so we don't re-run
    # extraction (which would be wasteful and, since generation isn't
    # fully deterministic, could silently drift from what the student
    # actually saw and picked from).
    concept_drafts_json: str = Form(""),

    is_diagnostic: bool = Form(False),

    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    check_ai_rate_limit(user_id or "client")

    requested_types = [
        t.strip()
        for t in question_types.split(",")
        if t.strip() in ("mcq", "short_answer", "numerical")
    ] or ["mcq"]

    requested_topics = {
        t.strip().lower()
        for t in selected_topics.split(",")
        if t.strip()
    }

    from AI_Layer.ai_core import (
        extract_concepts,
        deduplicate_concepts,
    )


    question_count = max(
        1,
        min(
            question_count,
            50,
        ),
    )


    try:

        # ----------------------------------------------------
        # Read material.
        # ----------------------------------------------------

        # Keep a copy of the original bytes so a citation can later
        # open the actual source file (PDF page, video timestamp),
        # not just show its locator as text.
        raw_bytes = await file.read()
        await file.seek(0)

        chunks = await read_uploaded_material(
            file,
            user_id=user_id,
            sb_client=sb_client,
        )


        if not chunks:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No readable study material "
                    "was found."
                ),
            )


        # ----------------------------------------------------
        # Extract concepts (reuse a prior preview's drafts if the
        # frontend already called /extract-concepts for this file).
        # ----------------------------------------------------

        if concept_drafts_json.strip():

            import json as _json

            try:
                concept_drafts = [
                    ConceptDraft(**d)
                    for d in _json.loads(concept_drafts_json)
                ]
            except (ValueError, TypeError) as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid concept_drafts_json: {e}",
                )

        else:

            import hashlib

            file_hash = hashlib.sha256(raw_bytes).hexdigest()
            cached_drafts = concept_extraction_cache.get(file_hash)

            if cached_drafts is not None:

                concept_drafts = cached_drafts

            else:

                concept_drafts = (
                    await extract_concepts(
                        chunks
                    )
                )

                concept_extraction_cache[file_hash] = concept_drafts


        concepts = (
            await deduplicate_concepts(
                concept_drafts,
                chunks,
            )
        )


        if not concepts:

            raise HTTPException(
                status_code=400,
                detail=(
                    "No educational concepts "
                    "could be extracted."
                ),
            )


        # ----------------------------------------------------
        # Narrow to the student-chosen topics, if any were given.
        # Falls back to the full set if the filter would otherwise
        # wipe out every concept (e.g. a stale/mismatched selection),
        # so a demo never hard-fails on this.
        # ----------------------------------------------------

        if requested_topics:

            narrowed = [
                c for c in concepts
                if c.topic.strip().lower() in requested_topics
            ]

            if narrowed:
                concepts = narrowed


        # ----------------------------------------------------
        # Initialize EVERY concept independently.
        # ----------------------------------------------------
        concept_states = {}

        for concept in concepts:
            concept_states[
                concept.label
            ] = ConceptState(
                concept_label=concept.label,
                difficulty=difficulty,
                times_asked=0,
                correct_count=0,
                incorrect_count=0,
            )
        # ----------------------------------------------------
        # Create session.
        # ----------------------------------------------------

        if is_diagnostic:
            difficulty = "medium"
            distinct_topics = list(dict.fromkeys(c.topic for c in concepts if c.topic))
            if distinct_topics:
                question_count = len(distinct_topics)

        session_id = str(
            uuid.uuid4()
        )

        session = AdaptiveSession(
            session_id=session_id,
            user_id=user_id,
            title=title,
            total_questions=question_count,
            starting_difficulty=difficulty,
            current_difficulty=difficulty,
            streak_direction="",
            streak_count=0,
            concepts=concepts,
            concept_states=concept_states,
            question_types=requested_types,
            is_diagnostic=is_diagnostic,
        )


        adaptive_sessions[
            session_id
        ] = session

        await save_material(
            session_id,
            {
                "chunks": chunks,
                "embeddings": None,
                "raw_bytes": raw_bytes,
                "content_type": file.content_type or "application/octet-stream",
                "filename": file.filename or "material",
            },
            user_id=user_id,
            auth_client=sb_client,
        )


        # ----------------------------------------------------
        # Generate Q1 RIGHT NOW.
        # ----------------------------------------------------

        (
            concept,
            question,
            question_number,
        ) = await generate_next_question(
            session,
            sb_client=sb_client,
            question_types=requested_types,
            user_id=user_id,
        )

        # Save AFTER Q1 is generated so the persisted session
        # already has current_question/current_concept_label set.
        await save_session(session, auth_client=sb_client)


        return {

            "session_id": session_id,

            "title": (
                file.filename
                or "Adaptive Quiz"
            ),

            "total_questions": (
                question_count
            ),

            "question_number": (
                question_number
            ),

            "concept_label": (
                concept.label
            ),

            "difficulty": (
                session.current_difficulty
            ),

            "question": (
                question.model_dump()
            ),
        }


    except HTTPException:
        raise


    except Exception as e:

        print(
            "Adaptive quiz start error:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "Could not start adaptive quiz: "
                f"{e}"
            ),
        )


# ============================================================
# SHARED: RECORD ANSWER, ADVANCE SESSION, PERSIST MASTERY
# ============================================================

async def record_answer_and_advance(
    session: AdaptiveSession,
    request_question_number: int,
    concept_label: str,
    was_correct: bool,
    sb_client=None,
    extra_fields: dict | None = None,
    user_id: str | None = None,
):

    # --------------------------------------------------------
    # Determine question type for consistent in-session and persistent BKT
    # --------------------------------------------------------
    q_type = session.current_question.question_type if session.current_question else "mcq"

    # --------------------------------------------------------
    # Update performance for the answered concept.
    # Difficulty and streak are GLOBAL to the quiz.
    # --------------------------------------------------------

    state = session.concept_states[
        concept_label
    ]

    state = update_concept_performance(
        state,
        was_correct,
        question_type=q_type,
    )

    # --------------------------------------------------------
    # GLOBAL ADAPTIVE STREAK
    # --------------------------------------------------------

    difficulty_before = (
        session.current_difficulty
    )

    direction = (
        "correct"
        if was_correct
        else "incorrect"
    )

    if session.streak_direction != direction:

        session.streak_direction = direction
        session.streak_count = 1

    else:

        session.streak_count += 1

    if (
        was_correct
        and session.streak_count == 2
    ):

        session.current_difficulty = (
            clamp_difficulty(
                session.current_difficulty,
                +1,
            )
        )

        session.streak_count = 0
        session.streak_direction = ""

    elif (
        not was_correct
        and session.streak_count == 2
    ):

        session.current_difficulty = (
            clamp_difficulty(
                session.current_difficulty,
                -1,
            )
        )

        session.streak_count = 0
        session.streak_direction = ""

    difficulty_after = (
        session.current_difficulty
    )

    # --------------------------------------------------------
    # Persist per-topic mastery (best-effort; no-op if the
    # caller isn't authenticated or Supabase isn't configured).
    # --------------------------------------------------------

    topic = next(
        (
            concept.topic
            for concept in session.concepts
            if concept.label == concept_label
        ),
        concept_label,
    )

    # Not awaited yet — upsert_mastery never raises (it swallows its
    # own errors internally), so it's safe to run concurrently with
    # next-question generation below instead of serially blocking the
    # Gemini call behind a database round-trip first.
    mastery_task = upsert_mastery(
        sb_client,
        topic,
        was_correct,
        user_id=user_id,
        question_type=q_type,
    )

    # --------------------------------------------------------
    # QUIZ COMPLETE
    # --------------------------------------------------------

    if (
        session.questions_asked
        >= session.total_questions
    ):

        await mastery_task

        session.current_question = None
        session.current_concept_label = None
        session.current_question_number = None

        response = {
            "session_id": session.session_id,
            "completed": True,
            "question_number": request_question_number,
            "total_questions": session.total_questions,
            "was_correct": was_correct,
            "answered_concept": concept_label,
            "answered_difficulty": difficulty_before,
            "new_difficulty": difficulty_after,
            "streak_direction": session.streak_direction,
            "streak_count": session.streak_count,
            "next_question_number": None,
            "next_concept": None,
            "next_difficulty": None,
            "question": None,
        }

        if extra_fields:
            response.update(extra_fields)

        # Store in durable idempotency log
        session.answered_results[request_question_number] = response
        await save_session(session, auth_client=sb_client)

        return response

    # --------------------------------------------------------
    # Generate next question.
    # --------------------------------------------------------

    try:

        _, (
            next_concept,
            next_question,
            next_question_number,
        ) = await asyncio.gather(
            mastery_task,
            generate_next_question(
                session,
                sb_client=sb_client,
                question_types=session.question_types,
                user_id=user_id,
            ),
        )

    except Exception as e:

        print(
            "Next adaptive question error:",
            repr(e),
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "The answer was recorded, but "
                "the next question could not "
                f"be generated: {e}"
            ),
        )

    response = {

        "session_id": (
            session.session_id
        ),

        "completed": False,

        "question_number": (
            request_question_number
        ),

        "total_questions": (
            session.total_questions
        ),

        "was_correct": (
            was_correct
        ),

        "answered_concept": (
            concept_label
        ),

        "answered_difficulty": (
            difficulty_before
        ),

        "new_difficulty": (
            difficulty_after
        ),

        "streak_direction": (
            session.streak_direction
        ),

        "streak_count": (
            session.streak_count
        ),

        "next_question_number": (
            next_question_number
        ),

        "next_concept": (
            next_concept.label
        ),

        "next_difficulty": (
            session.current_difficulty
        ),

        "question": (
            next_question.model_dump()
        ),
    }

    if extra_fields:
        response.update(extra_fields)

    # Store in durable idempotency log
    session.answered_results[request_question_number] = response
    await save_session(session, auth_client=sb_client)

    return response


# ============================================================
# ANSWER ADAPTIVE QUESTION
# ============================================================

@app.post("/answer-adaptive-question")
async def answer_adaptive_question(
    request: AdaptiveQuizAnswerRequest,
    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)

    async with get_session_lock(request.session_id):
        session = await get_session(
            request.session_id,
            user_id=user_id,
            auth_client=sb_client,
        )

        if session is None:
            raise HTTPException(
                status_code=404,
                detail="Adaptive quiz session not found.",
            )

        if session.user_id and user_id and session.user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to submit answers for this quiz session.",
            )

        # ----------------------------------------------------
        # Atomic idempotency: if question already answered, return cached result
        # ----------------------------------------------------
        if request.question_number in session.answered_results:
            return session.answered_results[request.question_number]

        # ----------------------------------------------------
        # Make sure there is an active question.
        # ----------------------------------------------------
        if (
            session.current_question is None
            or session.current_concept_label is None
            or session.current_question_number is None
        ):
            raise HTTPException(
                status_code=400,
                detail="There is no active question.",
            )

        # ----------------------------------------------------
        # Prevent out-of-order submissions.
        # ----------------------------------------------------
        if (
            request.question_number
            != session.current_question_number
        ):
            raise HTTPException(
                status_code=400,
                detail="Question number does not match the active question.",
            )

        question = session.current_question

        # ----------------------------------------------------
        # Validate answer index.
        # ----------------------------------------------------
        if not (
            0
            <= request.selected_option_index
            < len(question.options)
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid answer option.",
            )

        # ----------------------------------------------------
        # Backend determines correctness.
        # ----------------------------------------------------
        selected_option = question.options[
            request.selected_option_index
        ]

        was_correct = selected_option.is_correct
        concept_label = session.current_concept_label

        return await record_answer_and_advance(
            session,
            request.question_number,
            concept_label,
            was_correct,
            sb_client,
            extra_fields={
                "explanation": question.explanation or (
                    "That is the correct answer! Well done."
                    if was_correct
                    else "Review the cited source below to master this concept."
                ),
                "misconception": selected_option.misconception_tag,
                "source_locator": question.source_locator,
            },
            user_id=user_id,
        )


# ============================================================
# ANSWER ADAPTIVE QUESTION (short-answer / numerical)
# ============================================================

class OpenAnswerRequest(BaseModel):
    session_id: str
    question_number: int
    student_answer: str


@app.post("/answer-adaptive-question-open")
async def answer_adaptive_question_open(
    request: OpenAnswerRequest,
    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)

    async with get_session_lock(request.session_id):
        session = await get_session(
            request.session_id,
            user_id=user_id,
            auth_client=sb_client,
        )

        if session is None:
            raise HTTPException(
                status_code=404,
                detail="Adaptive quiz session not found.",
            )

        if session.user_id and user_id and session.user_id != user_id:
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to submit answers for this quiz session.",
            )

        # ----------------------------------------------------
        # Atomic idempotency: if question already answered, return cached result
        # ----------------------------------------------------
        if request.question_number in session.answered_results:
            return session.answered_results[request.question_number]

        if (
            session.current_question is None
            or session.current_concept_label is None
            or session.current_question_number is None
        ):
            raise HTTPException(
                status_code=400,
                detail="There is no active question.",
            )

        if request.question_number != session.current_question_number:
            raise HTTPException(
                status_code=400,
                detail="Question number does not match the active question.",
            )

        question = session.current_question

        if question.question_type == "mcq":
            raise HTTPException(
                status_code=400,
                detail=(
                    "This question expects a multiple-choice answer — "
                    "use /answer-adaptive-question instead."
                ),
            )

        from AI_Layer.ai_core import verify_answer

        verification = await verify_answer(
            question,
            request.student_answer,
        )

        concept_label = session.current_concept_label

        return await record_answer_and_advance(
            session,
            request.question_number,
            concept_label,
            verification.is_correct,
            sb_client,
            extra_fields={
                "explanation": verification.feedback,
                "feedback": verification.feedback,
                "source_locator": verification.source_locator,
            },
            user_id=user_id,
        )


# ============================================================
# GROUNDED TUTOR CHAT (source-cited, with refusal)
# ============================================================

SUPPORTED_LANGUAGES = {"english", "hindi"}
SUPPORTED_STYLES = {"concise", "step-by-step", "example-first"}


class GroundedChatRequest(BaseModel):
    session_id: str
    message: str
    history: list[ChatTurn] = []
    # "english" (default) or "hindi" (Hinglish explanation of the
    # same, English-language source material).
    language: str = "english"
    style: Literal["concise", "step-by-step", "example-first"] = "concise"


@app.post("/grounded-chat")
async def grounded_chat_api(
    request: GroundedChatRequest,
    authorization: str | None = Header(None),
):
    correlation_id = str(uuid.uuid4())[:8]

    # 1. Input Validation
    clean_session_id = (request.session_id or "").strip()
    if not clean_session_id:
        raise HTTPException(
            status_code=400,
            detail="Session ID is required and cannot be empty.",
        )

    clean_message = (request.message or "").strip()
    if not clean_message:
        raise HTTPException(
            status_code=400,
            detail="Student question message is required and cannot be empty.",
        )

    clean_lang = (request.language or "english").strip().lower()
    if clean_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language '{request.language}'. Supported languages are: {', '.join(sorted(SUPPORTED_LANGUAGES))}.",
        )

    clean_style = (request.style or "concise").strip().lower()
    if clean_style not in SUPPORTED_STYLES:
        clean_style = "concise"

    chat_user_id = get_user_id(authorization)
    sb_client = get_user_client(authorization)
    check_ai_rate_limit(chat_user_id or "client")

    from AI_Layer.ai_core import (
        answer_grounded_question,
        embed_texts,
    )

    # 2. Material Retrieval
    material = await get_material(
        clean_session_id,
        user_id=chat_user_id,
        auth_client=sb_client,
    )

    if material is None:
        logger.warning(
            "[%s] Material not found for session %s (user: %s)",
            correlation_id, clean_session_id, chat_user_id,
        )
        raise HTTPException(
            status_code=404,
            detail="No ingested material found for this quiz session. The session may have expired or been started without persistent storage.",
        )

    chunks = material.get("chunks", [])
    if not chunks:
        raise HTTPException(
            status_code=404,
            detail="The material for this quiz session contains no extractable text chunks to answer from.",
        )

    # 3. Embedding retrieval with safe fallback to lexical matching
    if material.get("embeddings") is None:
        try:
            material["embeddings"] = await embed_texts(
                [chunk.text for chunk in chunks]
            )
            await save_material(
                clean_session_id,
                material,
                user_id=chat_user_id,
                auth_client=sb_client,
            )
        except Exception as emb_err:
            logger.warning(
                "[%s] Embedding generation unavailable or failed: %s; falling back to lexical matching.",
                correlation_id, emb_err,
            )
            material["embeddings"] = None

    # 4. Grounded question answering with safe error mapping
    try:
        response = await answer_grounded_question(
            chunks,
            material.get("embeddings"),
            request.history,
            clean_message,
            language=clean_lang,
            style=clean_style,
        )
    except Exception as e:
        err_msg = str(e).lower()
        logger.error(
            "[%s] Grounded chat generation failed: %s",
            correlation_id, e,
        )
        if "429" in err_msg or "quota" in err_msg or "resource_exhausted" in err_msg:
            raise HTTPException(
                status_code=429,
                detail="The AI tutor is currently experiencing high demand or rate limits. Please wait a few seconds and click Retry.",
            )
        elif "client is not initialized" in err_msg or "api_key" in err_msg:
            raise HTTPException(
                status_code=503,
                detail="AI tutor generation is temporarily unavailable because GEMINI_API_KEY is not configured.",
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"An error occurred while generating the tutor answer (ref: {correlation_id}). Please retry.",
            )

    # 5. Weak-signal mastery nudge (non-blocking)
    if response.is_grounded and response.citations:
        try:
            session = await get_session(
                clean_session_id,
                user_id=chat_user_id,
                auth_client=sb_client,
            )

            if session is not None and getattr(session, "concepts", None):
                cited_locators = {
                    c.locator for c in response.citations
                }

                topic = next(
                    (
                        concept.topic
                        for concept in session.concepts
                        if cited_locators & set(concept.locators)
                    ),
                    None,
                )

                if topic and sb_client:
                    await upsert_mastery(
                        sb_client,
                        topic,
                        is_correct=True,
                        user_id=chat_user_id,
                        is_formative_chat=True,
                    )
        except Exception as mastery_err:
            logger.warning(
                "[%s] Non-critical mastery update skipped: %s",
                correlation_id, mastery_err,
            )

    return response.model_dump()


# ============================================================
# AUDIO TRANSCRIPTION (Voice Input, Track D)
# ============================================================

@app.post("/transcribe-audio")
async def transcribe_audio_api(
    file: UploadFile = File(...),
    language: str = Form("english"),
    authorization: str | None = Header(None),
):
    correlation_id = str(uuid.uuid4())[:8]
    user_id = get_user_id(authorization)
    check_ai_rate_limit(user_id or "client")

    from AI_Layer.ai_core import client, MODEL_TEXT

    if client is None:
        raise HTTPException(
            status_code=503,
            detail="Audio transcription is unavailable because GEMINI_API_KEY is not configured.",
        )

    filename = (file.filename or "recording.webm").lower()
    SUPPORTED_AUDIO_EXTS = (".mp3", ".wav", ".m4a", ".ogg", ".webm", ".aac")
    is_valid_ext = any(filename.endswith(ext) for ext in SUPPORTED_AUDIO_EXTS)
    is_valid_mime = bool(
        file.content_type
        and (
            file.content_type.startswith("audio/")
            or file.content_type == "video/webm"
        )
    )

    if not is_valid_ext and not is_valid_mime:
        raise HTTPException(
            status_code=415,
            detail="Unsupported audio format. Flexdemy supports MP3, WAV, M4A, OGG, and WebM audio files.",
        )

    audio_bytes = await file.read()
    if not audio_bytes or len(audio_bytes) == 0:
        raise HTTPException(
            status_code=400,
            detail="Uploaded audio file is empty (0 bytes).",
        )

    MAX_AUDIO_BYTES = 5 * 1024 * 1024  # 5MB limit
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds the maximum 5MB size limit for transcription.",
        )

    mime_type = file.content_type or "audio/mp3"
    if "octet-stream" in mime_type:
        if filename.endswith(".wav"):
            mime_type = "audio/wav"
        elif filename.endswith(".m4a"):
            mime_type = "audio/m4a"
        elif filename.endswith(".ogg"):
            mime_type = "audio/ogg"
        elif filename.endswith(".webm"):
            mime_type = "audio/webm"
        else:
            mime_type = "audio/mp3"

    try:
        from google import genai
        part = genai.types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)
        lang_note = "in Hindi / Hinglish" if language == "hindi" else "in English"
        prompt = (
            f"Transcribe this spoken audio recording verbatim {lang_note}. "
            "Output ONLY the transcribed speech as plain text. "
            "Do not add timestamps, commentary, or conversational remarks."
        )
        response = await client.aio.models.generate_content(
            model=MODEL_TEXT,
            contents=[part, prompt],
        )
        transcript = (response.text or "").strip()
        return {"transcript": transcript, "language": language}
    except Exception as e:
        logger.error("[%s] Audio transcription error: %s", correlation_id, e)
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed ({correlation_id}). Please ensure clear audio and retry.",
        )


# ============================================================
# REVISION FLASHCARDS (Track D, Requirement 6b)
# ============================================================

class FlashcardRequest(BaseModel):
    session_id: str
    topic: str
    count: int = 6


@app.post("/generate-flashcards")
async def generate_flashcards_api(
    request: FlashcardRequest,
    authorization: str | None = Header(None),
):

    user_id = get_user_id(authorization)
    sb_client = get_user_client(authorization)
    check_ai_rate_limit(user_id or "client")

    from AI_Layer.ai_core import (
        generate_flashcards,
        embed_texts,
    )

    material = await get_material(
        request.session_id,
        user_id=user_id,
        auth_client=sb_client,
    )

    if material is None:
        raise HTTPException(
            status_code=404,
            detail="No ingested material found for this session.",
        )

    chunks = material["chunks"]

    if material["embeddings"] is None:
        material["embeddings"] = await embed_texts(
            [chunk.text for chunk in chunks]
        )
        await save_material(
            request.session_id,
            material,
            user_id=user_id,
            auth_client=sb_client,
        )

    session = await get_session(
        request.session_id,
        user_id=user_id,
        auth_client=sb_client,
    )
    concepts = session.concepts if session else None

    count = max(1, min(request.count, 15))

    flashcards = await generate_flashcards(
        request.topic,
        chunks,
        material.get("embeddings"),
        concepts=concepts,
        count=count,
    )

    if not flashcards:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not find anything in the uploaded material "
                "about this topic to make flashcards from."
            ),
        )

    return {
        "topic": request.topic,
        "flashcards": [f.model_dump() for f in flashcards],
    }


# ============================================================
# SOURCE FILE SERVING (for citation "open at location" links)
# ============================================================

@app.get("/materials/{session_id}/file")
async def material_file_api(
    session_id: str,
    authorization: str | None = Header(None),
):

    user_id = get_user_id(authorization)
    sb_client = get_user_client(authorization)

    material = await get_material(
        session_id,
        user_id=user_id,
        auth_client=sb_client,
    )

    if material is None or not material.get("raw_bytes"):
        raise HTTPException(
            status_code=404,
            detail="No source file found for this session.",
        )

    return Response(
        content=material["raw_bytes"],
        media_type=material["content_type"],
        headers={
            "Content-Disposition": (
                f'inline; filename="{material["filename"]}"'
            ),
        },
    )


# ============================================================
# LEARNER MASTERY
# ============================================================

@app.get("/mastery")
async def mastery_api(
    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)

    if sb_client is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in to view your mastery profile.",
        )

    mastery = await fetch_mastery(sb_client)

    return {
        "topics": mastery,
        # No mastery rows yet = this learner has no quiz/chat history
        # at all. The frontend uses this to offer a diagnostic-quiz
        # framing instead of silently defaulting every score to 0.3.
        "is_new_student": len(mastery) == 0,
    }


# ============================================================
# QUIZ HISTORY (dashboard stats survive a page refresh)
# ============================================================

class TopicBreakdownEntry(BaseModel):
    topicName: str
    score: int
    total: int
    masteryPercentage: int


class QuizHistoryEntry(BaseModel):
    quiz_id: str
    quiz_title: str
    topic: str = ""
    difficulty: str = "Medium"
    score_percentage: float
    total_questions: int
    correct_answers_count: int
    session_id: str | None = None
    topic_breakdown: list[TopicBreakdownEntry] | None = None
    question_outcomes: list[dict] | None = None


@app.post("/record-quiz-result")
async def record_quiz_result_api(
    request: QuizHistoryEntry,
    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)

    success = await record_quiz_result(
        sb_client,
        user_id,
        request.quiz_id,
        request.quiz_title,
        request.topic,
        request.difficulty,
        request.score_percentage,
        request.total_questions,
        request.correct_answers_count,
        session_id=request.session_id,
        topic_breakdown=(
            [t.model_dump() for t in request.topic_breakdown]
            if request.topic_breakdown
            else None
        ),
        question_outcomes=request.question_outcomes,
    )

    return {"recorded": success}


@app.get("/quiz-history")
async def quiz_history_api(
    authorization: str | None = Header(None),
):

    sb_client = get_user_client(authorization)

    if sb_client is None:
        raise HTTPException(
            status_code=401,
            detail="Sign in to view your quiz history.",
        )

    history = await fetch_quiz_history(sb_client)

    return {"history": history}


# ============================================================
# PERSISTENT LEARNER PROFILES & PREFERENCES
# ============================================================

class UserPreferencesPayload(BaseModel):
    language: str | None = None
    explanation_style: str | None = None
    dyslexia_mode: bool | None = None
    exam_date: str | None = None
    daily_minutes: int | None = None
    saved_schedule: dict | None = None
    completed_tasks: list[str] | None = None


@app.get("/user-preferences")
async def get_user_preferences_api(
    authorization: str | None = Header(None),
):
    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    if not user_id or not sb_client:
        return {"preferences": None}

    prefs = await fetch_user_preferences(sb_client, user_id)
    return {"preferences": prefs}


@app.post("/user-preferences")
async def save_user_preferences_api(
    payload: UserPreferencesPayload,
    authorization: str | None = Header(None),
):
    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    if not user_id or not sb_client:
        raise HTTPException(
            status_code=401,
            detail="Sign in to save your learning preferences.",
        )

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    saved = await save_user_preferences(sb_client, user_id, data)
    return {"saved": saved}


@app.get("/learner-profile")
async def get_learner_profile_api(
    authorization: str | None = Header(None),
):
    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    if not user_id or not sb_client:
        raise HTTPException(
            status_code=401,
            detail="Sign in to load your persistent learner profile.",
        )

    # 1. Fetch mastery
    mastery_dict = await fetch_mastery(sb_client)

    # 2. Fetch history
    history = await fetch_quiz_history(sb_client)

    # 3. Fetch preferences
    prefs = await fetch_user_preferences(sb_client, user_id)

    # Calculate aggregate stats
    total_quizzes = len(history)
    avg_score = round(sum(h.get("score_percentage", 0) for h in history) / total_quizzes, 1) if total_quizzes > 0 else 0
    best_score = max((h.get("score_percentage", 0) for h in history), default=0)
    total_q = sum(h.get("total_questions", 0) for h in history)
    total_correct = sum(h.get("correct_answers_count", 0) for h in history)
    accuracy = round((total_correct / total_q) * 100, 1) if total_q > 0 else 0

    # Weak topics (<0.60 BKT mastery)
    weak_topics = [
        {"topic": topic, "mastery_score": info["mastery_score"], "times_seen": info.get("times_seen", 0)}
        for topic, info in mastery_dict.items()
        if info.get("mastery_score", 0.3) < 0.60
    ]

    return {
        "user_id": user_id,
        "stats": {
            "total_quizzes": total_quizzes,
            "average_score": avg_score,
            "best_score": best_score,
            "accuracy": accuracy,
        },
        "mastery": mastery_dict,
        "weak_topics": weak_topics,
        "history": history[:15],
        "preferences": prefs,
    }


class TaskStatusRequest(BaseModel):
    task_id: str
    status: str  # 'completed' | 'uncompleted' | 'postponed'


@app.post("/study-schedule/task-status")
async def update_study_task_status_api(
    request: TaskStatusRequest,
    authorization: str | None = Header(None),
):
    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    if not user_id or not sb_client:
        return {"updated": False, "guest": True}

    ok = await update_task_status(sb_client, user_id, request.task_id, request.status)
    return {"updated": ok}


# ============================================================
# TARGETED WEAK-TOPIC REVISION (Flashcards, Notes, Audio Brief)
# ============================================================

class WeakTopicRevisionRequest(BaseModel):
    topic: str
    session_id: str | None = None
    language: str = "english"  # 'english' | 'hindi'


@app.post("/weak-topics-revision")
async def weak_topics_revision_api(
    request: WeakTopicRevisionRequest,
    authorization: str | None = Header(None),
):
    from AI_Layer.ai_core import (
        generate_flashcards,
        retrieve_relevant_chunks,
        client,
        MODEL_TEXT,
    )
    from AI_Layer.models import Flashcard

    topic = request.topic.strip()
    language = request.language.lower()
    is_hindi = language in ("hindi", "hi")

    # 1. Resolve chunks & concepts from session
    chunks = []
    concepts = []
    if request.session_id:
        session = await get_session(request.session_id)
        if session:
            chunks = session.chunks or []
            concepts = session.concepts or []
        else:
            persisted = await load_quiz_material_data(request.session_id)
            if persisted:
                chunks = persisted.get("chunks") or []

    # Fallback to in-memory material chunks if session chunks empty
    if not chunks and material_chunks_cache:
        for _hash, (_fn, c_list) in material_chunks_cache.items():
            if c_list:
                chunks = c_list
                break

    # 2. Retrieve relevant excerpts for the weak topic
    top_matches = await retrieve_relevant_chunks(chunks, None, topic, k=3) if chunks else []
    source_locators = [c.locator for c, _score in top_matches if getattr(c, "locator", None)]
    primary_locator = source_locators[0] if source_locators else "[Curriculum Core]"

    # 3. Assemble Flashcards
    flashcards: list[dict] = []
    if chunks:
        try:
            fc_list = await generate_flashcards(topic, chunks, None, concepts=concepts, count=4)
            flashcards = [f.model_dump() for f in fc_list]
        except Exception as e:
            logger.warning("generate_flashcards error in weak_topics_revision: %s", e)

    if not flashcards:
        # Fallback deterministic cards
        if is_hindi:
            flashcards = [
                {
                    "front": f"{topic}: Mukhya Siddhant Kya Hai?",
                    "back": f"{topic} ek mahatvapurna concept hai. Isko samajhne ke liye core definitions aur example applications ko dhyan se revise karein.",
                    "source_locator": primary_locator,
                },
                {
                    "front": f"{topic}: Common Mistakes se Kaise Bachein?",
                    "back": "Prashna solve karte waqt jaldbazi na karein; formula/rule ke assumptions aur edge cases ko verify karein.",
                    "source_locator": primary_locator,
                },
            ]
        else:
            flashcards = [
                {
                    "front": f"Core Principle: {topic}",
                    "back": f"Fundamental conceptual foundation of {topic}. Focus on key definitions and identifying when to apply this technique.",
                    "source_locator": primary_locator,
                },
                {
                    "front": f"Common Trap in {topic}",
                    "back": "Avoid confusing edge conditions with normal inputs. Validate prerequisites before applying final steps.",
                    "source_locator": primary_locator,
                },
            ]

    # 4. Assemble Structured Revision Notes
    excerpts_text = " ".join([c.text[:250] for c, _s in top_matches]) if top_matches else f"Key concepts and definitions in {topic}."
    
    if is_hindi:
        revision_notes = [
            {
                "title": f"1. Concept Overview: {topic}",
                "key_points": [
                    f"{topic} ki mukhya paribhasha aur uddeshya ko yaad rakhein.",
                    f"Uploaded lecture material ke anusar ({primary_locator}), is concept ko problem solving mein istemal kiya jata hai.",
                ],
                "example": f"Jaise {topic} ke standard use case mein, pehle prerequisites check hote hain.",
                "source_locator": primary_locator,
            },
            {
                "title": "2. Common Misconceptions & Traps",
                "key_points": [
                    "Formula ko bina context ke blindly apply na karein.",
                    "Negative outcomes aur boundary conditions par dhyan dein.",
                ],
                "example": "Question options mein common traps aksar sign errors ya unit mismatches hote hain.",
                "source_locator": primary_locator,
            },
            {
                "title": "3. Exam Quick Review Strategy",
                "key_points": [
                    "2-3 practice problems solve karke active recall test karein.",
                    "Weak areas par targeted diagnostic quiz lein.",
                ],
                "example": "Is topic par 5 questions ka adaptive quiz launch karein.",
                "source_locator": primary_locator,
            },
        ]
        audio_brief = (
            f"Namaste! Yeh {topic} ke liye aapka targeted revision audio brief hai. "
            f"Aapke course material ({primary_locator}) ke mutabik, {topic} ek core foundation hai. "
            f"Dhyan rakhein ki exams mein common misconceptions aksar superficial assumptions se aate hain. "
            f"Excerpts mein bataya gaya hai: {excerpts_text[:160]}... "
            f"Ab aap is topic par flashcards revise karein ya 5 questions ka practice quiz shuru karein."
        )
    else:
        revision_notes = [
            {
                "title": f"1. Concept Foundations: {topic}",
                "key_points": [
                    f"Understand the fundamental definition and purpose of {topic}.",
                    f"Grounded in your uploaded lecture notes ({primary_locator}).",
                ],
                "example": f"In typical applications of {topic}, establish baseline parameters before computing dependent terms.",
                "source_locator": primary_locator,
            },
            {
                "title": "2. Common Pitfalls & Traps to Avoid",
                "key_points": [
                    "Beware of boundary condition errors and unchecked assumptions.",
                    "Distinguish between necessary and sufficient conditions.",
                ],
                "example": "Distractor options frequently test partial applications where one prerequisite was skipped.",
                "source_locator": primary_locator,
            },
            {
                "title": "3. High-Yield Practice Recommendation",
                "key_points": [
                    "Perform active recall using the flashcards below.",
                    "Take a focused 5-question adaptive quiz to solidify your BKT mastery.",
                ],
                "example": "Aim for a P(L) mastery score above 0.75 to transition this topic from 'Needs Practice' to 'Mastered'.",
                "source_locator": primary_locator,
            },
        ]
        audio_brief = (
            f"Welcome to your targeted revision brief for {topic}. "
            f"Based on your course notes ({primary_locator}), {topic} requires careful attention to foundation principles. "
            f"Key source excerpt: {excerpts_text[:180]}... "
            f"Review the flashcards below and practice active recall before attempting your next adaptive quiz."
        )

    return {
        "topic": topic,
        "language": language,
        "primary_locator": primary_locator,
        "flashcards": flashcards,
        "revision_notes": revision_notes,
        "audio_brief": audio_brief,
        "is_grounded": bool(top_matches),
    }



# ============================================================
# POST-ANSWER EXPLANATION & QUIZ SUMMARY
# ============================================================

class ExplainAnswerRequest(BaseModel):
    question: dict
    selected_option_index: int


@app.post("/explain-answer")
async def explain_answer_api(
    request: ExplainAnswerRequest,
):

    from AI_Layer.models import QuestionDraft

    question = QuestionDraft.model_validate(request.question)

    misconception = None
    if 0 <= request.selected_option_index < len(question.options):
        misconception = question.options[request.selected_option_index].misconception_tag

    # 1. Fast deterministic path: use question's pre-bundled explanation & misconception (0 LLM tokens)
    if question.explanation and question.explanation.strip():
        text = question.explanation.strip()
        if misconception:
            text = f"[Misconception: {misconception}] {text}"
        return {
            "explanation": text,
            "source_locator": question.source_locator,
            "topic": question.topic,
            "misconception_tag": misconception,
        }

    # 2. Fallback to LLM only if explanation is absent
    from AI_Layer.ai_core import generate_explanation

    explanation = await generate_explanation(
        question,
        request.selected_option_index,
    )

    return {
        "explanation": explanation,
        "source_locator": question.source_locator,
        "topic": question.topic,
        "misconception_tag": misconception,
    }


class QuizSummaryRequest(BaseModel):
    report_data: dict


@app.post("/quiz-summary")
async def quiz_summary_api(
    request: QuizSummaryRequest,
):

    from AI_Layer.models import QuizReportData

    report_data = QuizReportData.model_validate(request.report_data)

    # Deterministic pedagogical synthesis (0 LLM calls, 0 latency, reliable under quota exhaustion)
    concepts = report_data.concepts
    total = len(concepts)
    avg_acc = sum(c.accuracy for c in concepts) / total if total > 0 else 0.0
    weakest = report_data.weakest_concept_labels
    strongest = [c.concept_label for c in concepts if c.accuracy >= 0.75]

    parts = []
    if avg_acc >= 0.80:
        parts.append(f"Exceptional performance! You demonstrated mastery ({avg_acc:.0%}) across the assessed topics.")
    elif avg_acc >= 0.50:
        parts.append(f"Solid performance! You achieved {avg_acc:.0%} accuracy, showing reliable working comprehension with specific growth areas.")
    else:
        parts.append(f"Good foundational effort ({avg_acc:.0%} accuracy). Adaptive spaced practice will help anchor concepts that need reinforcement.")

    if strongest:
        parts.append(f"Strongest topics: {', '.join(strongest[:2])}.")
    if weakest:
        parts.append(f"Priority review topics: {', '.join(weakest[:3])}. We recommend reviewing the cited excerpts or using targeted flashcards.")

    summary = " ".join(parts)

    return {"summary": summary}


# ============================================================
# STUDY SCHEDULE GENERATOR (Track D, Requirement 6c)
# Ebbinghaus Forgetting Curve & Spaced Repetition (0 LLM Tokens)
# ============================================================

class StudyScheduleRequest(BaseModel):
    days_until_exam: int = 7
    daily_minutes: int = 45
    session_id: str | None = None
    exam_date: str | None = None


@app.post("/study-schedule")
async def study_schedule_api(
    request: StudyScheduleRequest,
    authorization: str | None = Header(None),
):
    import math

    sb_client = get_user_client(authorization)
    user_id = get_user_id(authorization)
    mastery_dict = await fetch_mastery(sb_client) if sb_client else {}

    topics = list(mastery_dict.keys())
    if request.session_id:
        session = await get_session(request.session_id)
        if session:
            for c in session.concepts:
                if c.topic not in topics:
                    topics.append(c.topic)

    if not topics:
        topics = ["Core Concepts", "Foundational Principles", "Problem Solving"]

    days = max(1, min(request.days_until_exam, 60))
    minutes = max(15, min(request.daily_minutes, 180))

    # Calculate projected Ebbinghaus retention: R(t) = exp(-t / S)
    # S (Stability) scales with BKT mastery P(L): S = 1.0 + 9.0 * p_l
    topic_assessments = []
    for t in topics:
        p_l = float(mastery_dict.get(t, {}).get("mastery_score", 0.35))
        stability = 1.0 + 9.0 * p_l
        retention_at_exam = math.exp(-days / stability)
        urgency = 1.0 - retention_at_exam
        
        if p_l < 0.40:
            reason = "Low mastery (<40%) • Urgent remediation required"
        elif retention_at_exam < 0.60:
            reason = "Review due • Significant forgetting curve decay projected"
        elif p_l >= 0.75:
            reason = "Mastered topic • Periodic spaced maintenance"
        else:
            reason = "In-progress concept • Consolidation & practice"

        topic_assessments.append({
            "topic": t,
            "mastery_p": round(p_l, 3),
            "projected_retention": round(retention_at_exam, 3),
            "urgency": round(urgency, 3),
            "reason": reason,
        })

    # Prioritize lowest retention / highest urgency topics
    topic_assessments.sort(key=lambda x: x["urgency"], reverse=True)

    # Fetch already completed tasks if user is authenticated
    completed_set: set[str] = set()
    if user_id and sb_client:
        user_prefs = await fetch_user_preferences(sb_client, user_id) or {}
        completed_set = set(user_prefs.get("completed_tasks") or [])

    daily_plan = []
    for day in range(1, days + 1):
        day_topic_info = topic_assessments[(day - 1) % len(topic_assessments)]
        secondary_topic_info = topic_assessments[day % len(topic_assessments)]
        day_topic = day_topic_info["topic"]
        secondary_topic = secondary_topic_info["topic"]

        if day == days:
            stage = "Final Mock Exam & High-Yield Review"
            m1 = int(minutes * 0.6)
            m2 = minutes - m1
            tasks = [
                {
                    "id": f"d{day}_t1_mock_exam",
                    "type": "mock_exam",
                    "title": "Full Comprehensive Mock Exam across all topics",
                    "minutes": m1,
                    "reason": "Final readiness evaluation before exam",
                    "completed": f"d{day}_t1_mock_exam" in completed_set,
                },
                {
                    "id": f"d{day}_t2_flashcards",
                    "type": "flashcards",
                    "title": "Rapid flashcard review on weak spots",
                    "minutes": m2,
                    "reason": "High-speed active recall anchor",
                    "completed": f"d{day}_t2_flashcards" in completed_set,
                },
            ]
        elif day % 2 == 1:
            stage = f"Deep Dive: {day_topic}"
            m1 = int(minutes * 0.5)
            m2 = minutes - m1
            tasks = [
                {
                    "id": f"d{day}_t1_review",
                    "type": "review",
                    "title": f"Review cited lecture excerpts for {day_topic}",
                    "minutes": m1,
                    "reason": day_topic_info["reason"],
                    "completed": f"d{day}_t1_review" in completed_set,
                },
                {
                    "id": f"d{day}_t2_quiz",
                    "type": "adaptive_quiz",
                    "title": f"Adaptive practice quiz on {day_topic}",
                    "minutes": m2,
                    "reason": "Calibrate and advance BKT mastery vector",
                    "completed": f"d{day}_t2_quiz" in completed_set,
                },
            ]
        else:
            stage = f"Spaced Reinforcement: {secondary_topic}"
            m1 = int(minutes * 0.4)
            m2 = minutes - m1
            tasks = [
                {
                    "id": f"d{day}_t1_flashcards",
                    "type": "flashcards",
                    "title": f"Active recall flashcards for {secondary_topic}",
                    "minutes": m1,
                    "reason": secondary_topic_info["reason"],
                    "completed": f"d{day}_t1_flashcards" in completed_set,
                },
                {
                    "id": f"d{day}_t2_tutor",
                    "type": "tutor_chat",
                    "title": f"Socratic grounded tutor chat on misconceptions in {day_topic}",
                    "minutes": m2,
                    "reason": "Resolve identified misconceptions via cited source material",
                    "completed": f"d{day}_t2_tutor" in completed_set,
                },
            ]

        daily_plan.append({
            "day": day,
            "focus_topic": day_topic,
            "stage": stage,
            "daily_minutes": minutes,
            "tasks": tasks,
        })

    avg_retention = sum(t["projected_retention"] for t in topic_assessments) / len(topic_assessments)

    result_payload = {
        "days_until_exam": days,
        "daily_minutes": minutes,
        "projected_exam_retention": round(avg_retention, 2),
        "topics_analysis": topic_assessments,
        "schedule": daily_plan,
        "policy_note": (
            "Spaced repetition schedule is a deterministic heuristic based on Ebbinghaus "
            "forgetting curve modeling R(t) = exp(-t/S), provided as a study planning aid "
            "rather than an exact neurological prediction."
        ),
    }

    # Automatically persist schedule in user preferences if authenticated
    if user_id and sb_client:
        await save_user_preferences(sb_client, user_id, {
            "saved_schedule": result_payload,
            "daily_minutes": minutes,
            "exam_date": request.exam_date,
        })

    return result_payload


# ============================================================
# LEGACY BATCH GENERATION
# ============================================================

@app.post("/generate-quiz")
async def generate_quiz_api(
    file: UploadFile = File(...),

    difficulty: Difficulty = "easy",

    question_count: int = 10,
):

    from AI_Layer.ai_core import (
        extract_concepts,
        deduplicate_concepts,
        generate_validated_question,
    )


    question_count = max(
        1,
        min(
            question_count,
            50,
        ),
    )


    chunks = await read_uploaded_material(
        file
    )


    if not chunks:

        return {
            "filename": file.filename,
            "difficulty": difficulty,
            "concept_count": 0,
            "question_count": 0,
            "questions": [],
        }


    concept_drafts = (
        await extract_concepts(
            chunks
        )
    )


    concepts = (
        await deduplicate_concepts(
            concept_drafts,
            chunks,
        )
    )


    if not concepts:

        return {
            "filename": file.filename,
            "difficulty": difficulty,
            "concept_count": 0,
            "question_count": 0,
            "questions": [],
        }


    questions = []

    previous_questions = []


    for i in range(question_count):

        concept = concepts[
            i % len(concepts)
        ]


        question = (
            await generate_validated_question(

                concept,

                difficulty,

                previous_questions=(
                    previous_questions
                ),
            )
        )


        previous_questions.append(
            question.question_text
        )


        questions.append(
            {
                "concept": (
                    concept.model_dump()
                ),

                "question": (
                    question.model_dump()
                ),
            }
        )


    return {

        "filename": file.filename,

        "difficulty": difficulty,

        "concept_count": len(concepts),

        "question_count": len(questions),

        "questions": questions,
    }