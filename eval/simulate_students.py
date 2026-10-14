"""
Track D, Requirement 5c: simulated-student personalization evaluation.

Runs a simulated student profile through the LIVE adaptive quiz HTTP
API across MULTIPLE separate sessions (not just one quiz), as a real
authenticated user, and reports:

  - mastery gain ACROSS sessions: per-topic mastery before the first
    session vs. after the last one (should trend up for a strong
    profile, stay low/flat for a weak one)
  - mastery gain WITHIN each session: first-half vs second-half
    accuracy
  - difficulty trajectory per session
  - question repetition rate, including across sessions (the
    asked_questions dedup should keep this low even on repeat runs)

Requires a real, email-confirmed Supabase account (email/password)
passed via EVAL_EMAIL / EVAL_PASSWORD env vars, since mastery only
persists for an authenticated user.
"""

import json
import os
import random
import sys
import time

import requests


EVAL_DIR = os.path.dirname(os.path.abspath(__file__))
MATERIAL_PATH = os.path.join(EVAL_DIR, "material.txt")

SUPABASE_URL = "https://tgvsvqleocuhqcjwncyt.supabase.co"


def get_anon_key() -> str:

    env_path = os.path.join(
        os.path.dirname(EVAL_DIR), ".env"
    )

    with open(env_path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("VITE_SUPABASE_ANON_KEY="):
                return line.split("=", 1)[1].strip()

    raise RuntimeError("VITE_SUPABASE_ANON_KEY not found in .env")


def sign_in(email: str, password: str) -> str:

    response = requests.post(
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": get_anon_key()},
        json={"email": email, "password": password},
    )
    response.raise_for_status()

    return response.json()["access_token"]


def fetch_mastery(base_url: str, token: str) -> dict:

    response = requests.get(
        f"{base_url}/mastery",
        headers={"Authorization": f"Bearer {token}"},
    )
    response.raise_for_status()

    return response.json().get("topics", {})


def run_session(
    base_url: str,
    token: str,
    profile: dict,
    question_count: int,
) -> dict:

    headers = {"Authorization": f"Bearer {token}"}

    with open(MATERIAL_PATH, "rb") as f:
        response = requests.post(
            f"{base_url}/start-adaptive-quiz",
            params={
                "difficulty": "medium",
                "question_count": question_count,
                "question_types": "mcq",
            },
            files={"file": ("material.txt", f, "text/plain")},
            headers=headers,
        )

    response.raise_for_status()
    data = response.json()

    session_id = data["session_id"]
    question = data["question"]

    history = []
    asked_question_texts = []

    for _ in range(question_count):

        asked_question_texts.append(question["question_text"])

        correct_index = next(
            (i for i, opt in enumerate(question["options"]) if opt["is_correct"]),
            0,
        )

        is_correct_roll = random.random() < profile["correct_probability"]

        selected_index = (
            correct_index
            if is_correct_roll
            else next(
                (i for i in range(len(question["options"])) if i != correct_index),
                correct_index,
            )
        )

        # Pace requests to stay under the Gemini free-tier 15/min
        # cap — each question costs up to 2 calls (generate +
        # validate), so ~8s between questions stays safely under it.
        time.sleep(8)

        answer_response = requests.post(
            f"{base_url}/answer-adaptive-question",
            json={
                "session_id": session_id,
                "question_number": data.get("question_number", 1),
                "selected_option_index": selected_index,
            },
            headers=headers,
        )

        answer_response.raise_for_status()
        result = answer_response.json()

        history.append(
            {
                "was_correct": result["was_correct"],
                "difficulty": result["answered_difficulty"],
            }
        )

        if result["completed"]:
            break

        question = result["question"]
        data["question_number"] = result["next_question_number"]

    half = max(1, len(history) // 2)
    first_half_acc = sum(h["was_correct"] for h in history[:half]) / half
    second_half = history[half:]
    second_half_acc = (
        sum(h["was_correct"] for h in second_half) / len(second_half)
        if second_half else None
    )

    unique_questions = len(set(asked_question_texts))
    repetition_rate = 1 - (unique_questions / len(asked_question_texts))

    return {
        "n_questions": len(history),
        "first_half_accuracy": round(first_half_acc, 2),
        "second_half_accuracy": (
            round(second_half_acc, 2) if second_half_acc is not None else None
        ),
        "difficulty_trajectory": [h["difficulty"] for h in history],
        "question_repetition_rate": round(repetition_rate, 2),
        "asked_question_texts": asked_question_texts,
    }


def run_profile_across_sessions(
    base_url: str,
    token: str,
    profile: dict,
    question_count: int,
    n_sessions: int,
) -> dict:

    mastery_before = fetch_mastery(base_url, token)

    sessions = []
    all_questions_ever_asked = []

    for session_num in range(1, n_sessions + 1):

        print(f"  session {session_num}/{n_sessions}...")

        if session_num > 1:
            time.sleep(10)

        session_result = run_session(
            base_url, token, profile, question_count
        )

        cross_session_repeats = sum(
            1 for q in session_result["asked_question_texts"]
            if q in all_questions_ever_asked
        )

        all_questions_ever_asked.extend(
            session_result["asked_question_texts"]
        )

        session_result["cross_session_repeats"] = cross_session_repeats
        del session_result["asked_question_texts"]

        sessions.append(session_result)

    mastery_after = fetch_mastery(base_url, token)

    return {
        "profile": profile["name"],
        "target_correct_probability": profile["correct_probability"],
        "n_sessions": n_sessions,
        "mastery_before": mastery_before,
        "mastery_after": mastery_after,
        "sessions": sessions,
        "total_cross_session_repeats": sum(
            s["cross_session_repeats"] for s in sessions
        ),
    }


def main():

    email = os.environ.get("EVAL_EMAIL")
    password = os.environ.get("EVAL_PASSWORD")
    base_url = os.environ.get(
        "EVAL_BASE_URL", "https://flexdemy.vercel.app/api"
    )
    question_count = int(os.environ.get("EVAL_QUESTION_COUNT", "5"))
    n_sessions = int(os.environ.get("EVAL_N_SESSIONS", "3"))

    if not email or not password:
        print("Set EVAL_EMAIL and EVAL_PASSWORD env vars.", file=sys.stderr)
        sys.exit(1)

    profile_name = os.environ.get("EVAL_PROFILE", "strong_student")
    profile_probability = float(
        os.environ.get("EVAL_PROFILE_PROBABILITY", "0.9")
    )
    profile = {"name": profile_name, "correct_probability": profile_probability}

    print(f"Signing in as {email}...")
    token = sign_in(email, password)

    print(f"Running profile '{profile['name']}' across {n_sessions} sessions...")
    result = run_profile_across_sessions(
        base_url, token, profile, question_count, n_sessions
    )

    print(json.dumps(result, indent=2))

    out_path = os.path.join(EVAL_DIR, "simulated_students_report.json")

    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
