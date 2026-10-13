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


def question_hash(topic: str, question_text: str) -> str:

    normalized = " ".join(
        f"{topic}|{question_text}".lower().split()
    )

    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def fetch_mastery(client: Client | None) -> dict[str, float]:

    if client is None:
        return {}

    try:
        result = client.table("topic_mastery").select(
            "topic, mastery_score"
        ).execute()

        return {
            row["topic"]: row["mastery_score"]
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
) -> None:

    if client is None:
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
) -> None:

    if client is None:
        return

    try:
        client.table("asked_questions").upsert(
            {
                "topic": topic,
                "question_text": question_text,
                "question_hash": question_hash(topic, question_text),
            },
            on_conflict="user_id,question_hash",
        ).execute()

    except Exception as e:
        logger.warning("record_asked_question failed: %s", e)
