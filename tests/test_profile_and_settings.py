import asyncio
import unittest
from unittest.mock import patch, MagicMock
from fastapi.exceptions import HTTPException

from backend.main import (
    get_user_profile_api,
    save_user_profile_api,
    save_user_preferences_api,
    get_user_preferences_api,
    reset_learning_data_api,
    get_learner_profile_api,
    UserProfilePayload,
    UserPreferencesPayload,
)

class TestProfileAndSettings(unittest.TestCase):
    """Offline unit tests for user profile, settings, and learning data reset endpoints."""

    def setUp(self):
        self.mock_client = MagicMock()
        self.user_id = "user-test-uuid-5678"
        self.auth_header = "Bearer test-jwt-token"

    def test_get_user_profile_unauthenticated(self):
        """Unauthenticated caller receives profile: None."""
        loop = asyncio.new_event_loop()
        try:
            with patch("backend.main.get_user_client", return_value=None), \
                 patch("backend.main.get_user_id", return_value=None):
                res = loop.run_until_complete(get_user_profile_api(authorization=None))
                self.assertEqual(res, {"profile": None})
        finally:
            loop.close()

    def test_get_user_profile_authenticated(self):
        """Authenticated caller fetches profile successfully."""
        loop = asyncio.new_event_loop()
        try:
            mock_profile = {
                "id": self.user_id,
                "display_name": "Taylor Swift",
                "institution": "Stanford University",
                "study_goal": "Master OS",
            }
            with patch("backend.main.get_user_client", return_value=self.mock_client), \
                 patch("backend.main.get_user_id", return_value=self.user_id), \
                 patch("backend.main.fetch_user_profile", return_value=mock_profile):
                res = loop.run_until_complete(get_user_profile_api(authorization=self.auth_header))
                self.assertEqual(res["profile"]["display_name"], "Taylor Swift")
                self.assertEqual(res["profile"]["institution"], "Stanford University")
        finally:
            loop.close()

    def test_save_user_profile_authenticated(self):
        """Authenticated caller updates display_name, institution, and study_goal."""
        loop = asyncio.new_event_loop()
        try:
            payload = UserProfilePayload(
                display_name="Taylor Swift",
                institution="MIT",
                study_goal="Pass Distributed Systems Exam",
            )
            with patch("backend.main.get_user_client", return_value=self.mock_client), \
                 patch("backend.main.get_user_id", return_value=self.user_id), \
                 patch("backend.main.save_user_profile", return_value=True) as mock_save:
                res = loop.run_until_complete(save_user_profile_api(payload, authorization=self.auth_header))
                self.assertEqual(res, {"saved": True})
                mock_save.assert_called_once()
        finally:
            loop.close()

    def test_save_user_preferences_with_theme_and_accessibility(self):
        """Accepts theme, speech_rate, reduced_motion, and language preferences."""
        loop = asyncio.new_event_loop()
        try:
            payload = UserPreferencesPayload(
                theme="dark",
                dyslexia_mode=True,
                speech_rate=1.2,
                reduced_motion=True,
                font_size="large",
                language="hindi",
                explanation_style="step-by-step",
            )
            with patch("backend.main.get_user_client", return_value=self.mock_client), \
                 patch("backend.main.get_user_id", return_value=self.user_id), \
                 patch("backend.main.save_user_preferences", return_value=True) as mock_save_prefs:
                res = loop.run_until_complete(save_user_preferences_api(payload, authorization=self.auth_header))
                self.assertEqual(res, {"saved": True})
                call_args = mock_save_prefs.call_args[0]
                self.assertEqual(call_args[1], self.user_id)
                self.assertEqual(call_args[2]["theme"], "dark")
                self.assertEqual(call_args[2]["dyslexia_mode"], True)
                self.assertEqual(call_args[2]["speech_rate"], 1.2)
                self.assertEqual(call_args[2]["reduced_motion"], True)
                self.assertEqual(call_args[2]["language"], "hindi")
        finally:
            loop.close()

    def test_reset_learning_data_authenticated(self):
        """Reset learning data clears quiz history and mastery while keeping account."""
        loop = asyncio.new_event_loop()
        try:
            with patch("backend.main.get_user_client", return_value=self.mock_client), \
                 patch("backend.main.get_user_id", return_value=self.user_id), \
                 patch("backend.main.reset_user_learning_data", return_value=True) as mock_reset:
                res = loop.run_until_complete(reset_learning_data_api(authorization=self.auth_header))
                self.assertEqual(res, {"cleared": True})
                mock_reset.assert_called_once_with(self.mock_client, self.user_id)
        finally:
            loop.close()

    def test_learner_profile_returns_unified_profile_and_preferences(self):
        """Learner profile aggregates stats, weak topics, history, preferences, and profile."""
        loop = asyncio.new_event_loop()
        try:
            mock_profile = {"display_name": "Taylor Swift", "institution": "Stanford"}
            mock_prefs = {"theme": "dark", "language": "english"}
            mock_history = [{"quiz_id": "q1", "score_percentage": 90, "total_questions": 10, "correct_answers_count": 9}]
            mock_mastery = {"Operating Systems": {"mastery_score": 0.45, "times_seen": 2}}

            with patch("backend.main.get_user_client", return_value=self.mock_client), \
                 patch("backend.main.get_user_id", return_value=self.user_id), \
                 patch("backend.main.fetch_mastery", return_value=mock_mastery), \
                 patch("backend.main.fetch_quiz_history", return_value=mock_history), \
                 patch("backend.main.fetch_user_preferences", return_value=mock_prefs), \
                 patch("backend.main.fetch_user_profile", return_value=mock_profile):
                res = loop.run_until_complete(get_learner_profile_api(authorization=self.auth_header))
                self.assertEqual(res["user_id"], self.user_id)
                self.assertEqual(res["profile"]["display_name"], "Taylor Swift")
                self.assertEqual(res["preferences"]["theme"], "dark")
                self.assertEqual(res["stats"]["total_quizzes"], 1)
                self.assertEqual(res["stats"]["average_score"], 90.0)
                self.assertEqual(len(res["weak_topics"]), 1)
                self.assertEqual(res["weak_topics"][0]["topic"], "Operating Systems")
        finally:
            loop.close()

if __name__ == "__main__":
    unittest.main()
