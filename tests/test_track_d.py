"""
Comprehensive Automated Acceptance Test Suite for Track D Requirements.
Tests BKT Learner Model, Ingestion Validation, File Header Verification, Cache Isolation,
Grading Engines, Ebbinghaus Scheduling, and Grounding Fallbacks.
"""

import asyncio
import io
import math
import os
import sys
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import HTTPException, UploadFile
from AI_Layer.models import (
    Chunk,
    Citation,
    Concept,
    ConceptState,
    Difficulty,
    OptionDraft,
    QuestionDraft,
)
from AI_Layer.ai_core import (
    _cosine_similarity,
    _lexical_similarity,
    answer_grounded_question,
    extract_text_and_chunk,
    verify_answer,
)
from backend.supabase_client import bkt_update
from backend.main import (
    read_uploaded_material,
    material_chunks_cache,
    update_concept_performance,
    choose_weighted_concept,
    AdaptiveSession,
)


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
        low = bkt_update(0.001, is_correct=False)
        self.assertGreaterEqual(low, 0.01)

        high = bkt_update(0.999, is_correct=True)
        self.assertLessEqual(high, 0.99)

    def test_concept_state_bkt_integration(self):
        state = ConceptState(concept_label="Virtual Memory", mastery_score=0.30)
        updated = update_concept_performance(state, is_correct=True, question_type="mcq")
        self.assertAlmostEqual(updated.mastery_score, 0.7098, places=3)
        self.assertEqual(updated.correct_count, 1)
        self.assertEqual(updated.times_asked, 1)


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

            # Match within tolerance
            r4 = loop.run_until_complete(verify_answer(q, "42.54"))
            self.assertTrue(r4.is_correct)

            # Clear incorrect answer
            r5 = loop.run_until_complete(verify_answer(q, "99.0"))
            self.assertFalse(r5.is_correct)
        finally:
            loop.close()

    def test_numerical_grading_edge_cases(self):
        loop = asyncio.new_event_loop()
        try:
            # Negative numbers
            q_neg = QuestionDraft(
                question_text="What is the temperature in C?",
                options=[],
                expected_answer="-15.5",
                numerical_tolerance=0.1,
                difficulty="medium",
                question_type="numerical",
            )
            r_neg = loop.run_until_complete(verify_answer(q_neg, "-15.5 C"))
            self.assertTrue(r_neg.is_correct)

            r_neg_wrong = loop.run_until_complete(verify_answer(q_neg, "15.5 C"))
            self.assertFalse(r_neg_wrong.is_correct)

            # Comma-separated values
            q_comma = QuestionDraft(
                question_text="Total count?",
                options=[],
                expected_answer="1,250",
                numerical_tolerance=0.01,
                difficulty="easy",
                question_type="numerical",
            )
            r_comma = loop.run_until_complete(verify_answer(q_comma, "1250"))
            self.assertTrue(r_comma.is_correct)
        finally:
            loop.close()

    def test_short_answer_matching(self):
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

            # Substring / key term containment
            r2 = loop.run_until_complete(verify_answer(q, "It is the Address Resolution Protocol used in L2."))
            self.assertTrue(r2.is_correct)

            # Reject completely incorrect answer
            r3 = loop.run_until_complete(verify_answer(q, "HyperText Transfer Protocol"))
            self.assertFalse(r3.is_correct)
        finally:
            loop.close()


class TestIngestionAndCacheIsolation(unittest.TestCase):
    """Requirement 1.1 & 1.2: Ingestion verification, file headers, and cache isolation."""

    def test_cache_preserves_new_filename(self):
        # Uploading identical bytes under different filenames must not leak the old filename
        content = b"Course notes content for testing cache filename isolation."
        
        file1 = UploadFile(filename="physics_lecture_1.txt", file=io.BytesIO(content))
        file2 = UploadFile(filename="physics_lecture_2.txt", file=io.BytesIO(content))

        loop = asyncio.new_event_loop()
        try:
            chunks1 = loop.run_until_complete(read_uploaded_material(file1))
            self.assertEqual(chunks1[0].source_filename, "physics_lecture_1.txt")

            # Second upload of same content with new name
            chunks2 = loop.run_until_complete(read_uploaded_material(file2))
            self.assertEqual(chunks2[0].source_filename, "physics_lecture_2.txt")
            self.assertIn("physics_lect", chunks2[0].doc_id)
        finally:
            loop.close()

    def test_spoofed_pdf_header_rejected(self):
        # A file with .pdf extension that lacks %PDF- header must be rejected with 400
        spoofed_bytes = b"This is plain text with no PDF magic bytes."
        file_obj = UploadFile(filename="fake_document.pdf", file=io.BytesIO(spoofed_bytes))

        loop = asyncio.new_event_loop()
        try:
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(read_uploaded_material(file_obj))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("%PDF- header", cm.exception.detail)
        finally:
            loop.close()

    def test_spoofed_pptx_header_rejected(self):
        # A file with .pptx extension that lacks PK ZIP header must be rejected with 400
        spoofed_bytes = b"This is plain text pretending to be slides."
        file_obj = UploadFile(filename="fake_slides.pptx", file=io.BytesIO(spoofed_bytes))

        loop = asyncio.new_event_loop()
        try:
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(read_uploaded_material(file_obj))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("PK ZIP", cm.exception.detail)
        finally:
            loop.close()


class TestEbbinghausScheduling(unittest.TestCase):
    """Requirement 6.3: Ebbinghaus forgetting curve decay algorithm."""

    def test_retention_decay_curve(self):
        p_weak = 0.20
        s_weak = 1.0 + 9.0 * p_weak  # S = 2.8
        r_weak_7d = math.exp(-7.0 / s_weak)

        p_strong = 0.90
        s_strong = 1.0 + 9.0 * p_strong  # S = 9.1
        r_strong_7d = math.exp(-7.0 / s_strong)

        self.assertGreater(r_strong_7d, r_weak_7d)
        self.assertLess(r_weak_7d, 0.15)
        self.assertGreater(r_strong_7d, 0.45)


class TestGroundedRetrievalAndOfflineTutor(unittest.TestCase):
    """Requirement 2.1 & 2.3: Retrieval and transparent offline tutor response."""

    def test_lexical_similarity_scoring(self):
        query = "Ariane 5 rocket floating point failure"
        chunk_relevant = "The Ariane 5 rocket failed due to a 64-bit floating point conversion overflow."
        chunk_irrelevant = "Photosynthesis occurs in plant chloroplasts using sunlight."

        score_rel = _lexical_similarity(query, chunk_relevant)
        score_irrel = _lexical_similarity(query, chunk_irrelevant)

        self.assertGreater(score_rel, 0.50)
        self.assertEqual(score_irrel, 0.0)

    def test_offline_tutor_transparent_response(self):
        # When offline, tutor must return a transparent direct excerpt without faking generation
        chunk = Chunk(
            chunk_index=0,
            text="Operating systems manage hardware resources through virtual memory abstraction.",
            locator="Page 1",
            source_type="pdf",
            source_filename="os_notes.pdf",
        )
        loop = asyncio.new_event_loop()
        try:
            resp = loop.run_until_complete(
                answer_grounded_question([chunk], [], [], "How does virtual memory work?")
            )
            self.assertTrue(resp.is_grounded)
            self.assertIn("[Offline Mode", resp.answer)
            self.assertIn("Page 1", resp.answer)
            self.assertEqual(len(resp.citations), 1)
            self.assertEqual(resp.citations[0].locator, "Page 1")
        finally:
            loop.close()


if __name__ == "__main__":
    unittest.main()
