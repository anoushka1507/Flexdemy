"""
Track D, Requirement 5c: Simulated-Student Personalization Evaluation.

Simulates multiple distinct synthetic student profiles through the adaptive engine across
multiple sessions to evaluate:
  - Longitudinal mastery progression across sessions (Bayesian Knowledge Tracing P(L))
  - Difficulty trajectory adaptation (Streak-based transition: Medium -> Hard vs Medium -> Easy)
  - Question repetition within and across sessions against a realistic item pool
  - Formative adaptation behavior for Strong, Average, and Struggling synthetic learners.

NOTE ON EVALUATION METHODOLOGY:
This is a synthetic agent simulation using fixed seeds to evaluate algorithmic properties.
It is explicitly NOT a human-subject clinical trial.
"""

import json
import os
import random
import sys
import time
from typing import Dict, List, Any

# Ensure project root is importable
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from AI_Layer.models import Difficulty
from backend.supabase_client import bkt_update

EVAL_DIR = os.path.dirname(os.path.abspath(__file__))

PROFILES = [
    {
        "name": "strong_learner",
        "description": "Consistently grasps concepts quickly (85% correct probability)",
        "correct_probability": 0.85,
    },
    {
        "name": "average_learner",
        "description": "Mixed comprehension across concepts (60% correct probability)",
        "correct_probability": 0.60,
    },
    {
        "name": "struggling_learner",
        "description": "Needs frequent remediation and practice (35% correct probability)",
        "correct_probability": 0.35,
    },
]

TOPICS = [
    "Software Disasters",
    "Productivity & Metrics",
    "Requirements Engineering",
    "Testing & Quality Assurance",
]

# Realistic candidate question bank for testing deduplication algorithms
QUESTION_BANK: Dict[str, Dict[str, List[str]]] = {
    "Software Disasters": {
        "easy": [
            "What happened to the Ariane 5 rocket 37 seconds after launch?",
            "What was the main cause of the Y2K software problem?",
            "Why did the Patriot missile clock accumulate timing errors?",
        ],
        "medium": [
            "How did 64-bit to 16-bit numeric overflow trigger the Ariane 5 disaster?",
            "Explain the failure mode of the Space Shuttle fuel management module during restart.",
            "Why did the backup computer fail identically on the Ariane 5 flight?",
        ],
        "hard": [
            "Analyze the systemic software specification flaws in the Dhahran Patriot battery incident.",
            "Synthesize the conceptual vs syntactic error trade-offs in Brooks' 'No Silver Bullet'.",
            "Evaluate the mathematical floating-point rounding decay in long-running embedded loops.",
        ],
    },
    "Productivity & Metrics": {
        "easy": [
            "What does Moore's Law state about hardware capacity growth?",
            "What is the difference between hardware costs and software costs over time?",
            "Define software productivity in lines of code.",
        ],
        "medium": [
            "Explain the Standish Group CHAOS report findings on project success rates.",
            "Compare process metrics vs product metrics in software lifecycle tracking.",
            "Why is software productivity growing more slowly than hardware performance?",
        ],
        "hard": [
            "Evaluate why adding more personnel to a late project delays it further (Brooks' Law).",
            "Critique function point analysis vs SLOC as an objective measure of productivity.",
            "Analyze the economic factors contributing to the historical Software Crisis.",
        ],
    },
    "Requirements Engineering": {
        "easy": [
            "What is the definition of a software requirement?",
            "What is the difference between generic and bespoke software products?",
            "Who are the primary stakeholders during requirements gathering?",
        ],
        "medium": [
            "Differentiate functional requirements from non-functional quality attributes.",
            "Explain the consequences of ambiguous requirements on verification and validation.",
            "How does requirements volatility impact project cost overrun?",
        ],
        "hard": [
            "Analyze techniques for resolving conflicting stakeholder requirements in safety-critical systems.",
            "Develop a formal specification validation strategy for distributed microservices.",
            "How do incomplete requirements correlate with project cancellation rates in empirical studies?",
        ],
    },
    "Testing & Quality Assurance": {
        "easy": [
            "What is the primary goal of software testing?",
            "What is a software bug or defect?",
            "What is the difference between verification and validation?",
        ],
        "medium": [
            "Explain why testing can show the presence of bugs but never their absence.",
            "Differentiate unit testing, integration testing, and acceptance testing.",
            "How do regression tests prevent newly introduced faults?",
        ],
        "hard": [
            "Formulate a mutation testing coverage strategy to detect subtle logic errors.",
            "Evaluate fault-injection testing for high-availability distributed systems.",
            "Analyze why identical software running on redundant hardware cannot prevent systematic bugs.",
        ],
    },
}


def clamp_difficulty(current: str, direction: int) -> str:
    order = ["easy", "medium", "hard"]
    idx = order.index(current)
    new_idx = max(0, min(len(order) - 1, idx + direction))
    return order[new_idx]


def simulate_local_profile(
    profile: dict,
    n_sessions: int = 3,
    questions_per_session: int = 5,
    seed: int = 42,
) -> dict:
    """
    In-process psychometric & adaptive engine simulation.
    Tests:
      1. Corbett & Anderson BKT posterior updates
      2. 2-in-a-row adaptive difficulty transitions
      3. Cross-session deduplication against a fixed candidate pool
    """
    import hashlib
    profile_hash = int(hashlib.md5(profile["name"].encode()).hexdigest()[:8], 16)
    random.seed(seed + profile_hash)

    # Initialize topic mastery baseline P(L_0) = 0.30
    mastery_tracker: Dict[str, float] = {topic: 0.30 for topic in TOPICS}
    mastery_before = dict(mastery_tracker)

    all_asked_questions: List[str] = []
    sessions_results = []

    for s_idx in range(1, n_sessions + 1):
        current_difficulty: Difficulty = "medium"
        streak_direction = ""
        streak_count = 0

        session_history = []
        session_questions = []

        for q_idx in range(1, questions_per_session + 1):
            # Prioritize weak topics: higher probability for lower P(L)
            weights = [max(0.1, 1.0 - mastery_tracker[t]) for t in TOPICS]
            chosen_topic = random.choices(TOPICS, weights=weights, k=1)[0]

            # Candidate pool selection with deduplication check
            candidates = QUESTION_BANK.get(chosen_topic, {}).get(current_difficulty, [])
            # Deduplication: prefer questions not yet asked in any session
            unasked_candidates = [q for q in candidates if q not in all_asked_questions and q not in session_questions]

            if unasked_candidates:
                q_text = random.choice(unasked_candidates)
            elif candidates:
                # Pool exhausted: select with repeat
                q_text = random.choice(candidates)
            else:
                q_text = f"Assessment item on {chosen_topic} ({current_difficulty})"

            session_questions.append(q_text)

            # Simulated student response based on profile probability
            is_correct = random.random() < profile["correct_probability"]

            # 1. Update BKT Mastery for topic (0.01 to 0.99)
            p_guess = 0.20  # 4-option MCQ
            mastery_tracker[chosen_topic] = bkt_update(
                mastery_tracker[chosen_topic], is_correct, p_guess=p_guess
            )

            # 2. Update Adaptive Streak (2 correct -> level up, 2 incorrect -> level down)
            diff_before = current_difficulty
            if streak_direction == ("correct" if is_correct else "incorrect"):
                streak_count += 1
            else:
                streak_direction = "correct" if is_correct else "incorrect"
                streak_count = 1

            if is_correct and streak_count >= 2:
                current_difficulty = clamp_difficulty(current_difficulty, +1)
                streak_count = 0
                streak_direction = ""
            elif not is_correct and streak_count >= 2:
                current_difficulty = clamp_difficulty(current_difficulty, -1)
                streak_count = 0
                streak_direction = ""

            session_history.append(
                {
                    "question_num": q_idx,
                    "topic": chosen_topic,
                    "difficulty": diff_before,
                    "was_correct": is_correct,
                    "topic_mastery_after": mastery_tracker[chosen_topic],
                    "question_text": q_text,
                }
            )

        # Calculate session metrics
        half = max(1, len(session_history) // 2)
        first_half_acc = sum(h["was_correct"] for h in session_history[:half]) / half
        second_half = session_history[half:]
        second_half_acc = (
            sum(h["was_correct"] for h in second_half) / len(second_half)
            if second_half else first_half_acc
        )

        repeats = sum(1 for q in session_questions if q in all_asked_questions)
        all_asked_questions.extend(session_questions)

        sessions_results.append(
            {
                "session_number": s_idx,
                "n_questions": len(session_history),
                "accuracy": round(sum(h["was_correct"] for h in session_history) / len(session_history), 2),
                "first_half_accuracy": round(first_half_acc, 2),
                "second_half_accuracy": round(second_half_acc, 2),
                "difficulty_trajectory": [h["difficulty"] for h in session_history],
                "cross_session_repeats": repeats,
            }
        )

    return {
        "profile": profile["name"],
        "description": profile["description"],
        "target_correct_probability": profile["correct_probability"],
        "n_sessions": n_sessions,
        "mastery_before": mastery_before,
        "mastery_after": dict(mastery_tracker),
        "overall_mastery_delta": round(
            sum(mastery_tracker.values()) / len(mastery_tracker)
            - sum(mastery_before.values()) / len(mastery_before),
            3,
        ),
        "sessions": sessions_results,
        "total_cross_session_repeats": sum(
            s["cross_session_repeats"] for s in sessions_results
        ),
    }


def main():
    print("=" * 70)
    print("Track D: Multimodal Adaptive Learner Multi-Session Evaluation")
    print("Methodology: Synthetic Agent Simulation (Reproducible Seed-based)")
    print("=" * 70)

    # Fixed seed for strict determinism and reproducible benchmarks
    random.seed(42)

    n_sessions = int(os.environ.get("EVAL_N_SESSIONS", "2"))
    questions_per_session = int(os.environ.get("EVAL_QUESTION_COUNT", "5"))

    all_profile_results = []

    for prof in PROFILES:
        print(f"\nEvaluating Profile: {prof['name']} (p_correct={prof['correct_probability']})...")
        res = simulate_local_profile(
            prof,
            n_sessions=n_sessions,
            questions_per_session=questions_per_session,
            seed=11,
        )
        all_profile_results.append(res)

        print(f"  Initial Avg Mastery: 0.30")
        final_avg = sum(res["mastery_after"].values()) / len(res["mastery_after"])
        print(f"  Final Avg Mastery:   {final_avg:.2f} (Delta: {res['overall_mastery_delta']:+.2f})")
        print(f"  Session Accuracies:  {[s['accuracy'] for s in res['sessions']]}")
        print(f"  Cross-Session Repeats: {res['total_cross_session_repeats']}")
        print(f"  Difficulty Trajectories:")
        for s in res["sessions"]:
            print(f"    S{s['session_number']}: {' -> '.join(s['difficulty_trajectory'])}")

    report_payload = {
        "evaluation_timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "evaluation_type": "synthetic_agent_simulation",
        "human_subject_trial": False,
        "test_configuration": {
            "n_sessions_per_profile": n_sessions,
            "questions_per_session": questions_per_session,
            "learner_model": "Bayesian Knowledge Tracing (BKT: Corbett & Anderson closed-form)",
            "adaptation_policy": "Streak clamp (+1/-1 at 2 streak) & weak-topic inverse weighting",
        },
        "profiles": all_profile_results,
    }

    out_path = os.path.join(EVAL_DIR, "simulated_students_report.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, indent=2)

    print(f"\n[OK] Full simulation report generated and written to: {out_path}")


if __name__ == "__main__":
    main()
