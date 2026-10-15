import hashlib
import logging
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from supabase import create_client, Client


load_dotenv()

logger = logging.getLogger(__name__)

def current_utc_iso() -> str:
    """Returns current UTC timestamp in ISO 8601 format required by PostgreSQL/PostgREST."""
    return datetime.now(timezone.utc).isoformat()

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = (
    os.getenv("VITE_SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("SUPABASE_KEY")
    or ""
)
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
    3. Anon client as capability-token fallback for guest/serverless requests.
    """
    svc = get_service_role_client()
    if svc is not None:
        return svc
    if auth_client is not None:
        return auth_client
    return get_anon_client()


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
            "updated_at": current_utc_iso(),
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
            "updated_at": current_utc_iso(),
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
    attempt_id: str | None = None,
    user_answers: dict | None = None,
) -> bool:
    db_client = get_backend_persistence_client(client)
    if db_client is None or user_id is None:
        logger.warning("record_quiz_result aborted: db_client or user_id is None (user_id=%s)", user_id)
        return False

    completed_time = current_utc_iso()
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
        "completed_at": completed_time,
        "status": "completed",
    }
    if attempt_id:
        payload["attempt_id"] = attempt_id
    if user_answers:
        payload["user_answers"] = user_answers

    try:
        # Idempotent upsert on (user_id, quiz_id) prevents double-counting answers
        db_client.table("quiz_history").upsert(
            payload,
            on_conflict="user_id,quiz_id",
        ).execute()
        return True
    except Exception as e:
        logger.warning("record_quiz_result full upsert failed: %s; attempting core schema fallback", e)
        # Fallback to core fields in case un-migrated database lacks attempt_id/user_answers/status
        core_payload = {
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
            "completed_at": completed_time,
        }
        try:
            db_client.table("quiz_history").upsert(
                core_payload,
                on_conflict="user_id,quiz_id",
            ).execute()
            return True
        except Exception as e2:
            logger.warning("record_quiz_result core upsert failed: %s; attempting insert", e2)
            try:
                db_client.table("quiz_history").insert(core_payload).execute()
                return True
            except Exception as e3:
                logger.error("record_quiz_result insert failed completely: %s", e3)
                return False


async def fetch_quiz_history(
    client: Client | None,
    user_id: str | None = None,
) -> list[dict]:
    db_client = get_backend_persistence_client(client)
    if db_client is None:
        return []

    try:
        query = db_client.table("quiz_history").select("*")
        if user_id:
            query = query.eq("user_id", user_id)
        result = query.order(
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
            "updated_at": current_utc_iso(),
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


# ============================================================
# USER PROFILES & ACCOUNT DATA MANAGEMENT
# ============================================================

async def fetch_user_profile(
    client: Client | None,
    user_id: str | None,
) -> dict | None:
    if client is None or user_id is None:
        return None

    try:
        result = client.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        rows = result.data or []
        if rows:
            return rows[0]
        return None
    except Exception as e:
        logger.warning("fetch_user_profile failed: %s", e)
        return None


async def save_user_profile(
    client: Client | None,
    user_id: str | None,
    profile_data: dict,
) -> bool:
    if client is None or user_id is None:
        return False

    try:
        payload = {
            "id": user_id,
            **profile_data,
            "updated_at": current_utc_iso(),
        }
        client.table("profiles").upsert(
            payload,
            on_conflict="id",
        ).execute()
        return True
    except Exception as e:
        logger.warning("save_user_profile failed: %s", e)
        return False


async def reset_user_learning_data(
    client: Client | None,
    user_id: str | None,
) -> bool:
    if client is None or user_id is None:
        return False

    try:
        # Clear quiz history
        try:
            client.table("quiz_history").delete().eq("user_id", user_id).execute()
        except Exception as e_qh:
            logger.warning("Clear quiz_history error: %s", e_qh)

        # Clear topic mastery
        try:
            client.table("topic_mastery").delete().eq("user_id", user_id).execute()
        except Exception as e_tm:
            logger.warning("Clear topic_mastery error: %s", e_tm)

        # Clear owned material collections
        try:
            client.table("material_collections").delete().eq("user_id", user_id).execute()
        except Exception as e_mc:
            logger.warning("Clear material_collections error: %s", e_mc)

        return True
    except Exception as e:
        logger.warning("reset_user_learning_data failed: %s", e)
        return False


# ============================================================
# MATERIAL COLLECTION PERSISTENCE
# Multi-file ingestion: stable collection IDs survive across cold starts.
# ============================================================

def is_valid_uuid(val: object) -> bool:
    """Check if value is a valid UUID string to prevent PostgreSQL syntax errors."""
    if not val or not isinstance(val, str):
        return False
    try:
        import uuid as _uuid
        _uuid.UUID(val)
        return True
    except (ValueError, AttributeError):
        return False


def _get_collections_disk_dir() -> str:
    import tempfile
    d = os.path.join(tempfile.gettempdir(), "flexdemy_material_collections")
    os.makedirs(d, exist_ok=True)
    return d


def _save_collection_to_disk(collection_id: str, data: dict) -> None:
    if not collection_id or not isinstance(data, dict):
        return
    try:
        import json as _json
        p = os.path.join(_get_collections_disk_dir(), f"{collection_id}.json")
        with open(p, "w", encoding="utf-8") as f:
            _json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.warning("Disk cache save failed for collection %s: %s", collection_id, e)


def _load_collection_from_disk(collection_id: str) -> dict | None:
    if not collection_id:
        return None
    try:
        import json as _json
        p = os.path.join(_get_collections_disk_dir(), f"{collection_id}.json")
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return _json.load(f)
    except Exception as e:
        logger.warning("Disk cache load failed for collection %s: %s", collection_id, e)
    return None


async def save_material_collection(
    collection_id: object = None,
    collection_data: object = None,
    user_id: str | None = None,
    auth_client: Client | None = None,
    *args: object,
    **kwargs: object,
) -> bool:
    """
    Persist a serialized MaterialCollection to disk and Supabase material_collections table.
    Robust against argument ordering:
    - Standard: save_material_collection(collection_id, collection_data, user_id=..., auth_client=...)
    - Positional legacy: save_material_collection(auth_client, user_id, collection_data)
    """
    cid = None
    cdata = None

    if isinstance(collection_id, str) and collection_id.strip():
        cid = collection_id.strip()
        cdata = collection_data
    elif isinstance(collection_data, dict):
        cdata = collection_data
        cid = cdata.get("collection_id")
    elif isinstance(user_id, dict):
        # Inverted call pattern: save_material_collection(auth_client, user_id, collection_data)
        auth_client = collection_id if not isinstance(collection_id, str) else auth_client
        user_id_val = collection_data if isinstance(collection_data, str) else None
        cdata = user_id
        user_id = user_id_val
        cid = cdata.get("collection_id")

    if not cid and isinstance(cdata, dict):
        cid = cdata.get("collection_id")

    if not cid or not isinstance(cdata, dict):
        logger.warning("save_material_collection: invalid collection_id=%s or collection_data=%s", cid, type(cdata))
        return False

    # 1. Always persist to disk cache first for zero-latency local/warm retrieval
    _save_collection_to_disk(cid, cdata)

    # 2. Persist to Supabase for durable cross-serverless persistence
    client = get_backend_persistence_client(auth_client)
    if client is None:
        return True

    try:
        payload: dict = {
            "collection_id": cid,
            "collection_data": cdata,
            "updated_at": current_utc_iso(),
        }
        if user_id and is_valid_uuid(user_id):
            payload["user_id"] = user_id

        client.table("material_collections").upsert(
            payload,
            on_conflict="collection_id",
        ).execute()
        return True
    except Exception as e:
        logger.warning("save_material_collection Supabase upsert failed for %s: %s", cid, e)
        # Disk cache succeeded, so attempt is not lost
        return True


async def load_material_collection(
    collection_id: str,
    user_id: str | None = None,
    auth_client: Client | None = None,
) -> dict | None:
    """
    Load a serialized MaterialCollection from Supabase or disk cache.
    Returns None if not found or if ownership check fails.
    """
    if not collection_id or not isinstance(collection_id, str):
        return None
    cid = collection_id.strip()

    # 1. Try Supabase first
    client = get_backend_persistence_client(auth_client)
    if client is not None:
        try:
            result = client.table("material_collections").select(
                "collection_data, user_id"
            ).eq("collection_id", cid).limit(1).execute()

            rows = result.data or []
            if rows and rows[0].get("collection_data"):
                row = rows[0]
                owner = row.get("user_id")
                if owner and user_id and is_valid_uuid(user_id) and owner != user_id:
                    logger.warning(
                        "Unauthorized attempt to load collection %s by user %s",
                        cid, user_id,
                    )
                    return None
                data = row.get("collection_data")
                if isinstance(data, dict):
                    _save_collection_to_disk(cid, data)
                    return data
        except Exception as e:
            logger.warning("load_material_collection Supabase query failed for %s: %s", cid, e)

    # 2. Fallback to local disk cache
    disk_data = _load_collection_from_disk(cid)
    if disk_data and isinstance(disk_data, dict):
        owner = disk_data.get("user_id")
        if owner and user_id and is_valid_uuid(user_id) and owner != user_id:
            logger.warning("Unauthorized disk cache access for collection %s by %s", cid, user_id)
            return None
        return disk_data

    return None


async def list_user_collections(
    user_id: str | None,
    auth_client: Client | None = None,
    limit: int = 20,
) -> list[dict]:
    """List all collection metadata records for a user (no chunks, no concepts)."""
    client = get_backend_persistence_client(auth_client)
    if client is None or not user_id:
        return []

    try:
        result = client.table("material_collections").select(
            "collection_id, collection_data->>'name' AS name, "
            "collection_data->>'updated_at' AS updated_at, user_id"
        ).eq("user_id", user_id).order("updated_at", desc=True).limit(limit).execute()
        return result.data or []
    except Exception as e:
        logger.warning("list_user_collections failed: %s", e)
        return []


# ============================================================
# SAVED LEARNING PATHS (Course flows persisted to user profile)
# ============================================================

_in_memory_learning_paths: dict[str, list[dict]] = {}

async def fetch_saved_learning_paths(
    client: Client | None,
    user_id: str | None,
) -> list[dict]:
    """Fetch all saved learning paths for a user, ordered by updated_at desc."""
    if not user_id:
        return []

    if client is not None:
        try:
            result = client.table("saved_learning_paths").select("*").eq(
                "user_id", user_id
            ).order("updated_at", desc=True).limit(50).execute()
            if result.data is not None:
                return result.data
        except Exception as e:
            logger.warning("fetch_saved_learning_paths from Supabase failed: %s; falling back to in-memory store", e)

    return _in_memory_learning_paths.get(user_id, [])


async def save_learning_path(
    client: Client | None,
    user_id: str | None,
    path_data: dict,
) -> bool:
    """Save or update a learning path for the user."""
    if not user_id:
        return False

    path_id = path_data.get("id")
    if not path_id:
        import uuid
        path_id = str(uuid.uuid4())
        path_data["id"] = path_id

    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    path_data["updated_at"] = now_iso
    if "created_at" not in path_data:
        path_data["created_at"] = now_iso
    path_data["user_id"] = user_id

    # 1. Update in-memory fallback store
    user_paths = _in_memory_learning_paths.setdefault(user_id, [])
    existing_idx = next((i for i, p in enumerate(user_paths) if p.get("id") == path_id), None)
    if existing_idx is not None:
        user_paths[existing_idx] = path_data
    else:
        user_paths.insert(0, path_data)

    # 2. Persist to Supabase if client available
    if client is not None:
        try:
            client.table("saved_learning_paths").upsert(
                path_data,
                on_conflict="id",
            ).execute()
            return True
        except Exception as e:
            logger.warning("save_learning_path upsert failed: %s; attempting insert", e)
            try:
                client.table("saved_learning_paths").insert(path_data).execute()
                return True
            except Exception as e2:
                logger.error("save_learning_path insert failed: %s", e2)

    return True


async def delete_learning_path(
    client: Client | None,
    user_id: str | None,
    path_id: str,
) -> bool:
    """Delete a saved learning path."""
    if not user_id or not path_id:
        return False

    # 1. Remove from in-memory fallback
    if user_id in _in_memory_learning_paths:
        _in_memory_learning_paths[user_id] = [
            p for p in _in_memory_learning_paths[user_id] if p.get("id") != path_id
        ]

    # 2. Remove from Supabase
    if client is not None:
        try:
            client.table("saved_learning_paths").delete().eq(
                "id", path_id
            ).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.warning("delete_learning_path failed: %s", e)

    return True


# ============================================================
# FLASHCARD DECKS & SPACED REPETITION REVIEWS
# ============================================================

_in_memory_flashcard_decks: dict[str, list[dict]] = {}
_in_memory_flashcard_reviews: dict[str, list[dict]] = {}

async def fetch_flashcard_decks(
    client: Client | None,
    user_id: str | None,
) -> list[dict]:
    """Fetch all flashcard decks for a user, ordered by updated_at desc."""
    if not user_id:
        return []

    if client is not None:
        try:
            result = client.table("flashcard_decks").select("*").eq(
                "user_id", user_id
            ).order("updated_at", desc=True).limit(50).execute()
            if result.data is not None:
                return result.data
        except Exception as e:
            logger.warning("fetch_flashcard_decks from Supabase failed: %s; falling back to in-memory store", e)

    return _in_memory_flashcard_decks.get(user_id, [])


async def save_flashcard_deck(
    client: Client | None,
    user_id: str | None,
    deck_data: dict,
) -> bool:
    """Save or update a flashcard deck for the user."""
    if not user_id:
        return False

    deck_id = deck_data.get("deck_id")
    if not deck_id:
        import uuid
        deck_id = str(uuid.uuid4())
        deck_data["deck_id"] = deck_id

    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    deck_data["updated_at"] = now_iso
    if "created_at" not in deck_data:
        deck_data["created_at"] = now_iso
    deck_data["user_id"] = user_id

    # 1. Update in-memory fallback
    user_decks = _in_memory_flashcard_decks.setdefault(user_id, [])
    existing_idx = next((i for i, d in enumerate(user_decks) if d.get("deck_id") == deck_id), None)
    if existing_idx is not None:
        user_decks[existing_idx] = deck_data
    else:
        user_decks.insert(0, deck_data)

    # 2. Persist to Supabase
    if client is not None:
        try:
            client.table("flashcard_decks").upsert(
                deck_data,
                on_conflict="deck_id",
            ).execute()
            return True
        except Exception as e:
            logger.warning("save_flashcard_deck upsert failed: %s; attempting insert", e)
            try:
                client.table("flashcard_decks").insert(deck_data).execute()
                return True
            except Exception as e2:
                logger.error("save_flashcard_deck insert failed: %s", e2)

    return True


async def delete_flashcard_deck(
    client: Client | None,
    user_id: str | None,
    deck_id: str,
) -> bool:
    """Delete a flashcard deck."""
    if not user_id or not deck_id:
        return False

    # 1. Remove from in-memory fallback
    if user_id in _in_memory_flashcard_decks:
        _in_memory_flashcard_decks[user_id] = [
            d for d in _in_memory_flashcard_decks[user_id] if d.get("deck_id") != deck_id
        ]

    # 2. Remove from Supabase
    if client is not None:
        try:
            client.table("flashcard_decks").delete().eq(
                "deck_id", deck_id
            ).eq("user_id", user_id).execute()
            return True
        except Exception as e:
            logger.warning("delete_flashcard_deck failed: %s", e)

    return True


async def record_flashcard_review(
    client: Client | None,
    user_id: str | None,
    deck_id: str,
    card_id: str,
    rating: str,
    interval_days: int,
) -> bool:
    """Record an SRS review event and update the card within the deck."""
    if not user_id or not deck_id or not card_id:
        return False

    import datetime
    import uuid
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()
    review_record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "deck_id": deck_id,
        "card_id": card_id,
        "rating": rating,
        "interval_days": interval_days,
        "reviewed_at": now_iso,
    }

    # Record review in in-memory list
    _in_memory_flashcard_reviews.setdefault(user_id, []).append(review_record)

    # Also update the card in the in-memory deck
    user_decks = _in_memory_flashcard_decks.get(user_id, [])
    deck = next((d for d in user_decks if d.get("deck_id") == deck_id), None)
    if deck and "cards" in deck:
        for card in deck["cards"]:
            if card.get("id") == card_id:
                card["last_reviewed"] = now_iso
                card["last_rating"] = rating
                card["interval_days"] = interval_days
                next_rev = now + datetime.timedelta(days=interval_days)
                card["next_review"] = next_rev.isoformat()
                break

    if client is not None:
        try:
            client.table("flashcard_reviews").insert(review_record).execute()
        except Exception as e:
            logger.warning("record_flashcard_review insert failed: %s", e)

        # Update deck cards in Supabase
        if deck:
            try:
                client.table("flashcard_decks").update({
                    "cards": deck["cards"],
                    "updated_at": now_iso,
                }).eq("deck_id", deck_id).eq("user_id", user_id).execute()
            except Exception as e:
                logger.warning("record_flashcard_review deck cards update failed: %s", e)

    return True

