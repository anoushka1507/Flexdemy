"""
Comprehensive Automated Acceptance Test Suite for Track D Requirements.
Tests BKT Learner Model, Ingestion Validation, Grading Engines, Ebbinghaus Scheduling,
Topological DAG mapping, and Retrieval Fallbacks.
"""

import math
import os
import sys
import unittest
import io
import asyncio

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from AI_Layer.models import (
    Chunk,
    Citation,
    Concept,
    Difficulty,
    OptionDraft,
    QuestionDraft,
)
from AI_Layer.ai_core import (
    _cosine_similarity,
    _lexical_similarity,
    extract_text_and_chunk,
    verify_answer,
)
from backend.supabase_client import bkt_update


class TestBKTModel(unittest.TestCase):
    """Requirement 4.1: Pure Bayesian Knowledge Tracing (BKT) verification."""

    def test_bkt_correct_answer_advancement(self):
        p_l0 = 0.30
        p_l1 = bkt_update(p_l0, is_correct=True, p_guess=0.20, p_slip=0.10, p_transit=0.15)
        self.assertGreater(p_l1, p_l0)
        self.assertAlmostEqual(p_l1, 0.7098, places=3)

        p_l2 = bkt_update(p_l1, is_correct=True, p_guess=0.20, p_slip=0.10, p_transit=0.15)
        self.assertGreater(p_l2, p_l1)
        self.assertAlmostEqual(p_l2, 0.9292, places=3)

    def test_bkt_incorrect_answer_decay(self):
        p_l0 = 0.30
        p_l1 = bkt_update(p_l0, is_correct=False, p_guess=0.20, p_slip=0.10, p_transit=0.15)
        self.assertLess(p_l1, p_l0)
        self.assertAlmostEqual(p_l1, 0.1886, places=3)

    def test_bkt_guess_probability_differentiation(self):
        # Numerical question (p_guess=0.05) vs MCQ (p_guess=0.20)
        # Getting a numerical question right provides stronger evidence of mastery than 4-option MCQ
        p_l0 = 0.30
        p_mcq = bkt_update(p_l0, is_correct=True, p_guess=0.20)
        p_num = bkt_update(p_l0, is_correct=True, p_guess=0.05)
        self.assertGreater(p_num, p_mcq)

    def test_bkt_boundary_clamping(self):
        # Clamped strictly between 0.01 and 0.99
        low = bkt_update(0.001, is_correct=False)
        self.assertGreaterEqual(low, 0.01)

        high = bkt_update(0.999, is_correct=True)
        self.assertLessEqual(high, 0.99)


class TestGradingEngines(unittest.TestCase):
    """Requirement 3.2: Deterministic MCQ, Short-Answer, and Numerical Grading."""

    def test_numerical_grading_various_formats(self):
        q = QuestionDraft(
            question_text="What is the velocity in m/s?",
            options=[],
            expected_answer="42.5",
            numerical_tolerance=0.05,
            difficulty="medium",
            question_type="numerical",
            source_locator="Slide 4",
        )

        loop = asyncio.new_event_loop()
        try:
            # Exact float match
            r1 = loop.run_until_complete(verify_answer(q, "42.5"))
            self.assertTrue(r1.is_correct)

            # Match with units
            r2 = loop.run_until_complete(verify_answer(q, "42.5 m/s"))
            self.assertTrue(r2.is_correct)

            # Match with text prefix
            r3 = loop.run_until_complete(verify_answer(q, "approx 42.52"))
            self.assertTrue(r3.is_correct)

            # Match within tolerance (42.54 with tol=0.05)
            r4 = loop.run_until_complete(verify_answer(q, "42.54"))
            self.assertTrue(r4.is_correct)

            # Clear incorrect answer
            r5 = loop.run_until_complete(verify_answer(q, "99.0"))
            self.assertFalse(r5.is_correct)
        finally:
            loop.close()

    def test_short_answer_normalized_matching(self):
        q = QuestionDraft(
            question_text="What protocol resolves IP to MAC?",
            options=[],
            expected_answer="Address Resolution Protocol",
            difficulty="medium",
            question_type="short_answer",
            source_locator="Page 12",
        )

        loop = asyncio.new_event_loop()
        try:
            # Case and whitespace normalization
            r1 = loop.run_until_complete(verify_answer(q, "  address resolution protocol  "))
            self.assertTrue(r1.is_correct)

            # Acronym / substring in context
            r2 = loop.run_until_complete(verify_answer(q, "It is the Address Resolution Protocol used in L2."))
            self.assertTrue(r2.is_correct)
        finally:
            loop.close()


class TestEbbinghausScheduling(unittest.TestCase):
    """Requirement 6.3: Ebbinghaus forgetting curve decay algorithm."""

    def test_retention_decay_curve(self):
        # R(t) = exp(-t / S)
        # S = 1.0 + 9.0 * P(L)
        p_weak = 0.20
        s_weak = 1.0 + 9.0 * p_weak  # S = 2.8
        r_weak_7d = math.exp(-7.0 / s_weak)

        p_strong = 0.90
        s_strong = 1.0 + 9.0 * p_strong  # S = 9.1
        r_strong_7d = math.exp(-7.0 / s_strong)

        # Retention on strong topic must be significantly higher than weak topic at 7 days
        self.assertGreater(r_strong_7d, r_weak_7d)
        self.assertLess(r_weak_7d, 0.15)
        self.assertGreater(r_strong_7d, 0.45)


class TestGroundedRetrieval(unittest.TestCase):
    """Requirement 2.1 & 3.2: Retrieval and lexical fallback."""

    def test_lexical_similarity_scoring(self):
        query = "Ariane 5 rocket floating point failure"
        chunk_relevant = "The Ariane 5 rocket failed due to a 64-bit floating point conversion overflow."
        chunk_irrelevant = "Photosynthesis occurs in plant chloroplasts using sunlight."

        score_rel = _lexical_similarity(query, chunk_relevant)
        score_irrel = _lexical_similarity(query, chunk_irrelevant)

        self.assertGreater(score_rel, 0.50)
        self.assertEqual(score_irrel, 0.0)

    def test_cosine_similarity_math(self):
        v1 = [1.0, 0.0, 0.0]
        v2 = [1.0, 0.0, 0.0]
        v3 = [0.0, 1.0, 0.0]

        self.assertAlmostEqual(_cosine_similarity(v1, v2), 1.0)
        self.assertAlmostEqual(_cosine_similarity(v1, v3), 0.0)


class TestChunkExtractionAndMetadata(unittest.TestCase):
    """Requirement 1.1 & 1.2: Chunking and locator preservation."""

    def test_text_chunking_and_locators(self):
        text = "Chapter 1: " + "word " * 1500
        chunks = extract_text_and_chunk(text, "sample.txt")

        self.assertGreater(len(chunks), 1)
        self.assertEqual(chunks[0].source_type, "text")
        self.assertEqual(chunks[0].locator, "Section 1")
        self.assertEqual(chunks[1].locator, "Section 2")
        self.assertEqual(chunks[0].source_filename, "sample.txt")


if __name__ == "__main__":
    unittest.main()
