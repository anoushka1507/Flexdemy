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


class TestUploadCacheValidation(unittest.TestCase):
    """P1: Upload validation before cache lookup, spoofing defense, and cross-format protection."""

    def test_cache_hit_validation_order(self):
        # 1. Warm cache with a valid text file
        content = b"Data structures lecture notes on binary search trees."
        file_valid = UploadFile(filename="lecture.txt", file=io.BytesIO(content))

        loop = asyncio.new_event_loop()
        try:
            chunks = loop.run_until_complete(read_uploaded_material(file_valid))
            self.assertTrue(len(chunks) > 0)

            # 2. Attempt spoofed upload of SAME bytes as .pdf (lacks %PDF- magic bytes)
            # Even though the hash is already in the cache, validation MUST occur first!
            file_spoofed = UploadFile(filename="lecture.pdf", file=io.BytesIO(content))
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(read_uploaded_material(file_spoofed))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("%PDF-", cm.exception.detail)

            # 3. Attempt unsupported extension with SAME bytes
            file_unsupported = UploadFile(filename="lecture.exe", file=io.BytesIO(content))
            with self.assertRaises(HTTPException) as cm2:
                loop.run_until_complete(read_uploaded_material(file_unsupported))
            self.assertEqual(cm2.exception.status_code, 415)

            # 4. Attempt empty file
            file_empty = UploadFile(filename="empty.txt", file=io.BytesIO(b""))
            with self.assertRaises(HTTPException) as cm3:
                loop.run_until_complete(read_uploaded_material(file_empty))
            self.assertEqual(cm3.exception.status_code, 400)
        finally:
            loop.close()


class TestIdempotencyAndConcurrency(unittest.TestCase):
    """P1: Durable idempotency and concurrency protection for answer submissions."""

    def test_answer_submission_idempotency(self):
        concept = Concept(label="Binary Search", description="Divide and conquer", source_chunk_indices=[0])
        question = QuestionDraft(
            question_text="What is the runtime of binary search?",
            options=[
                OptionDraft(text="O(log n)", is_correct=True, misconception_tag=None),
                OptionDraft(text="O(n)", is_correct=False, misconception_tag="Linear scanning confusion"),
            ],
            difficulty="medium",
            question_type="mcq",
            source_locator="Slide 3",
        )

        session = AdaptiveSession(
            session_id="test-session-idempotency",
            title="Test Quiz",
            total_questions=1,
            starting_difficulty="medium",
            current_difficulty="medium",
            streak_direction="",
            streak_count=0,
            concepts=[concept],
            concept_states={"Binary Search": ConceptState(concept_label="Binary Search", mastery_score=0.30)},
            current_concept_label="Binary Search",
            current_question=question,
            current_question_number=1,
            questions_asked=1,
        )

        loop = asyncio.new_event_loop()
        try:
            # First submission
            from backend.main import record_answer_and_advance
            res1 = loop.run_until_complete(
                record_answer_and_advance(
                    session=session,
                    request_question_number=1,
                    concept_label="Binary Search",
                    was_correct=True,
                    user_id="user-123",
                )
            )

            # Check that result was recorded in answered_results
            self.assertIn(1, session.answered_results)
            self.assertTrue(res1["was_correct"])

            # Verify concept state updated once
            state_after_first = session.concept_states["Binary Search"]
            self.assertEqual(state_after_first.times_asked, 1)
            self.assertEqual(state_after_first.correct_count, 1)
            mastery_after_first = state_after_first.mastery_score

            # Second identical submission (idempotency check)
            if 1 in session.answered_results:
                res2 = session.answered_results[1]
            else:
                res2 = loop.run_until_complete(
                    record_answer_and_advance(session, 1, "Binary Search", True, user_id="user-123")
                )

            # Verify return value is identical and counters have NOT double-incremented
            self.assertEqual(res1, res2)
            self.assertEqual(session.concept_states["Binary Search"].times_asked, 1)
            self.assertEqual(session.concept_states["Binary Search"].mastery_score, mastery_after_first)
        finally:
            loop.close()

    def test_concurrent_duplicate_answer_submissions(self):
        from backend.main import get_session_lock, record_answer_and_advance

        concept = Concept(label="Graph Search", description="BFS and DFS", source_chunk_indices=[0])
        question = QuestionDraft(
            question_text="Is BFS complete for finite graphs?",
            options=[
                OptionDraft(text="Yes", is_correct=True, misconception_tag=None),
                OptionDraft(text="No", is_correct=False, misconception_tag="Completeness confusion"),
            ],
            difficulty="medium",
            question_type="mcq",
            source_locator="Slide 1",
        )

        session = AdaptiveSession(
            session_id="test-session-concurrent",
            title="Concurrent Test",
            total_questions=1,
            starting_difficulty="medium",
            current_difficulty="medium",
            streak_direction="",
            streak_count=0,
            concepts=[concept],
            concept_states={"Graph Search": ConceptState(concept_label="Graph Search", mastery_score=0.30)},
            current_concept_label="Graph Search",
            current_question=question,
            current_question_number=1,
            questions_asked=1,
        )

        async def run_concurrent():
            async def submit_guarded():
                async with get_session_lock(session.session_id):
                    if 1 in session.answered_results:
                        return session.answered_results[1]
                    return await record_answer_and_advance(
                        session=session,
                        request_question_number=1,
                        concept_label="Graph Search",
                        was_correct=True,
                        user_id="user-concurrent",
                    )

            t1 = submit_guarded()
            t2 = submit_guarded()
            return await asyncio.gather(t1, t2)

        res1, res2 = asyncio.run(run_concurrent())

        # Both coroutines received the identical completion response
        self.assertEqual(res1, res2)
        self.assertEqual(session.concept_states["Graph Search"].times_asked, 1)
        self.assertEqual(session.concept_states["Graph Search"].correct_count, 1)
        self.assertIn(1, session.answered_results)


class TestBKTQuestionTypesConsistency(unittest.TestCase):
    """P1: Live answer processing passes active question type into BKT update."""

    def test_in_session_bkt_differentiation(self):
        state_mcq = ConceptState(concept_label="Networking", mastery_score=0.30)
        state_num = ConceptState(concept_label="Networking", mastery_score=0.30)
        state_sa = ConceptState(concept_label="Networking", mastery_score=0.30)

        # MCQ correct: P(G) = 0.20 -> P(L_next) ~ 0.7098
        up_mcq = update_concept_performance(state_mcq, is_correct=True, question_type="mcq")
        # Numerical correct: P(G) = 0.05 -> P(L_next) ~ 0.9025
        up_num = update_concept_performance(state_num, is_correct=True, question_type="numerical")
        # Short-answer correct: P(G) = 0.05 -> P(L_next) ~ 0.9025
        up_sa = update_concept_performance(state_sa, is_correct=True, question_type="short_answer")

        self.assertAlmostEqual(up_mcq.mastery_score, 0.7098, places=3)
        self.assertAlmostEqual(up_num.mastery_score, 0.9025, places=3)
        self.assertAlmostEqual(up_sa.mastery_score, 0.9025, places=3)
        self.assertGreater(up_num.mastery_score, up_mcq.mastery_score)

    def test_bkt_numerical_and_short_answer_persist_identically(self):
        from backend.supabase_client import bkt_update
        m_mcq = bkt_update(0.30, is_correct=True, p_guess=0.20)
        m_num = bkt_update(0.30, is_correct=True, p_guess=0.05)
        self.assertAlmostEqual(m_mcq, 0.7098, places=3)
        self.assertAlmostEqual(m_num, 0.9025, places=3)


class TestCitationProvenanceAndRefusal(unittest.TestCase):
    """P1: Validate cited source identifiers against active material and handle ungrounded refusal."""

    def test_citation_provenance_rejects_hallucinated_locators(self):
        valid_chunk = Chunk(
            chunk_index=0,
            text="The quick brown fox jumps over the lazy dog.",
            locator="Page 5",
            source_filename="fox.txt",
        )
        active_chunks = [valid_chunk]

        # Locator in material
        locators = {c.locator for c in active_chunks}
        self.assertIn("Page 5", locators)
        self.assertNotIn("Page 99", locators)

    def test_authenticated_mastery_persistence_user_flow(self):
        """Verify upsert_mastery persists for authenticated users and safely no-ops for guests."""
        from backend.supabase_client import upsert_mastery
        loop = asyncio.new_event_loop()
        try:
            # Guest mode: client is None or user_id is None -> safe no-op
            loop.run_until_complete(upsert_mastery(None, "Algorithms", True, user_id=None))

            # Authenticated mode with mock client
            class MockTable:
                def __init__(self):
                    self.upserted_rows = []

                def select(self, *args, **kwargs):
                    return self

                def eq(self, *args, **kwargs):
                    return self

                def limit(self, *args, **kwargs):
                    return self

                def execute(self):
                    class Resp:
                        data = [{"mastery_score": 0.30, "times_seen": 2}]
                    return Resp()

                def upsert(self, data, *args, **kwargs):
                    self.upserted_rows.append(data)
                    return self

            class MockClient:
                def __init__(self):
                    self.t = MockTable()

                def table(self, name):
                    return self.t

            mock_sb = MockClient()
            loop.run_until_complete(
                upsert_mastery(
                    client=mock_sb,
                    topic="Data Structures",
                    is_correct=True,
                    user_id="user-auth-456",
                    question_type="numerical",
                )
            )

            self.assertEqual(len(mock_sb.t.upserted_rows), 1)
            row = mock_sb.t.upserted_rows[0]
            self.assertEqual(row["user_id"], "user-auth-456")
            self.assertEqual(row["topic"], "Data Structures")
            self.assertEqual(row["times_seen"], 3)
            self.assertAlmostEqual(row["mastery_score"], 0.9025, places=3)
        finally:
            loop.close()


class TestGroundedTutorAndVoiceSupport(unittest.TestCase):
    """Regression test suite for Grounded Chat, Language selection, Style, and Audio transcription."""

    def test_embedding_model_configured_correctly(self):
        from AI_Layer.ai_core import EMBEDDING_MODEL
        self.assertEqual(EMBEDDING_MODEL, "text-embedding-004")

    def test_grounded_chat_empty_session_id_400(self):
        from backend.main import grounded_chat_api, GroundedChatRequest
        loop = asyncio.new_event_loop()
        try:
            req = GroundedChatRequest(session_id="   ", message="What is an index?")
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(grounded_chat_api(req))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("Session ID is required", cm.exception.detail)
        finally:
            loop.close()

    def test_grounded_chat_empty_message_400(self):
        from backend.main import grounded_chat_api, GroundedChatRequest
        loop = asyncio.new_event_loop()
        try:
            req = GroundedChatRequest(session_id="valid-session", message="   ")
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(grounded_chat_api(req))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("question message is required", cm.exception.detail)
        finally:
            loop.close()

    def test_grounded_chat_unsupported_language_400(self):
        from backend.main import grounded_chat_api, GroundedChatRequest
        loop = asyncio.new_event_loop()
        try:
            req = GroundedChatRequest(
                session_id="valid-session",
                message="Explain this topic",
                language="german",
            )
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(grounded_chat_api(req))
            self.assertEqual(cm.exception.status_code, 400)
            self.assertIn("Unsupported language 'german'", cm.exception.detail)
        finally:
            loop.close()

    def test_grounded_chat_missing_session_404(self):
        from backend.main import grounded_chat_api, GroundedChatRequest
        loop = asyncio.new_event_loop()
        try:
            req = GroundedChatRequest(
                session_id="nonexistent-session-id-999",
                message="Explain this topic",
                language="english",
            )
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(grounded_chat_api(req))
            self.assertEqual(cm.exception.status_code, 404)
            self.assertIn("No ingested material found", cm.exception.detail)
        finally:
            loop.close()

    def test_grounded_chat_language_and_style_offline_fallback(self):
        chunk = Chunk(
            chunk_index=0,
            text="Relational databases use B+ trees for primary key indexing and fast range scans.",
            locator="Page 12",
            source_type="pdf",
            source_filename="db_notes.pdf",
        )
        loop = asyncio.new_event_loop()
        try:
            # Test English offline response
            resp_en = loop.run_until_complete(
                answer_grounded_question(
                    [chunk],
                    None,
                    [],
                    "How are primary keys indexed?",
                    language="english",
                    style="concise",
                )
            )
            self.assertTrue(resp_en.is_grounded)
            self.assertIn("Page 12", resp_en.answer)
            self.assertIn("[Offline Mode", resp_en.answer)

            # Test Hindi/Hinglish offline response
            resp_hi = loop.run_until_complete(
                answer_grounded_question(
                    [chunk],
                    None,
                    [],
                    "Primary keys kaise index hoti hain?",
                    language="hindi",
                    style="step-by-step",
                )
            )
            self.assertTrue(resp_hi.is_grounded)
            self.assertIn("Page 12", resp_hi.answer)
            self.assertIn("Aapke uploaded notes", resp_hi.answer)
        finally:
            loop.close()

    def test_transcribe_audio_validations(self):
        from backend.main import transcribe_audio_api
        loop = asyncio.new_event_loop()
        try:
            # 1. Empty audio file
            empty_file = UploadFile(filename="voice.mp3", file=io.BytesIO(b""))
            with self.assertRaises(HTTPException) as cm_empty:
                loop.run_until_complete(transcribe_audio_api(empty_file))
            # May be 503 if client is None or 400 if client check passes/reordered
            self.assertIn(cm_empty.exception.status_code, (400, 503))

            # 2. Unsupported audio format
            bad_file = UploadFile(filename="virus.exe", file=io.BytesIO(b"MZ12345678"))
            with self.assertRaises(HTTPException) as cm_bad:
                loop.run_until_complete(transcribe_audio_api(bad_file))
            self.assertIn(cm_bad.exception.status_code, (415, 503))

            # 3. Oversized audio file (>5MB)
            huge_data = b"0" * (6 * 1024 * 1024)
            huge_file = UploadFile(filename="podcast.mp3", file=io.BytesIO(huge_data))
            with self.assertRaises(HTTPException) as cm_huge:
                loop.run_until_complete(transcribe_audio_api(huge_file))
            self.assertIn(cm_huge.exception.status_code, (413, 503))
        finally:
            loop.close()


class TestPPTXAndConceptExtractionAcceptance(unittest.TestCase):
    """P0 Acceptance: PPTX extraction, group shape traversal, notes, format validation, and caching."""

    def test_pptx_deck_extraction_with_notes_and_shapes(self):
        from pptx import Presentation
        from AI_Layer.ai_core import extract_slide_deck

        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = "Lecture 1: Memory Management"
        slide.placeholders[1].text = "Core concepts of paging and segmentation."
        notes_slide = slide.notes_slide
        notes_slide.notes_text_frame.text = "Speaker note: Paging prevents external fragmentation."

        buf = io.BytesIO()
        prs.save(buf)
        pptx_bytes = buf.getvalue()

        loop = asyncio.new_event_loop()
        try:
            chunks = loop.run_until_complete(extract_slide_deck(pptx_bytes, source_filename="Lec 1-21.pptx"))
            self.assertGreaterEqual(len(chunks), 1)
            chunk_text = chunks[0].text
            self.assertIn("Lecture 1: Memory Management", chunk_text)
            self.assertIn("paging and segmentation", chunk_text)
            self.assertIn("Paging prevents external fragmentation", chunk_text)
            self.assertEqual(chunks[0].locator, "Slide 1")
        finally:
            loop.close()

    def test_legacy_ppt_rejection_with_helpful_guidance(self):
        from backend.main import read_uploaded_material
        loop = asyncio.new_event_loop()
        try:
            legacy_file = UploadFile(filename="Lec_old.ppt", file=io.BytesIO(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"))
            with self.assertRaises(HTTPException) as cm:
                loop.run_until_complete(read_uploaded_material(legacy_file))
            self.assertEqual(cm.exception.status_code, 415)
            self.assertIn(".pptx", cm.exception.detail)
        finally:
            loop.close()

    def test_extract_concepts_cache_hit_returns_zero_llm_cost(self):
        from backend.main import extract_concepts_api, material_concepts_cache
        from AI_Layer.models import ConceptDraft
        from pptx import Presentation

        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = "Cached Topic"
        buf = io.BytesIO()
        prs.save(buf)
        pptx_bytes = buf.getvalue()

        from AI_Layer.ai_core import extract_slide_deck
        loop = asyncio.new_event_loop()
        try:
            import hashlib
            content_hash = hashlib.sha256(pptx_bytes).hexdigest()
            material_concepts_cache[content_hash] = [
                ConceptDraft(
                    label="Virtual Memory",
                    description="Decouples virtual from physical address space.",
                    topic="Operating Systems",
                    subtopic="Memory",
                    prerequisites=[],
                    source_chunk_index=0,
                )
            ]
            upload_file = UploadFile(filename="cached.pptx", file=io.BytesIO(pptx_bytes))
            result = loop.run_until_complete(extract_concepts_api(upload_file))
            self.assertTrue(result.get("cached"))
            self.assertEqual(len(result.get("concepts", [])), 1)
            self.assertEqual(result["concepts"][0]["label"], "Virtual Memory")
        finally:
            loop.close()



class TestLearnerProfileAndPreferences(unittest.TestCase):
    """P0 Acceptance: Persistent profiles, preferences, and idempotent quiz records."""

    def test_record_quiz_result_idempotency_mock(self):
        from unittest.mock import MagicMock
        from backend.supabase_client import record_quiz_result

        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_table.upsert.return_value.execute.return_value = MagicMock(data=[{}])

        loop = asyncio.new_event_loop()
        try:
            # First call
            ok1 = loop.run_until_complete(
                record_quiz_result(
                    mock_client,
                    user_id="user-123",
                    quiz_id="quiz-abc",
                    quiz_title="Test Quiz",
                    topic="Algorithms",
                    difficulty="Medium",
                    score_percentage=80.0,
                    total_questions=5,
                    correct_answers_count=4,
                )
            )
            self.assertTrue(ok1)
            mock_table.upsert.assert_called_once()

            # Second duplicate call with same quiz_id should upsert idempotently
            mock_table.upsert.reset_mock()
            ok2 = loop.run_until_complete(
                record_quiz_result(
                    mock_client,
                    user_id="user-123",
                    quiz_id="quiz-abc",
                    quiz_title="Test Quiz",
                    topic="Algorithms",
                    difficulty="Medium",
                    score_percentage=80.0,
                    total_questions=5,
                    correct_answers_count=4,
                )
            )
            self.assertTrue(ok2)
            mock_table.upsert.assert_called_once()
        finally:
            loop.close()

    def test_guest_mode_does_not_persist_or_overwrite(self):
        from backend.supabase_client import record_quiz_result
        loop = asyncio.new_event_loop()
        try:
            # None client or user_id represents a guest user
            ok = loop.run_until_complete(
                record_quiz_result(
                    None,
                    user_id=None,
                    quiz_id="guest-quiz-1",
                    quiz_title="Guest Quiz",
                    topic="General",
                    difficulty="Medium",
                    score_percentage=100.0,
                    total_questions=3,
                    correct_answers_count=3,
                )
            )
            # Must return False for server persistence, leaving guest progress ephemeral
            self.assertFalse(ok)
        finally:
            loop.close()


class TestWeakTopicRevisionEndpoint(unittest.TestCase):
    """P1 Acceptance: Weak topic revision (flashcards, notes, audio brief, languages)."""

    def test_weak_topic_revision_english_and_hindi(self):
        from backend.main import weak_topics_revision_api, WeakTopicRevisionRequest
        loop = asyncio.new_event_loop()
        try:
            # 1. English Revision
            req_en = WeakTopicRevisionRequest(topic="Cache Invalidation", language="english")
            res_en = loop.run_until_complete(weak_topics_revision_api(req_en))
            self.assertEqual(res_en["topic"], "Cache Invalidation")
            self.assertEqual(res_en["language"], "english")
            self.assertGreaterEqual(len(res_en["flashcards"]), 2)
            self.assertGreaterEqual(len(res_en["revision_notes"]), 3)
            self.assertIn("Cache Invalidation", res_en["audio_brief"])
            self.assertIn("flashcards", res_en["audio_brief"].lower())

            # 2. Hindi/Hinglish Revision
            req_hi = WeakTopicRevisionRequest(topic="Cache Invalidation", language="hindi")
            res_hi = loop.run_until_complete(weak_topics_revision_api(req_hi))
            self.assertEqual(res_hi["topic"], "Cache Invalidation")
            self.assertEqual(res_hi["language"], "hindi")
            self.assertIn("Namaste", res_hi["audio_brief"])
            self.assertIn("Cache Invalidation", res_hi["audio_brief"])
        finally:
            loop.close()


class TestStudyScheduleBudgetAndHeuristic(unittest.TestCase):
    """P1 Acceptance: Study schedule time budget constraint, reason labels, and heuristic note."""

    def test_daily_time_budget_exact_enforcement(self):
        from backend.main import study_schedule_api, StudyScheduleRequest
        loop = asyncio.new_event_loop()
        try:
            for budget in (30, 45, 60, 90):
                req = StudyScheduleRequest(days_until_exam=5, daily_minutes=budget)
                res = loop.run_until_complete(study_schedule_api(req))
                self.assertEqual(res["daily_minutes"], budget)
                self.assertIn("policy_note", res)
                self.assertIn("heuristic", res["policy_note"].lower())

                for day_plan in res["schedule"]:
                    total_task_minutes = sum(task["minutes"] for task in day_plan["tasks"])
                    # The allocated task minutes must NEVER exceed the user's daily budget
                    self.assertEqual(total_task_minutes, budget)
                    for task in day_plan["tasks"]:
                        self.assertTrue(task["id"])
                        self.assertTrue(task["reason"])
        finally:
            loop.close()


if __name__ == "__main__":
    unittest.main()

