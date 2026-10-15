"""
Comprehensive Automated Acceptance Test Suite for Multi-File Unified Ingestion.
Tests:
 1. Uploading a PDF and PPTX together.
 2. Uploading several files of different supported formats (PDF, PPTX, TXT, MD).
 3. A mixture of successful and failed files.
 4. Duplicate file content and cache reuse.
 5. Correct source filename and locator preservation.
 6. Quiz generation using chunks from multiple files.
 7. Tutor retrieval and citations across multiple files.
 8. Course DAG extraction across a collection.
 9. User A cannot access User B's collection (ownership enforcement).
 10. Collection and extracted content survive a simulated new backend invocation.
 11. Legacy single-file upload remains functional.
 12. Partial extraction is reported accurately.

Note: All tests run fully offline with zero live Gemini API key usage.
"""

import asyncio
import io
import json
import os
import sys
import unittest
from unittest.mock import AsyncMock, patch

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import HTTPException, UploadFile
from AI_Layer.models import (
    BatchIngestionResponse,
    Chunk,
    Citation,
    Concept,
    ConceptDraft,
    ConceptState,
    FileIngestionResult,
    GroundedChatResponse,
    MaterialCollection,
    MaterialDocument,
)
from backend.main import (
    app,
    ingest_collection_api,
    get_collection_api,
    extract_concepts_api,
    start_adaptive_quiz,
    grounded_chat_api,
    GroundedChatRequest,
    get_material,
    material_collections,
    material_chunks_cache,
    material_concepts_cache,
)


def create_mock_upload_file(
    filename: str,
    content: bytes,
    content_type: str = "text/plain",
) -> UploadFile:
    """Helper to construct an UploadFile for FastAPI testing."""
    file_obj = io.BytesIO(content)
    return UploadFile(
        file=file_obj,
        filename=filename,
        headers={"content-type": content_type},
    )


def create_minimal_pdf_bytes(text: str = "Operating Systems and Kernel Space") -> bytes:
    """Minimal valid PDF-like byte payload with %PDF- header."""
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n" + text.encode("utf-8")


def create_minimal_pptx_bytes() -> bytes:
    """Minimal valid PPTX-like byte payload starting with PK\x03\x04 zip header."""
    return b"PK\x03\x04" + b"\x00" * 30 + b"Presentation Slide Deck Content"


class TestMultiFileIngestion(unittest.TestCase):

    def setUp(self):
        # Clear in-memory caches between tests
        material_collections.clear()
        material_chunks_cache.clear()
        material_concepts_cache.clear()
        import shutil
        import tempfile
        d = os.path.join(tempfile.gettempdir(), "flexdemy_material_collections")
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)

    def tearDown(self):
        import shutil
        import tempfile
        d = os.path.join(tempfile.gettempdir(), "flexdemy_material_collections")
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)

    # -------------------------------------------------------------------------
    # Test 1: Uploading a PDF and PPTX together
    # -------------------------------------------------------------------------
    def test_upload_pdf_and_pptx_together(self):
        pdf_file = create_mock_upload_file("textbook.pdf", create_minimal_pdf_bytes(), "application/pdf")
        pptx_file = create_mock_upload_file("lecture1.pptx", create_minimal_pptx_bytes(), "application/vnd.openxmlformats-officedocument.presentationml.presentation")

        with patch("AI_Layer.ai_core.extract_and_chunk", new_callable=AsyncMock) as mock_pdf, \
             patch("AI_Layer.ai_core.extract_slide_deck", new_callable=AsyncMock) as mock_pptx:
            mock_pdf.return_value = [
                Chunk(chunk_index=0, text="Kernel architecture overview", locator="Page 1-2", source_type="pdf")
            ]
            mock_pptx.return_value = [
                Chunk(chunk_index=0, text="Process Scheduling slides", locator="Slide 1", source_type="slide")
            ]

            res: BatchIngestionResponse = asyncio.run(
                ingest_collection_api(files=[pdf_file, pptx_file], collection_id="col_test_1", collection_name="OS Course")
            )

            self.assertEqual(res.collection_id, "col_test_1")
            self.assertEqual(res.total_files, 2)
            self.assertEqual(res.succeeded, 2)
            self.assertEqual(res.failed, 0)
            self.assertEqual(res.total_chunks, 2)
            self.assertEqual(len(res.files), 2)
            self.assertEqual(res.files[0].status, "completed")
            self.assertEqual(res.files[1].status, "completed")

    # -------------------------------------------------------------------------
    # Test 2: Uploading several files of different supported formats (PDF, PPTX, TXT, MD)
    # -------------------------------------------------------------------------
    def test_upload_several_different_supported_formats(self):
        f_pdf = create_mock_upload_file("ch1.pdf", create_minimal_pdf_bytes(), "application/pdf")
        f_pptx = create_mock_upload_file("ch2.pptx", create_minimal_pptx_bytes(), "application/vnd.openxmlformats-officedocument.presentationml.presentation")
        f_txt = create_mock_upload_file("notes.txt", b"Thread synchronization and semaphores", "text/plain")
        f_md = create_mock_upload_file("summary.md", b"# Summary of Virtual Memory\nPaging and segmentation", "text/markdown")

        with patch("AI_Layer.ai_core.extract_and_chunk", new_callable=AsyncMock) as mock_pdf, \
             patch("AI_Layer.ai_core.extract_slide_deck", new_callable=AsyncMock) as mock_pptx:
            mock_pdf.return_value = [Chunk(chunk_index=0, text="Chapter 1 content", locator="Page 1", source_type="pdf")]
            mock_pptx.return_value = [Chunk(chunk_index=0, text="Chapter 2 slides", locator="Slide 1", source_type="slide")]

            res: BatchIngestionResponse = asyncio.run(
                ingest_collection_api(files=[f_pdf, f_pptx, f_txt, f_md], collection_id="col_multi_format")
            )

            self.assertEqual(res.succeeded, 4)
            self.assertEqual(res.failed, 0)
            col = material_collections["col_multi_format"]
            self.assertEqual(len(col.documents), 4)
            formats = {d.mime_type for d in col.documents}
            self.assertTrue(any("pdf" in m for m in formats))
            self.assertTrue(any("openxmlformats" in m for m in formats))

    # -------------------------------------------------------------------------
    # Test 3: Mixture of successful and failed files (valid + empty + unsupported)
    # -------------------------------------------------------------------------
    def test_mixture_of_successful_and_failed_files(self):
        valid_file = create_mock_upload_file("valid.txt", b"Valid operating systems study text", "text/plain")
        empty_file = create_mock_upload_file("empty.txt", b"", "text/plain")
        unsupported_file = create_mock_upload_file("binary.exe", b"\x4d\x5a\x90\x00", "application/octet-stream")
        legacy_ppt = create_mock_upload_file("old_lecture.ppt", b"old binary ppt", "application/vnd.ms-powerpoint")

        res: BatchIngestionResponse = asyncio.run(
            ingest_collection_api(files=[valid_file, empty_file, unsupported_file, legacy_ppt], collection_id="col_mixed")
        )

        self.assertEqual(res.total_files, 4)
        self.assertEqual(res.succeeded, 1)
        self.assertEqual(res.failed, 3)

        # Successful file must not be lost because other files failed
        self.assertEqual(res.files[0].status, "completed")
        self.assertEqual(res.files[1].status, "failed")
        self.assertIn("empty", res.files[1].error.lower())
        self.assertEqual(res.files[2].status, "failed")
        self.assertIn("unsupported", res.files[2].error.lower())
        self.assertEqual(res.files[3].status, "failed")
        self.assertIn(".ppt", res.files[3].error.lower())

        # Collection in memory preserves the 1 successful document
        col = material_collections["col_mixed"]
        self.assertEqual(len(col.documents), 1)
        self.assertEqual(col.documents[0].filename, "valid.txt")

    # -------------------------------------------------------------------------
    # Test 4: Duplicate file content and cache reuse
    # -------------------------------------------------------------------------
    def test_duplicate_file_content_and_cache_reuse(self):
        content = b"Exact identical text in both files for deduplication verification"
        file1 = create_mock_upload_file("doc1.txt", content, "text/plain")
        file2 = create_mock_upload_file("doc1_copy.txt", content, "text/plain")

        res: BatchIngestionResponse = asyncio.run(
            ingest_collection_api(files=[file1, file2], collection_id="col_dedup")
        )

        self.assertEqual(res.succeeded, 1)
        self.assertEqual(res.skipped_duplicates, 1)
        self.assertEqual(res.files[0].status, "completed")
        self.assertEqual(res.files[1].status, "skipped_duplicate")
        self.assertTrue(res.files[1].cached)

    # -------------------------------------------------------------------------
    # Test 5: Correct source filename and locator preservation
    # -------------------------------------------------------------------------
    def test_correct_source_filename_and_locator_preservation(self):
        f1 = create_mock_upload_file("Algorithms.txt", b"Divide and conquer algorithmic strategies", "text/plain")
        res: BatchIngestionResponse = asyncio.run(
            ingest_collection_api(files=[f1], collection_id="col_provenance")
        )

        col = material_collections["col_provenance"]
        self.assertEqual(len(col.all_chunks), 1)
        chunk = col.all_chunks[0]

        self.assertEqual(chunk.source_filename, "Algorithms.txt")
        self.assertEqual(chunk.collection_id, "col_provenance")
        self.assertTrue(chunk.doc_id.startswith("doc_"))
        self.assertTrue(len(chunk.content_hash) > 10)
        self.assertEqual(chunk.chunk_index, 0)

    # -------------------------------------------------------------------------
    # Test 6: Quiz generation using chunks from multiple files
    # -------------------------------------------------------------------------
    def test_quiz_generation_using_chunks_from_multiple_files(self):
        # Prepare collection with chunks from 2 distinct files
        col = MaterialCollection(
            collection_id="col_quiz_multi",
            name="Multi-Doc Exam Prep",
            documents=[
                MaterialDocument(doc_id="doc_1", filename="Networking.txt", content_hash="hash1", mime_type="text/plain", size_bytes=100, chunk_count=1),
                MaterialDocument(doc_id="doc_2", filename="Databases.txt", content_hash="hash2", mime_type="text/plain", size_bytes=100, chunk_count=1),
            ],
            all_chunks=[
                Chunk(chunk_index=0, text="TCP three-way handshake", locator="Sec 1", source_filename="Networking.txt", collection_id="col_quiz_multi", doc_id="doc_1"),
                Chunk(chunk_index=1, text="ACID properties and isolation levels", locator="Sec 2", source_filename="Databases.txt", collection_id="col_quiz_multi", doc_id="doc_2"),
            ]
        )
        material_collections["col_quiz_multi"] = col

        # Mock question generation so 0 live Gemini API calls are made
        from AI_Layer.models import QuestionDraft, OptionDraft
        mock_question = QuestionDraft(
            question_text="Which packet is sent first in a TCP handshake?",
            options=[
                OptionDraft(text="SYN", is_correct=True),
                OptionDraft(text="ACK", is_correct=False),
            ],
            difficulty="medium",
            topic="Networking",
            concept_label="TCP Handshake",
            source_locator="Sec 1",
        )

        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract, \
             patch("AI_Layer.ai_core.generate_validated_question", new_callable=AsyncMock) as mock_q:
            mock_extract.return_value = [
                ConceptDraft(label="TCP Handshake", description="Connection establishment", topic="Networking", subtopic="", prerequisites=[], source_chunk_index=0),
                ConceptDraft(label="ACID Properties", description="Transaction guarantees", topic="Databases", subtopic="", prerequisites=[], source_chunk_index=1),
            ]
            mock_q.return_value = mock_question

            # Start quiz passing collection_id and no file
            launch = asyncio.run(
                start_adaptive_quiz(
                    file=None,
                    collection_id="col_quiz_multi",
                    title="Comprehensive CS Quiz",
                    difficulty="medium",
                    question_count=5,
                )
            )

            self.assertIn("session_id", launch)
            self.assertEqual(launch["title"], "Comprehensive CS Quiz")
            self.assertEqual(len(launch["concepts"]), 2)

    # -------------------------------------------------------------------------
    # Test 7: Tutor retrieval and citations across multiple files
    # -------------------------------------------------------------------------
    def test_tutor_retrieval_and_citations_across_multiple_files(self):
        col = MaterialCollection(
            collection_id="col_tutor_multi",
            name="Course Materials",
            documents=[
                MaterialDocument(doc_id="doc_pdf", filename="OS_Book.pdf", content_hash="h1", mime_type="application/pdf", chunk_count=1),
                MaterialDocument(doc_id="doc_pptx", filename="Lecture_Slides.pptx", content_hash="h2", mime_type="application/vnd.openxmlformats", chunk_count=1),
            ],
            all_chunks=[
                Chunk(chunk_index=0, text="Deadlock conditions include mutual exclusion and hold-and-wait.", locator="Page 142", source_filename="OS_Book.pdf", collection_id="col_tutor_multi", doc_id="doc_pdf"),
                Chunk(chunk_index=1, text="Banker algorithm avoids deadlock by checking safe states.", locator="Slide 18", source_filename="Lecture_Slides.pptx", collection_id="col_tutor_multi", doc_id="doc_pptx"),
            ]
        )
        material_collections["col_tutor_multi"] = col

        req = GroundedChatRequest(
            collection_id="col_tutor_multi",
            message="What is the banker algorithm?",
        )

        resp = asyncio.run(grounded_chat_api(request=req))

        is_grounded = resp.get("is_grounded") if isinstance(resp, dict) else resp.is_grounded
        citations = resp.get("citations") if isinstance(resp, dict) else resp.citations

        self.assertTrue(is_grounded)
        self.assertGreaterEqual(len(citations), 1)
        citation = citations[0]
        c_src = citation["source_filename"] if isinstance(citation, dict) else citation.source_filename
        c_loc = citation["locator"] if isinstance(citation, dict) else citation.locator
        c_col = citation["collection_id"] if isinstance(citation, dict) else citation.collection_id

        self.assertEqual(c_src, "Lecture_Slides.pptx")
        self.assertEqual(c_loc, "Slide 18")
        self.assertEqual(c_col, "col_tutor_multi")

    # -------------------------------------------------------------------------
    # Test 8: Course DAG extraction across a collection
    # -------------------------------------------------------------------------
    def test_course_dag_extraction_across_collection(self):
        col = MaterialCollection(
            collection_id="col_dag",
            all_chunks=[
                Chunk(chunk_index=0, text="Variables and data types", locator="Page 1", source_filename="Intro.pdf"),
                Chunk(chunk_index=1, text="Functions and recursion", locator="Slide 5", source_filename="Advanced.pptx"),
            ]
        )
        material_collections["col_dag"] = col

        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = [
                ConceptDraft(label="Variables", description="Storage locations", topic="Basics", subtopic="", prerequisites=[], source_chunk_index=0),
                ConceptDraft(label="Recursion", description="Self-referencing functions", topic="Basics", subtopic="", prerequisites=["Variables"], source_chunk_index=1),
            ]

            data = asyncio.run(
                extract_concepts_api(file=None, collection_id="col_dag")
            )

            self.assertEqual(data["chunk_count"], 2)
            self.assertEqual(len(data["concepts"]), 2)
            self.assertEqual(data["concepts"][1]["prerequisites"], ["Variables"])

    # -------------------------------------------------------------------------
    # Test 9: User A cannot access User B's collection (403 Unauthorized)
    # -------------------------------------------------------------------------
    def test_user_ownership_isolation(self):
        col = MaterialCollection(
            collection_id="col_user_a",
            user_id="user_aaa_111",
            all_chunks=[Chunk(chunk_index=0, text="Private research notes")]
        )
        material_collections["col_user_a"] = col

        # User B attempts to access User A's collection via extract-concepts
        with patch("backend.main.get_user_id", return_value="user_bbb_222"):
            with self.assertRaises(HTTPException) as cm:
                asyncio.run(extract_concepts_api(file=None, collection_id="col_user_a"))
            self.assertEqual(cm.exception.status_code, 403)

            # User B attempts to view User A's collection via get_collection_api
            with self.assertRaises(HTTPException) as cm2:
                asyncio.run(get_collection_api(collection_id="col_user_a"))
            self.assertEqual(cm2.exception.status_code, 403)

    # -------------------------------------------------------------------------
    # Test 10: Collection and extracted content survive simulated new backend invocation
    # -------------------------------------------------------------------------
    def test_collection_survives_simulated_cold_start(self):
        col_id = "col_cold_start"
        initial_col = MaterialCollection(
            collection_id=col_id,
            name="Durable Collection",
            user_id="user_123",
            documents=[
                MaterialDocument(doc_id="doc_1", filename="durable.txt", content_hash="hash_durable", mime_type="text/plain", chunk_count=1)
            ],
            all_chunks=[
                Chunk(chunk_index=0, text="Durable chunk text surviving instance restart", locator="Page 1", source_filename="durable.txt", collection_id=col_id)
            ]
        )

        # Simulate save to Supabase
        serialized_data = initial_col.model_dump(mode="json")

        # Simulate new serverless invocation / cold start: in-memory cache is wiped!
        material_collections.clear()
        self.assertNotIn(col_id, material_collections)

        # Mock loading from Supabase table
        with patch("backend.main.load_material_collection", new_callable=AsyncMock) as mock_load:
            mock_load.return_value = serialized_data

            material = asyncio.run(get_material(col_id, user_id="user_123"))

            self.assertIsNotNone(material)
            self.assertEqual(len(material["chunks"]), 1)
            self.assertEqual(material["chunks"][0].text, "Durable chunk text surviving instance restart")
            self.assertEqual(material["collection_id"], col_id)

    # -------------------------------------------------------------------------
    # Test 11: Legacy single-file upload remains functional
    # -------------------------------------------------------------------------
    def test_legacy_single_file_upload_remains_functional(self):
        single_file = create_mock_upload_file("single_legacy.txt", b"Single document backward compatibility test", "text/plain")

        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = [
                ConceptDraft(label="Legacy Concept", description="Single file extraction", topic="General", subtopic="", prerequisites=[], source_chunk_index=0)
            ]

            res = asyncio.run(extract_concepts_api(file=single_file, collection_id=None))

            self.assertEqual(res["filename"], "single_legacy.txt")
            self.assertEqual(len(res["concepts"]), 1)
            self.assertEqual(res["concepts"][0]["label"], "Legacy Concept")

    # -------------------------------------------------------------------------
    # Test 12: Partial extraction is reported accurately
    # -------------------------------------------------------------------------
    def test_partial_extraction_reported_accurately(self):
        f = create_mock_upload_file("lecture.mp4", b"\x00\x00\x00\x18ftypmp42", "video/mp4")

        with patch("backend.main.read_uploaded_material", new_callable=AsyncMock) as mock_read:
            # Video processed video frames but transcription was unavailable -> partial status
            mock_read.return_value = [
                Chunk(
                    chunk_index=0,
                    text="Video visual frame content only",
                    locator="00:00-00:30",
                    extraction_status="partial",
                    warnings=["Audio transcription API unconfigured; visual frames extracted only."],
                )
            ]

            res: BatchIngestionResponse = asyncio.run(
                ingest_collection_api(files=[f], collection_id="col_partial")
            )

            self.assertEqual(res.succeeded, 1)
            self.assertEqual(res.files[0].status, "partial")
            self.assertIn("Audio transcription", res.files[0].warnings[0])
            col = material_collections["col_partial"]
            self.assertEqual(col.documents[0].status, "partial")


if __name__ == "__main__":
    unittest.main()
