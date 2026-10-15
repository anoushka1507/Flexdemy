import hashlib
import logging
import os

from dotenv import load_dotenv
from supabase import create_client, Client


load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SERVICE_ROLE_KEY")
)


def get_service_role_client() -> Client | None:
    """
    Administrative client using server-side service-role key.
    Bypasses RLS to persist quiz sessions and materials across Vercel cold starts safely.
    NEVER exposed to frontend/browser code.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None

    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_backend_persistence_client(auth_client: Client | None = None) -> Client | None:
    """
    Returns the secure client for server-side persistence:
    1. Service-role client if configured (preferred on backend server).
    2. User-scoped authenticated client if request has valid user JWT.
    3. None if guest without server service-role key (graceful in-memory fallback).
    """
    svc = get_service_role_client()
    if svc is not None:
        return svc
    return auth_client


def get_anon_client() -> Client | None:
    """
    DEPRECATED: Unscoped anon client. Kept only for read-only public resources.
    Never used for sensitive quiz_sessions or material tables.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_user_client(authorization_header: str | None) -> Client | None:
    """
    Build a Supabase client scoped to the requesting user via their
    session JWT, so Row Level Security enforces per-user access.
    Returns None if Supabase isn't configured, token is missing, or expired.
    """
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    if not isinstance(authorization_header, str) or not authorization_header.startswith(
        "Bearer "
    ):
        return None

    token = authorization_header.removeprefix("Bearer ").strip()
    if not token:
        return None

    # Check expiration before building client
    uid = get_user_id(authorization_header)
    if uid is None:
        return None

    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(token)
    return client


def get_user_id(authorization_header: str | None) -> str | None:
    """
    Extract the user id (JWT 'sub' claim) from the session token.
    Validates expiration claim ('exp') so expired tokens are not trusted.
    """
    if not isinstance(authorization_header, str) or not authorization_header.startswith(
        "Bearer "
    ):
        return None

    token = authorization_header.removeprefix("Bearer ").strip()
    if not token:
        return None

    try:
        import base64
        import json
        import time

        payload_b64 = token.split(".")[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(
            base64.urlsafe_b64decode(payload_b64 + padding)
        )

        exp = payload.get("exp")
        if exp and exp < time.time():
            logger.warning("get_user_id: Token expired at %s (now %s)", exp, time.time())
            return None

        return payload.get("sub")

    except Exception as e:
        logger.warning("get_user_id failed to decode token: %s", e)
        return None


def question_hash(topic: str, question_text: str) -> str:

    normalized = " ".join(
        f"{topic}|{question_text}".lower().split()
    )

    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def fetch_mastery(client: Client | None) -> dict[str, dict]:

    if client is None:
        return {}

    try:
        result = client.table("topic_mastery").select(
            "topic, mastery_score, times_seen, last_updated"
        ).execute()

        return {
            row["topic"]: {
                "mastery_score": row["mastery_score"],
                "times_seen": row["times_seen"],
                "last_updated": row["last_updated"],
            }
            for row in (result.data or [])
        }

    except Exception as e:
        logger.warning("fetch_mastery failed: %s", e)
        return {}


def bkt_update(
    p_known: float,
    is_correct: bool,
    p_transit: float = 0.15,
    p_guess: float = 0.20,
    p_slip: float = 0.10,
) -> float:
    """
    Standard Bayesian Knowledge Tracing (BKT) closed-form update (Corbett & Anderson).
    p_known: current P(L_t), prior belief the student knows the topic (0.01 - 0.99)
    is_correct: observed answer outcome (True/False)
    p_transit: P(T), transition/learning probability per opportunity (0.15)
    p_guess: P(G), guess probability (0.2 for 4-option MCQ, 0.05 for numerical)
    p_slip: P(S), careless slip probability (0.10)
    """
    p_l = max(0.01, min(0.99, float(p_known)))

    if is_correct:
        numerator = p_l * (1.0 - p_slip)
        denominator = numerator + (1.0 - p_l) * p_guess
    else:
        numerator = p_l * p_slip
        denominator = numerator + (1.0 - p_l) * (1.0 - p_slip)

    p_observed = numerator / denominator if denominator > 0 else p_l
    p_next = p_observed + (1.0 - p_observed) * p_transit
    return max(0.01, min(0.99, round(p_next, 4)))


async def upsert_mastery(
    client: Client | None,
    topic: str,
    is_correct: bool,
    learning_rate: float = 0.3,
    user_id: str | None = None,
    is_formative_chat: bool = False,
    question_type: str = "mcq",
) -> None:

    if client is None or user_id is None:
        return

    try:
        existing = client.table("topic_mastery").select(
            "mastery_score, times_seen"
        ).eq("topic", topic).limit(1).execute()

        rows = existing.data or []

        current_score = float(rows[0]["mastery_score"]) if rows else 0.30
        times_seen = int(rows[0]["times_seen"]) if rows else 0

        if is_formative_chat:
            # Student asked about this topic in chat: record engagement without artificially inflating mastery score
            new_score = current_score
        else:
            # Standard BKT update: 0 LLM calls, pure psychometric math
            p_guess = 0.05 if question_type in ("numerical", "short_answer") else 0.20
            new_score = bkt_update(current_score, is_correct, p_guess=p_guess)

        new_score = max(0.01, min(0.99, round(new_score, 4)))

        client.table("topic_mastery").upsert(
            {
                "user_id": user_id,
                "topic": topic,
                "mastery_score": new_score,
                "times_seen": times_seen + 1,
            },
            on_conflict="user_id,topic",
        ).execute()

    except Exception as e:
        logger.warning("upsert_mastery failed: %s", e)


async def fetch_asked_question_texts(
    client: Client | None,
    topic: str,
) -> list[str]:

    if client is None:
        return []

    try:
        result = client.table("asked_questions").select(
            "question_text"
        ).eq("topic", topic).order(
            "created_at", desc=True
        ).limit(20).execute()

        return [row["question_text"] for row in (result.data or [])]

    except Exception as e:
        logger.warning("fetch_asked_question_texts failed: %s", e)
        return []


async def record_asked_question(
    client: Client | None,
    topic: str,
    question_text: str,
    user_id: str | None = None,
) -> None:

    if client is None or user_id is None:
        return

    try:
        client.table("asked_questions").upsert(
            {
                "user_id": user_id,
                "topic": topic,
                "question_text": question_text,
                "question_hash": question_hash(topic, question_text),
            },
            on_conflict="user_id,question_hash",
        ).execute()

    except Exception as e:
        logger.warning("record_asked_question failed: %s", e)


# ============================================================
# QUIZ SESSION PERSISTENCE (survives serverless cold starts)
# ============================================================

async def save_quiz_session_data(
    session_id: str,
    session_json: dict,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return

    try:
        payload = {
            "session_id": session_id,
            "session_data": session_json,
            "updated_at": "now()",
        }
        if user_id:
            payload["user_id"] = user_id

        client.table("quiz_sessions").upsert(
            payload,
            on_conflict="session_id",
        ).execute()

    except Exception as e:
        logger.warning("save_quiz_session_data failed: %s", e)


async def load_quiz_session_data(
    session_id: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> dict | None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return None

    try:
        result = client.table("quiz_sessions").select(
            "session_data, user_id"
        ).eq("session_id", session_id).limit(1).execute()

        rows = result.data or []

        if not rows or rows[0].get("session_data") is None:
            return None

        row = rows[0]
        # Authorization check: If row is owned by a specific user, verify identity
        session_owner = row.get("user_id")
        if session_owner and user_id and session_owner != user_id:
            logger.warning("Unauthorized attempt to load session %s by user %s", session_id, user_id)
            return None

        return rows[0]["session_data"]

    except Exception as e:
        logger.warning("load_quiz_session_data failed: %s", e)
        return None


async def save_quiz_material_data(
    session_id: str,
    chunks_json: list[dict],
    embeddings_json: list | None,
    raw_bytes: bytes | None,
    content_type: str,
    filename: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return

    try:
        import base64

        payload = {
            "session_id": session_id,
            "material_chunks": chunks_json,
            "material_embeddings": embeddings_json,
            "material_content_type": content_type,
            "material_filename": filename,
            "updated_at": "now()",
        }

        if user_id:
            payload["user_id"] = user_id

        if raw_bytes is not None:
            payload["material_raw_file_b64"] = base64.b64encode(
                raw_bytes
            ).decode("ascii")

        client.table("quiz_sessions").upsert(
            payload,
            on_conflict="session_id",
        ).execute()

    except Exception as e:
        logger.warning("save_quiz_material_data failed: %s", e)


async def load_quiz_material_data(
    session_id: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> dict | None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return None

    try:
        result = client.table("quiz_sessions").select(
            "material_chunks, material_embeddings, "
            "material_raw_file_b64, material_content_type, "
            "material_filename, user_id"
        ).eq("session_id", session_id).limit(1).execute()

        rows = result.data or []

        if not rows or rows[0].get("material_chunks") is None:
            return None

        row = rows[0]
        session_owner = row.get("user_id")
        if session_owner and user_id and session_owner != user_id:
            logger.warning("Unauthorized attempt to load material for session %s", session_id)
            return None

        import base64

        raw_bytes = (
            base64.b64decode(row["material_raw_file_b64"])
            if row.get("material_raw_file_b64")
            else None
        )

        return {
            "chunks": row["material_chunks"],
            "embeddings": row.get("material_embeddings"),
            "raw_bytes": raw_bytes,
            "content_type": (
                row.get("material_content_type")
                or "application/octet-stream"
            ),
            "filename": row.get("material_filename") or "material",
        }

    except Exception as e:
        logger.warning("load_quiz_material_data failed: %s", e)
        return None


# ============================================================
# DURABLE MATERIAL & CONCEPT CACHE (prevents duplicate processing on Vercel)
# ============================================================

async def save_cached_material(
    content_hash: str,
    chunks_json: list[dict],
    concept_drafts_json: list[dict],
    content_type: str,
    filename: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return

    try:
        payload = {
            "content_hash": content_hash,
            "material_chunks": chunks_json,
            "concept_drafts": concept_drafts_json,
            "material_content_type": content_type,
            "material_filename": filename,
        }
        if user_id:
            payload["user_id"] = user_id

        client.table("material_cache").upsert(
            payload,
            on_conflict="content_hash",
        ).execute()
    except Exception as e:
        logger.warning("save_cached_material failed: %s", e)


async def load_cached_material(
    content_hash: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> dict | None:
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return None

    try:
        result = client.table("material_cache").select(
            "material_chunks, concept_drafts, material_content_type, material_filename, user_id"
        ).eq("content_hash", content_hash).limit(1).execute()

        rows = result.data or []
        if not rows:
            return None

        row = rows[0]
        owner = row.get("user_id")
        if owner and user_id and owner != user_id:
            return None

        return {
            "chunks": row.get("material_chunks") or [],
            "concept_drafts": row.get("concept_drafts") or [],
            "content_type": row.get("material_content_type") or "application/octet-stream",
            "filename": row.get("material_filename") or "material",
        }
    except Exception as e:
        logger.warning("load_cached_material failed: %s", e)
        return None


# ============================================================
# QUIZ HISTORY (dashboard stats survive a page refresh)
# ============================================================

async def record_quiz_result(
    client: Client | None,
    user_id: str | None,
    quiz_id: str,
    quiz_title: str,
    topic: str,
    difficulty: str,
    score_percentage: float,
    total_questions: int,
    correct_answers_count: int,
    session_id: str | None = None,
    topic_breakdown: list | None = None,
    question_outcomes: list | None = None,
) -> bool:

    if client is None or user_id is None:
        return False

    payload = {
        "user_id": user_id,
        "quiz_id": quiz_id,
        "quiz_title": quiz_title,
        "topic": topic,
        "difficulty": difficulty,
        "score_percentage": score_percentage,
        "total_questions": total_questions,
        "correct_answers_count": correct_answers_count,
        "session_id": session_id,
        "topic_breakdown": topic_breakdown,
        "question_outcomes": question_outcomes,
    }

    try:
        # Idempotent upsert on (user_id, quiz_id) prevents double-counting answers
        client.table("quiz_history").upsert(
            payload,
            on_conflict="user_id,quiz_id",
        ).execute()
        return True
    except Exception as e:
        logger.warning("record_quiz_result upsert failed: %s; attempting standard insert", e)
        try:
            client.table("quiz_history").insert(payload).execute()
            return True
        except Exception as e2:
            logger.error("record_quiz_result insert failed: %s", e2)
            return False


async def fetch_quiz_history(client: Client | None) -> list[dict]:

    if client is None:
        return []

    try:
        result = client.table("quiz_history").select("*").order(
            "completed_at", desc=True
        ).limit(50).execute()

        return result.data or []

    except Exception as e:
        logger.warning("fetch_quiz_history failed: %s", e)
        return []


# ============================================================
# PERSISTENT USER PREFERENCES & STUDY SCHEDULES
# ============================================================

async def fetch_user_preferences(
    client: Client | None,
    user_id: str | None,
) -> dict | None:
    if client is None or user_id is None:
        return None

    try:
        result = client.table("user_preferences").select("*").eq("user_id", user_id).limit(1).execute()
        rows = result.data or []
        if rows:
            return rows[0]
        return None
    except Exception as e:
        logger.warning("fetch_user_preferences failed: %s", e)
        return None


async def save_user_preferences(
    client: Client | None,
    user_id: str | None,
    preferences: dict,
) -> bool:
    if client is None or user_id is None:
        return False

    try:
        payload = {
            "user_id": user_id,
            **preferences,
            "updated_at": "now()",
        }
        client.table("user_preferences").upsert(
            payload,
            on_conflict="user_id",
        ).execute()
        return True
    except Exception as e:
        logger.warning("save_user_preferences failed: %s", e)
        return False


async def update_task_status(
    client: Client | None,
    user_id: str | None,
    task_id: str,
    status: str,
) -> bool:
    if client is None or user_id is None:
        return False

    try:
        current_prefs = await fetch_user_preferences(client, user_id) or {}
        completed_tasks = current_prefs.get("completed_tasks") or []
        if isinstance(completed_tasks, list):
            completed_set = set(completed_tasks)
        else:
            completed_set = set()

        if status == "completed":
            completed_set.add(task_id)
        elif status in ("uncompleted", "postponed"):
            completed_set.discard(task_id)

        return await save_user_preferences(client, user_id, {
            "completed_tasks": list(completed_set),
        })
    except Exception as e:
        logger.warning("update_task_status failed: %s", e)
        return False

