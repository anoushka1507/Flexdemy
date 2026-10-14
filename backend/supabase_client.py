import hashlib
import logging
import os

from dotenv import load_dotenv
from supabase import create_client, Client


load_dotenv()

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = (
    os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY")
)


def get_anon_client() -> Client | None:
    """
    Unscoped client (no user JWT) for state that isn't tied to a
    logged-in user — quiz sessions are addressed purely by their
    session_id, same as the in-memory dict they replace.
    """

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_user_client(authorization_header: str | None) -> Client | None:
    """
    Build a Supabase client scoped to the requesting user via their
    session JWT, so Row Level Security enforces per-user access.
    Returns None if Supabase isn't configured or no token was given —
    callers must treat persistence as best-effort in that case.
    """

    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        return None

    if not authorization_header or not authorization_header.startswith(
        "Bearer "
    ):
        return None

    token = authorization_header.removeprefix("Bearer ").strip()

    if not token:
        return None

    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(token)

    return client


def get_user_id(authorization_header: str | None) -> str | None:
    """
    Extract the user id (JWT 'sub' claim) from the session token so
    writes can set user_id explicitly — RLS's WITH CHECK validates
    it, but does not fill it in for us, and the not-null columns on
    topic_mastery/asked_questions reject an insert that omits it.
    Decoded locally (no signature check) purely to get the id to
    write; RLS at the database is still the real security boundary.
    """

    if not authorization_header or not authorization_header.startswith(
        "Bearer "
    ):
        return None

    token = authorization_header.removeprefix("Bearer ").strip()

    try:
        import base64
        import json

        payload_b64 = token.split(".")[1]
        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(
            base64.urlsafe_b64decode(payload_b64 + padding)
        )

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


async def upsert_mastery(
    client: Client | None,
    topic: str,
    is_correct: bool,
    learning_rate: float = 0.3,
    user_id: str | None = None,
) -> None:

    if client is None or user_id is None:
        return

    try:
        existing = client.table("topic_mastery").select(
            "mastery_score, times_seen"
        ).eq("topic", topic).limit(1).execute()

        rows = existing.data or []

        current_score = rows[0]["mastery_score"] if rows else 0.3
        times_seen = rows[0]["times_seen"] if rows else 0

        target = 1.0 if is_correct else 0.0

        new_score = (
            current_score
            + learning_rate * (target - current_score)
        )

        new_score = max(0.0, min(1.0, new_score))

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
) -> None:

    client = get_anon_client()

    if client is None:
        return

    try:
        client.table("quiz_sessions").upsert(
            {
                "session_id": session_id,
                "session_data": session_json,
            },
            on_conflict="session_id",
        ).execute()

    except Exception as e:
        logger.warning("save_quiz_session_data failed: %s", e)


async def load_quiz_session_data(session_id: str) -> dict | None:

    client = get_anon_client()

    if client is None:
        return None

    try:
        result = client.table("quiz_sessions").select(
            "session_data"
        ).eq("session_id", session_id).limit(1).execute()

        rows = result.data or []

        if not rows or rows[0].get("session_data") is None:
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
) -> None:

    client = get_anon_client()

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
        }

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


async def load_quiz_material_data(session_id: str) -> dict | None:

    client = get_anon_client()

    if client is None:
        return None

    try:
        result = client.table("quiz_sessions").select(
            "material_chunks, material_embeddings, "
            "material_raw_file_b64, material_content_type, "
            "material_filename"
        ).eq("session_id", session_id).limit(1).execute()

        rows = result.data or []

        if not rows or rows[0].get("material_chunks") is None:
            return None

        row = rows[0]

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
) -> None:

    if client is None or user_id is None:
        return

    try:
        client.table("quiz_history").insert(
            {
                "user_id": user_id,
                "quiz_id": quiz_id,
                "quiz_title": quiz_title,
                "topic": topic,
                "difficulty": difficulty,
                "score_percentage": score_percentage,
                "total_questions": total_questions,
                "correct_answers_count": correct_answers_count,
            }
        ).execute()

    except Exception as e:
        logger.warning("record_quiz_result failed: %s", e)


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
