"""
Comprehensive regression tests for Flexdemy Course Map Concept Extraction and Collection Persistence.
Reproduces and verifies the fix for:
"Material collection 'col_2f104447c5e1' not found or contains no extracted chunks."

Tests cover:
1. Upload and ingestion of 'Agile Numericals.pdf' with real chunks and metadata.
2. Cross-serverless instance persistence (simulated cold start / memory wipe).
3. Concept extraction retrieval without requiring re-upload.
4. Retry concept extraction reusing valid collection chunks.
5. Multi-file collection ingestion and extraction.
6. 404 vs 422 distinction (missing collection vs empty chunks).
7. Frontend API contract alignment.
8. User ownership security rules.
"""
import io
import os
import sys
import time
import unittest
import uuid
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

from backend.main import (
    app,
    material_collections,
    material_concepts_cache,
    material_chunks_cache,
    ingestion_jobs,
)
from backend.supabase_client import (
    save_material_collection,
    load_material_collection,
    _load_collection_from_disk,
)
from AI_Layer.models import (
    Chunk,
    MaterialCollection,
    MaterialDocument,
    ConceptDraft,
)


def create_agile_numericals_pdf() -> bytes:
    """Generate a real valid PDF matching 'Agile Numericals.pdf'."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.drawString(100, 750, "Agile Numericals and Estimation Techniques")
    c.drawString(100, 720, "1. Velocity: A team completed 45, 50, and 40 story points in Sprints 1, 2, and 3.")
    c.drawString(100, 700, "Average velocity = (45 + 50 + 40) / 3 = 45 story points per sprint.")
    c.drawString(100, 670, "2. Little's Law for Kanban: Lead Time = Work in Progress (WIP) / Throughput.")
    c.drawString(100, 640, "Average cycle time calculation with WIP limits and flow efficiency.")
    c.drawString(100, 610, "3. Sprint Burndown: Tracking daily remaining effort against ideal burn rate.")
    c.showPage()
    c.save()
    return buf.getvalue()


def create_second_test_pdf() -> bytes:
    """Generate a second valid PDF for multi-file collection testing."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    c.drawString(100, 750, "Kanban Metrics and Cumulative Flow")
    c.drawString(100, 720, "1. Cumulative Flow Diagram (CFD) reveals bottlenecks and work in progress.")
    c.drawString(100, 700, "2. Lead time distribution and percentile service level expectations.")
    c.showPage()
    c.save()
    return buf.getvalue()


class TestCourseMapCollectionExtraction(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.mock_concepts = [
            ConceptDraft(
                label="Agile Velocity",
                topic="Agile Estimation",
                description="Measure of the amount of work a Team can tackle during a single Sprint.",
                prerequisites=[],
                source_chunk_index=0,
            ),
            ConceptDraft(
                label="Little's Law",
                topic="Flow Metrics",
                description="Mathematical principle relating Work in Progress, Lead Time, and Throughput.",
                prerequisites=["Agile Velocity"],
                source_chunk_index=0,
            ),
            ConceptDraft(
                label="Sprint Burndown Rate",
                topic="Sprint Tracking",
                description="Graphical representation of work left to do versus time.",
                prerequisites=["Agile Velocity"],
                source_chunk_index=0,
            ),
        ]

    def test_upload_agile_numericals_and_extract_concepts_end_to_end(self):
        """
        Step 1 & 2 & 3 & 4:
        Upload 'Agile Numericals.pdf', ingest it, verify collection ID and chunks are stored,
        and verify /extract-concepts retrieves the exact chunks and generates concepts.
        """
        pdf_bytes = create_agile_numericals_pdf()
        file_id = f"file_agile_{uuid.uuid4().hex[:8]}"
        filename = "Agile Numericals.pdf"

        # 1. Upload chunk
        res_upload = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id,
                "chunk_index": 0,
                "total_chunks": 1,
                "filename": filename,
                "file_size": len(pdf_bytes),
            },
            files={"chunk": ("chunk_0", io.BytesIO(pdf_bytes))},
        )
        self.assertEqual(res_upload.status_code, 200)
        upload_data = res_upload.json()
        job_id = upload_data.get("job_id")
        self.assertIsNotNone(job_id)

        # 2. Wait for background job ingestion to complete
        collection_id = None
        for _ in range(30):
            job_res = self.client.get(f"/job-status?job_id={job_id}")
            self.assertEqual(job_res.status_code, 200)
            job_data = job_res.json()
            if job_data.get("stage") == "completed":
                collection_id = job_data.get("collection_id")
                break
            time.sleep(0.05)

        self.assertIsNotNone(collection_id, "Ingestion job did not return collection_id")
        self.assertTrue(collection_id.startswith("col_"), f"Unexpected collection_id format: {collection_id}")

        # 3. Verify collection is persisted with real non-empty chunks
        disk_data = _load_collection_from_disk(collection_id)
        self.assertIsNotNone(disk_data, f"Collection {collection_id} was not persisted to disk cache")
        chunks = disk_data.get("all_chunks") or []
        self.assertGreaterEqual(len(chunks), 1, "Collection must contain at least 1 real chunk")
        self.assertIn("Velocity", chunks[0]["text"])
        self.assertEqual(chunks[0]["source_filename"], filename)

        # 4. Extract concepts using collection_id
        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = self.mock_concepts

            res_extract = self.client.post(
                "/extract-concepts",
                data={"collection_id": collection_id},
            )
            self.assertEqual(res_extract.status_code, 200)
            extract_data = res_extract.json()

            # Confirm extraction retrieves the same chunk and real concepts
            self.assertEqual(extract_data["filename"], filename)
            self.assertEqual(extract_data["chunk_count"], len(chunks))
            self.assertEqual(len(extract_data["concepts"]), 3)
            self.assertEqual(extract_data["concepts"][0]["label"], "Agile Velocity")
            self.assertEqual(extract_data["concepts"][1]["label"], "Little's Law")

    def test_cross_serverless_cold_start_simulation(self):
        """
        Step 7:
        Verify that after uploading on one instance, another serverless instance
        (where in-memory material_collections is completely empty) can retrieve the
        collection from disk/Supabase and successfully extract concepts.
        """
        pdf_bytes = create_agile_numericals_pdf()
        file_id = f"file_cold_{uuid.uuid4().hex[:8]}"
        filename = "Agile Numericals.pdf"

        # Upload
        res_upload = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id,
                "chunk_index": 0,
                "total_chunks": 1,
                "filename": filename,
                "file_size": len(pdf_bytes),
            },
            files={"chunk": ("chunk_0", io.BytesIO(pdf_bytes))},
        )
        job_id = res_upload.json()["job_id"]

        # Poll completion
        collection_id = None
        for _ in range(30):
            job_res = self.client.get(f"/job-status?job_id={job_id}")
            job_data = job_res.json()
            if job_data.get("stage") == "completed":
                collection_id = job_data.get("collection_id")
                break
            time.sleep(0.05)

        self.assertIsNotNone(collection_id)

        # SIMULATE VERCEL COLD START:
        # Wipe in-memory caches to simulate a brand-new Lambda instance
        material_collections.clear()
        self.assertNotIn(collection_id, material_collections)

        # Now call /extract-concepts from the "cold" instance
        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = self.mock_concepts

            res_extract = self.client.post(
                "/extract-concepts",
                data={"collection_id": collection_id},
            )

            # Must succeed without 404
            self.assertEqual(
                res_extract.status_code, 200,
                f"Failed with {res_extract.status_code}: {res_extract.text}"
            )
            data = res_extract.json()
            self.assertEqual(data["filename"], filename)
            self.assertGreaterEqual(data["chunk_count"], 1)
            self.assertEqual(len(data["concepts"]), 3)

    def test_retry_concept_extraction_without_reuploading(self):
        """
        Step 5:
        Clicking 'Retry Concept Extraction' must reuse the existing valid collection
        and its persisted chunks without requiring the student to re-upload.
        """
        cid = f"col_retry_test_{uuid.uuid4().hex[:8]}"
        chunk = Chunk(
            text="Agile numerical formulas for throughput and cycle time.",
            chunk_index=0,
            locator="Page 1",
            source_filename="Agile Numericals.pdf",
            mime_type="application/pdf",
        )
        col = MaterialCollection(
            collection_id=cid,
            name="Agile Numericals.pdf",
            all_chunks=[chunk],
            documents=[
                MaterialDocument(
                    doc_id=f"doc_{cid}",
                    filename="Agile Numericals.pdf",
                    mime_type="application/pdf",
                    format="pdf",
                    size_bytes=1024,
                    chunk_count=1,
                    content_hash=f"hash_{cid}",
                    status="completed",
                )
            ],
        )
        material_collections[cid] = col
        # Persist to disk
        _save_ok = self.client  # ensure app loaded
        from backend.supabase_client import _save_collection_to_disk
        _save_collection_to_disk(cid, col.model_dump(mode="json"))

        # First extraction attempt
        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = self.mock_concepts

            res1 = self.client.post("/extract-concepts", data={"collection_id": cid})
            self.assertEqual(res1.status_code, 200)

            # Retry extraction with same collection_id (e.g. user clicked Retry Concept Extraction)
            res2 = self.client.post("/extract-concepts", data={"collection_id": cid})
            self.assertEqual(res2.status_code, 200)
            data2 = res2.json()
            self.assertEqual(data2["filename"], "Agile Numericals.pdf")
            self.assertEqual(len(data2["concepts"]), 3)

    def test_multi_file_collection_ingestion_and_extraction(self):
        """
        Step 6:
        Ingest multiple files into one collection and confirm extraction spans all files
        while preserving file metadata and citation sources.
        """
        pdf1 = create_agile_numericals_pdf()
        pdf2 = create_second_test_pdf()

        res = self.client.post(
            "/ingest-collection",
            files=[
                ("files", ("Agile Numericals.pdf", io.BytesIO(pdf1), "application/pdf")),
                ("files", ("Kanban Metrics.pdf", io.BytesIO(pdf2), "application/pdf")),
            ],
            data={"collection_name": "Agile & Kanban Combined"},
        )
        self.assertEqual(res.status_code, 200)
        batch_data = res.json()
        cid = batch_data["collection_id"]
        self.assertEqual(batch_data["succeeded"], 2)
        self.assertGreaterEqual(batch_data["total_chunks"], 2)

        # Clear memory to verify persistence across instances
        material_collections.clear()

        with patch("AI_Layer.ai_core.extract_concepts", new_callable=AsyncMock) as mock_extract:
            mock_extract.return_value = self.mock_concepts

            extract_res = self.client.post("/extract-concepts", data={"collection_id": cid})
            self.assertEqual(extract_res.status_code, 200)
            data = extract_res.json()
            self.assertGreaterEqual(data["chunk_count"], 2)
            self.assertEqual(data["filename"], "Agile & Kanban Combined")

    def test_missing_collection_returns_404_actionable_error(self):
        """
        Step 10:
        Non-existent collection must return 404 with a clear message explaining
        that the collection was not found so frontend can offer clean re-ingestion.
        """
        material_collections.clear()
        fake_id = "col_2f104447c5e1_missing"
        res = self.client.post("/extract-concepts", data={"collection_id": fake_id})
        self.assertEqual(res.status_code, 404)
        detail = res.json().get("detail", "")
        self.assertIn(fake_id, detail)
        self.assertIn("not found", detail.lower())

    def test_collection_with_empty_chunks_returns_422(self):
        """
        Step 11:
        Distinguish 404 (missing collection) from 422 (collection exists but no usable text chunks).
        """
        cid = f"col_empty_{uuid.uuid4().hex[:8]}"
        col = MaterialCollection(
            collection_id=cid,
            name="Empty File.pdf",
            all_chunks=[],
            documents=[],
        )
        material_collections[cid] = col

        res = self.client.post("/extract-concepts", data={"collection_id": cid})
        self.assertEqual(res.status_code, 422)
        detail = res.json().get("detail", "")
        self.assertIn("contains no readable text chunks", detail)

    def test_ownership_security_blocks_cross_user_access(self):
        """
        Step 8:
        Preserve authentication, user ownership, and prevent unauthorized cross-user access.
        """
        cid = f"col_user_sec_{uuid.uuid4().hex[:8]}"
        user_a = str(uuid.uuid4())
        user_b = str(uuid.uuid4())

        col = MaterialCollection(
            collection_id=cid,
            name="Private Materials.pdf",
            user_id=user_a,
            all_chunks=[
                Chunk(
                    text="Secret confidential formulas.",
                    chunk_index=0,
                    locator="P1",
                    source_filename="Private.pdf",
                )
            ],
        )
        material_collections[cid] = col

        # Try to access as user_b
        import base64
        import json
        token_b = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." + base64.urlsafe_b64encode(
            json.dumps({"sub": user_b, "exp": int(time.time()) + 3600}).encode()
        ).decode().rstrip("=") + ".signature"

        res = self.client.post(
            "/extract-concepts",
            data={"collection_id": cid},
            headers={"Authorization": f"Bearer {token_b}"},
        )
        self.assertEqual(res.status_code, 403)


if __name__ == "__main__":
    unittest.main()
