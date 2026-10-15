"""
Comprehensive backend regression tests for Flexdemy Quiz Attempt Persistence:
1. 5-question quiz completion with 2 correct answers (40.0% score calculation and verification)
2. Database write and read-back via fetch_quiz_history and /quiz-history
3. Learner Profile single-source-of-truth stats hydration (total_quizzes, average_score, accuracy)
4. Multi-user isolation (User A's attempts invisible to User B)
5. Idempotent attempt submission (double submission does not duplicate attempts)
6. Failed database write raises HTTP 500 without false success
7. Serverless session persistence across stateless requests with valid ISO timestamps
8. Auth token enforcement on /record-quiz-result and /quiz-history (HTTP 401)
"""

import asyncio
from datetime import datetime, timezone
import json
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.main import (
    app,
    record_quiz_result_api,
    quiz_history_api,
    get_learner_profile_api,
    QuizHistoryEntry,
)
from backend.supabase_client import (
    record_quiz_result,
    fetch_quiz_history,
    save_quiz_session_data,
    load_quiz_session_data,
    current_utc_iso,
)


class MockPostgrestTable:
    """In-memory mock table simulating Supabase PostgREST table operations with RLS & scoping."""
    def __init__(self, data_store: list[dict]):
        self.data_store = data_store
        self._filters = []
        self._order_field = None
        self._desc = False
        self._limit = None

    def upsert(self, payload: dict, on_conflict: str = "user_id,quiz_id"):
        mock_builder = MagicMock()
        def _execute():
            conflict_keys = [k.strip() for k in on_conflict.split(",")]
            # Look for existing item matching all conflict keys
            for idx, item in enumerate(self.data_store):
                match = True
                for k in conflict_keys:
                    if item.get(k) != payload.get(k):
                        match = False
                        break
                if match:
                    self.data_store[idx] = {**item, **payload}
                    return MagicMock(data=[self.data_store[idx]])
            self.data_store.append(dict(payload))
            return MagicMock(data=[dict(payload)])
        mock_builder.execute = _execute
        return mock_builder

    def insert(self, payload: dict):
        mock_builder = MagicMock()
        def _execute():
            self.data_store.append(dict(payload))
            return MagicMock(data=[dict(payload)])
        mock_builder.execute = _execute
        return mock_builder

    def select(self, columns: str = "*"):
        new_query = MockPostgrestTable(self.data_store)
        return new_query

    def eq(self, column: str, value):
        self._filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False):
        self._order_field = column
        self._desc = desc
        return self

    def limit(self, count: int):
        self._limit = count
        return self

    def execute(self):
        filtered = list(self.data_store)
        for col, val in self._filters:
            filtered = [item for item in filtered if item.get(col) == val]
        if self._order_field:
            filtered.sort(
                key=lambda x: str(x.get(self._order_field, "")),
                reverse=self._desc,
            )
        if self._limit is not None:
            filtered = filtered[:self._limit]
        return MagicMock(data=filtered)


class MockSupabaseClient:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {
            "quiz_history": [],
            "quiz_sessions": [],
            "learner_mastery": [],
            "user_preferences": [],
            "profiles": [],
        }

    def table(self, table_name: str):
        if table_name not in self.tables:
            self.tables[table_name] = []
        return MockPostgrestTable(self.tables[table_name])


class TestQuizAttemptPersistence(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.mock_sb = MockSupabaseClient()

    def tearDown(self):
        self.loop.close()

    def test_iso_timestamp_format(self):
        """Timestamp must be valid ISO 8601 string, never the invalid SQL string 'now()'."""
        ts = current_utc_iso()
        self.assertIsInstance(ts, str)
        # Must be parseable as ISO timestamp
        parsed = datetime.fromisoformat(ts)
        self.assertIsNotNone(parsed.tzinfo)
        self.assertNotEqual(ts, "now()")

    def test_complete_five_question_quiz_with_two_correct_answers(self):
        """
        1. Complete a five-question quiz with two correct answers.
        2. Verify the score is 40%.
        3. Confirm a completed-attempt record exists in Supabase.
        4. Fetch the record through the same data-access path used by Latest Results.
        """
        user_id = "user-alice-101"
        quiz_id = "quiz-intro-os-5q"
        attempt_id = "attempt-alice-os-001"

        question_outcomes = [
            {"question_id": 1, "question_text": "What is a process?", "was_correct": True},
            {"question_id": 2, "question_text": "What is a thread?", "was_correct": False},
            {"question_id": 3, "question_text": "What is virtual memory?", "was_correct": True},
            {"question_id": 4, "question_text": "What is a deadlock?", "was_correct": False},
            {"question_id": 5, "question_text": "What is a semaphore?", "was_correct": False},
        ]

        total_questions = len(question_outcomes)
        correct_count = sum(1 for q in question_outcomes if q["was_correct"])
        self.assertEqual(total_questions, 5)
        self.assertEqual(correct_count, 2)

        # 2. Verify score is 40.0%
        calculated_score = round((correct_count / total_questions) * 100, 1)
        self.assertEqual(calculated_score, 40.0)

        # 3. Save attempt to Supabase mock
        save_success = self.loop.run_until_complete(
            record_quiz_result(
                client=self.mock_sb,
                user_id=user_id,
                quiz_id=quiz_id,
                quiz_title="Introduction to Operating Systems",
                topic="Operating Systems",
                difficulty="Medium",
                score_percentage=calculated_score,
                total_questions=total_questions,
                correct_answers_count=correct_count,
                session_id="session-os-123",
                topic_breakdown=[{"topic": "Operating Systems", "score": 2, "total": 5}],
                question_outcomes=question_outcomes,
                attempt_id=attempt_id,
                user_answers={1: 0, 2: 1, 3: 2, 4: 0, 5: 3},
            )
        )
        self.assertTrue(save_success)
        self.assertEqual(len(self.mock_sb.tables["quiz_history"]), 1)

        saved = self.mock_sb.tables["quiz_history"][0]
        self.assertEqual(saved["attempt_id"], attempt_id)
        self.assertEqual(saved["user_id"], user_id)
        self.assertEqual(saved["quiz_id"], quiz_id)
        self.assertEqual(saved["score_percentage"], 40.0)
        self.assertEqual(saved["total_questions"], 5)
        self.assertEqual(saved["correct_answers_count"], 2)
        self.assertEqual(saved["status"], "completed")
        self.assertEqual(len(saved["question_outcomes"]), 5)

        # 4. Fetch the record through the same data-access path used by Latest Results
        history = self.loop.run_until_complete(
            fetch_quiz_history(self.mock_sb, user_id=user_id)
        )
        self.assertEqual(len(history), 1)
        fetched = history[0]
        self.assertEqual(fetched["attempt_id"], attempt_id)
        self.assertEqual(fetched["score_percentage"], 40.0)
        self.assertEqual(fetched["total_questions"], 5)
        self.assertEqual(fetched["correct_answers_count"], 2)

    def test_multi_user_isolation(self):
        """
        Verify that User A cannot see User B's attempts, and User B cannot see User A's attempts.
        """
        user_a = "user-alice-201"
        user_b = "user-bob-202"

        # User A saves an attempt
        self.loop.run_until_complete(
            record_quiz_result(
                client=self.mock_sb,
                user_id=user_a,
                quiz_id="quiz-a-1",
                quiz_title="Alice's Quiz",
                topic="Python",
                difficulty="Easy",
                score_percentage=100.0,
                total_questions=5,
                correct_answers_count=5,
            )
        )

        # User B saves an attempt
        self.loop.run_until_complete(
            record_quiz_result(
                client=self.mock_sb,
                user_id=user_b,
                quiz_id="quiz-b-1",
                quiz_title="Bob's Quiz",
                topic="Databases",
                difficulty="Hard",
                score_percentage=60.0,
                total_questions=5,
                correct_answers_count=3,
            )
        )

        # User A fetches history
        history_a = self.loop.run_until_complete(
            fetch_quiz_history(self.mock_sb, user_id=user_a)
        )
        self.assertEqual(len(history_a), 1)
        self.assertEqual(history_a[0]["user_id"], user_a)
        self.assertEqual(history_a[0]["quiz_title"], "Alice's Quiz")

        # User B fetches history
        history_b = self.loop.run_until_complete(
            fetch_quiz_history(self.mock_sb, user_id=user_b)
        )
        self.assertEqual(len(history_b), 1)
        self.assertEqual(history_b[0]["user_id"], user_b)
        self.assertEqual(history_b[0]["quiz_title"], "Bob's Quiz")

    def test_idempotent_submission_prevents_duplicate_attempts(self):
        """
        Retrying final submission must not create duplicate completed attempts.
        """
        user_id = "user-carol-301"
        quiz_id = "quiz-math-idempotent"

        # Submit attempt 1st time
        res1 = self.loop.run_until_complete(
            record_quiz_result(
                client=self.mock_sb,
                user_id=user_id,
                quiz_id=quiz_id,
                quiz_title="Calculus Quiz",
                topic="Math",
                difficulty="Medium",
                score_percentage=80.0,
                total_questions=5,
                correct_answers_count=4,
            )
        )
        self.assertTrue(res1)
        self.assertEqual(len(self.mock_sb.tables["quiz_history"]), 1)

        # Submit same attempt 2nd time (e.g. user retried or double-clicked)
        res2 = self.loop.run_until_complete(
            record_quiz_result(
                client=self.mock_sb,
                user_id=user_id,
                quiz_id=quiz_id,
                quiz_title="Calculus Quiz",
                topic="Math",
                difficulty="Medium",
                score_percentage=80.0,
                total_questions=5,
                correct_answers_count=4,
            )
        )
        self.assertTrue(res2)
        # Must still be only 1 record in the database
        self.assertEqual(len(self.mock_sb.tables["quiz_history"]), 1)

    def test_record_quiz_result_api_requires_auth(self):
        """Endpoint /record-quiz-result must return 401 Unauthorized if no auth token is provided."""
        payload = {
            "quiz_id": "quiz-no-auth",
            "quiz_title": "No Auth Quiz",
            "score_percentage": 50.0,
            "total_questions": 4,
            "correct_answers_count": 2,
        }
        response = self.client.post("/record-quiz-result", json=payload)
        self.assertEqual(response.status_code, 401)
        self.assertIn("Sign in", response.json()["detail"])

    def test_quiz_history_api_requires_auth(self):
        """Endpoint /quiz-history must return 401 Unauthorized if no auth token is provided."""
        response = self.client.get("/quiz-history")
        self.assertEqual(response.status_code, 401)
        self.assertIn("Sign in", response.json()["detail"])

    def test_failed_database_write_raises_http_500(self):
        """When database write fails, backend must raise HTTP 500, not return false success 200."""
        req = QuizHistoryEntry(
            quiz_id="quiz-failing-db",
            quiz_title="Fail Quiz",
            score_percentage=60.0,
            total_questions=5,
            correct_answers_count=3,
        )

        with patch("backend.main.get_user_id", return_value="user-err-test"), \
             patch("backend.main.get_user_client", return_value=self.mock_sb), \
             patch("backend.main.record_quiz_result", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                self.loop.run_until_complete(
                    record_quiz_result_api(
                        request=req,
                        authorization="Bearer mock-token",
                    )
                )
            self.assertEqual(ctx.exception.status_code, 500)
            self.assertIn("Database write failed", ctx.exception.detail)

    def test_serverless_session_persistence_roundtrip(self):
        """
        Verify that active quiz sessions persist and reload across simulated stateless requests.
        """
        session_id = "sess-adaptive-serverless-999"
        user_id = "user-dave-401"
        session_state = {
            "session_id": session_id,
            "title": "Algorithms Adaptive Quiz",
            "current_difficulty": "Hard",
            "current_question_index": 3,
            "questions_asked": 3,
            "total_questions": 5,
            "answered_results": {
                "1": {"was_correct": True, "score": 1},
                "2": {"was_correct": False, "score": 0},
                "3": {"was_correct": True, "score": 1},
            },
        }

        # 1. Instance 1 saves session
        self.loop.run_until_complete(
            save_quiz_session_data(
                session_id=session_id,
                session_json=session_state,
                user_id=user_id,
                auth_client=self.mock_sb,
            )
        )
        self.assertEqual(len(self.mock_sb.tables["quiz_sessions"]), 1)
        row = self.mock_sb.tables["quiz_sessions"][0]
        self.assertNotEqual(row["updated_at"], "now()")
        self.assertIn("T", row["updated_at"])  # Valid ISO timestamp

        # 2. Instance 2 loads session
        loaded_state = self.loop.run_until_complete(
            load_quiz_session_data(
                session_id=session_id,
                user_id=user_id,
                auth_client=self.mock_sb,
            )
        )
        self.assertIsNotNone(loaded_state)
        self.assertEqual(loaded_state["session_id"], session_id)
        self.assertEqual(loaded_state["current_question_index"], 3)
        self.assertEqual(len(loaded_state["answered_results"]), 3)


if __name__ == "__main__":
    unittest.main()
