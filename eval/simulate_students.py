"""
Track D, Requirement 5c: simulated-student personalization evaluation.

Runs several simulated student profiles through the LIVE adaptive quiz
HTTP API (not the AI layer directly) repeatedly, each with a different
per-concept correctness bias, and reports:

  - mastery gain: accuracy in the second half of the quiz vs. the first
    half, per profile (should trend upward for a working adaptive engine)
  - difficulty trajectory: does difficulty correctly rise for a strong
    profile and fall for a weak one
  - question repetition rate: fraction of generated questions that are
    exact-duplicate text within a session (should be ~0)

Requires the backend running locally, e.g.:
  uvicorn backend.main:app --port 8000
"""

import argparse
import json
import os
import random
import sys

import requests


MATERIAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "material.txt")

PROFILES = [
    {"name": "strong_student", "correct_probability": 0.9},
    {"name": "weak_student", "correct_probability": 0.2},
    {"name": "average_student", "correct_probability": 0.55},
]


def run_profile(base_url: str, profile: dict, question_count: int) -> dict:

    with open(MATERIAL_PATH, "rb") as f:
        response = requests.post(
            f"{base_url}/start-adaptive-quiz",
            params={
                "difficulty": "medium",
                "question_count": question_count,
                "question_types": "mcq",
            },
            files={"file": ("material.txt", f, "text/plain")},
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

        answer_response = requests.post(
            f"{base_url}/answer-adaptive-question",
            json={
                "session_id": session_id,
                "question_number": data.get("question_number", 1),
                "selected_option_index": selected_index,
            },
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
        "profile": profile["name"],
        "target_correct_probability": profile["correct_probability"],
        "n_questions": len(history),
        "first_half_accuracy": round(first_half_acc, 2),
        "second_half_accuracy": (
            round(second_half_acc, 2) if second_half_acc is not None else None
        ),
        "difficulty_trajectory": [h["difficulty"] for h in history],
        "question_repetition_rate": round(repetition_rate, 2),
    }


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--question-count", type=int, default=8)
    args = parser.parse_args()

    results = []

    for profile in PROFILES:
        print(f"Running profile: {profile['name']}...")
        results.append(
            run_profile(args.base_url, profile, args.question_count)
        )

    print(json.dumps(results, indent=2))

    out_path = os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "simulated_students_report.json",
    )

    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
