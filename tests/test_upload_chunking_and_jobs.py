"""
Tests for chunked upload workflow, asynchronous background jobs, content-hash deduplication,
and video extraction resilience in Flexdemy.
"""
import io
import os
import sys
import unittest
import hashlib
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient
from backend.main import app, material_chunks_cache, ingestion_jobs, material_collections
from AI_Layer.ai_core import extract_video, extract_text_and_chunk, extract_and_chunk


class TestUploadChunkingAndJobs(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_chunked_upload_and_job_status_workflow(self):
        """Verify that slicing a file into chunks and uploading via /upload-chunk creates a job and succeeds."""
        payload = b"A" * (3 * 1024 * 1024)  # 3 MB file
        chunk_size = 1024 * 1024  # 1 MB slices
        file_id = f"test_file_{int(time.time())}"
        total_chunks = 3

        # Upload chunk 0
        res0 = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id,
                "chunk_index": 0,
                "total_chunks": total_chunks,
                "filename": "lecture_notes.txt",
                "file_size": len(payload),
            },
            files={"chunk": ("chunk_0", io.BytesIO(payload[:chunk_size]))},
        )
        self.assertEqual(res0.status_code, 200)
        self.assertEqual(res0.json()["status"], "uploading")

        # Upload chunk 1
        res1 = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id,
                "chunk_index": 1,
                "total_chunks": total_chunks,
                "filename": "lecture_notes.txt",
                "file_size": len(payload),
            },
            files={"chunk": ("chunk_1", io.BytesIO(payload[chunk_size: 2 * chunk_size]))},
        )
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(res1.json()["status"], "uploading")

        # Upload chunk 2 (final chunk)
        res2 = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id,
                "chunk_index": 2,
                "total_chunks": total_chunks,
                "filename": "lecture_notes.txt",
                "file_size": len(payload),
            },
            files={"chunk": ("chunk_2", io.BytesIO(payload[2 * chunk_size:]))},
        )
        self.assertEqual(res2.status_code, 200)
        data = res2.json()
        self.assertIn(data["status"], ["uploaded", "completed"])
        job_id = data["job_id"]
        self.assertTrue(job_id.startswith("job_"))

        # Poll job status
        job_res = self.client.get(f"/job-status?job_id={job_id}")
        self.assertEqual(job_res.status_code, 200)
        job_data = job_res.json()
        self.assertIn(job_data["stage"], ["uploaded", "extracting", "indexing", "completed"])

    def test_content_hash_deduplication_instant_reuse(self):
        """Re-uploading the exact same binary must complete instantly from cache with cached=True."""
        content = b"Unique lecture material for deduplication testing " + str(time.time()).encode()
        file_id_1 = f"file_dedup_1_{int(time.time())}"

        # First upload
        res1 = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id_1,
                "chunk_index": 0,
                "total_chunks": 1,
                "filename": "cs101_notes.txt",
                "file_size": len(content),
            },
            files={"chunk": ("chunk_0", io.BytesIO(content))},
        )
        self.assertEqual(res1.status_code, 200)
        job_id = res1.json()["job_id"]

        # Wait up to 2 seconds for processing to complete and seed material_chunks_cache
        for _ in range(20):
            time.sleep(0.1)
            j = self.client.get(f"/job-status?job_id={job_id}").json()
            if j.get("stage") == "completed":
                break

        # Second upload with identical bytes
        file_id_2 = f"file_dedup_2_{int(time.time())}"
        t0 = time.time()
        res2 = self.client.post(
            "/upload-chunk",
            data={
                "file_id": file_id_2,
                "chunk_index": 0,
                "total_chunks": 1,
                "filename": "cs101_notes.txt",
                "file_size": len(content),
            },
            files={"chunk": ("chunk_0", io.BytesIO(content))},
        )
        elapsed = time.time() - t0
        self.assertEqual(res2.status_code, 200)
        data2 = res2.json()
        self.assertEqual(data2.get("cached"), True)
        self.assertEqual(data2.get("status"), "completed")
        self.assertLess(elapsed, 0.5)  # Must be instant

    def test_video_extraction_segmented_offline_resilience(self):
        """Video extraction handles MP4 payloads without unhandled crashes or infinite loops."""
        import asyncio
        dummy_mp4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42" + (b"\x00" * 1024)
        t0 = time.time()
        chunks = asyncio.run(extract_video(dummy_mp4, filename="sample_lecture.mp4"))
        duration = time.time() - t0

        self.assertGreater(len(chunks), 0)
        self.assertEqual(chunks[0].source_type, "video")
        self.assertEqual(chunks[0].source_filename, "sample_lecture.mp4")
        self.assertTrue("00:00" in chunks[0].locator)
        self.assertLess(duration, 5.0)  # Must return swiftly within bound

    def test_file_format_profiling(self):
        """Profile 2MB PDF, 2MB PPTX, 2MB Text, and 8.6MB MP4 video extraction."""
        import zipfile
        from pptx import Presentation
        from reportlab.pdfgen import canvas
        from pypdf import PdfWriter, PdfReader

        # 1. 2MB Text
        text_2mb = ("Flexdemy plain text lecture notes on algorithms and data structures.\n" * 35000).encode("utf-8")

        # 2. 2MB valid PPTX
        prs = Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[0])
        slide.shapes.title.text = "Flexdemy Machine Learning Course"
        slide.placeholders[1].text = "Introduction to Supervised Learning, Cost Functions, and Neural Networks."
        b_pptx = io.BytesIO()
        prs.save(b_pptx)
        zin = zipfile.ZipFile(io.BytesIO(b_pptx.getvalue()), "r")
        bout_pptx = io.BytesIO()
        zout = zipfile.ZipFile(bout_pptx, "w", compression=zipfile.ZIP_STORED)
        for item in zin.infolist():
            zout.writestr(item, zin.read(item.filename))
        zout.writestr("ppt/media/asset.bin", b"0" * (2 * 1024 * 1024))
        zout.close()
        pptx_2mb = bout_pptx.getvalue()

        # 3. 2MB valid PDF with real extractable text
        b_pdf_raw = io.BytesIO()
        c = canvas.Canvas(b_pdf_raw)
        c.drawString(100, 750, "Flexdemy Machine Learning Course Syllabus and Lecture Notes. " * 5)
        c.drawString(100, 730, "Topics include linear regression, logistic regression, neural networks, backpropagation, and loss optimization. " * 3)
        c.save()
        writer = PdfWriter()
        reader = PdfReader(io.BytesIO(b_pdf_raw.getvalue()))
        writer.add_page(reader.pages[0])
        writer.add_attachment("course_data.bin", b"0" * (2 * 1024 * 1024))
        b_pdf = io.BytesIO()
        writer.write(b_pdf)
        pdf_2mb = b_pdf.getvalue()

        # 4. 8.6MB MP4
        mp4_8_6mb = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42" + (b"\x00" * int(8.6 * 1024 * 1024))

        formats = [
            ("2MB Text", "test_doc.txt", text_2mb),
            ("2MB PPTX", "lecture_slides.pptx", pptx_2mb),
            ("2MB PDF", "handbook.pdf", pdf_2mb),
            ("8.6MB MP4", "lecture_recording.mp4", mp4_8_6mb),
        ]

        print("\n--- INGESTION BENCHMARK PROFILING ---")
        for label, fname, payload in formats:
            t0 = time.time()
            chunk_size = 2 * 1024 * 1024
            total_chunks = max(1, (len(payload) + chunk_size - 1) // chunk_size)
            fid = f"profile_{fname[:4]}_{int(time.time() * 1000)}"

            final_res = None
            for idx in range(total_chunks):
                start = idx * chunk_size
                slice_bytes = payload[start: start + chunk_size]
                final_res = self.client.post(
                    "/upload-chunk",
                    data={
                        "file_id": fid,
                        "chunk_index": idx,
                        "total_chunks": total_chunks,
                        "filename": fname,
                        "file_size": len(payload),
                    },
                    files={"chunk": (f"chunk_{idx}", io.BytesIO(slice_bytes))},
                )
                self.assertEqual(final_res.status_code, 200, f"{label} chunk {idx} failed with {final_res.status_code}")

            upload_dur = time.time() - t0
            res_data = final_res.json()
            job_id = res_data.get("job_id")

            # Wait for background job to process
            job_done = False
            last_job = {}
            p_start = time.time()
            for _ in range(60):
                time.sleep(0.05)
                jr = self.client.get(f"/job-status?job_id={job_id}").json()
                last_job = jr
                if jr.get("stage") in ["completed", "failed"]:
                    job_done = True
                    break

            proc_dur = time.time() - p_start
            total_dur = time.time() - t0

            print(f"[{label}] Size: {len(payload)/1024/1024:.1f}MB | Upload: {upload_dur:.3f}s | Processing: {proc_dur:.3f}s | Total: {total_dur:.3f}s | Status: 200 | Stage: {last_job.get('stage')} | Chunks: {last_job.get('chunk_count', 0)}")
            self.assertTrue(job_done, f"Job {job_id} did not finish in time: {last_job}")
            self.assertEqual(last_job.get("stage"), "completed", f"Job failed: {last_job.get('error')}")

    def test_multi_file_batch_upload(self):
        """Test uploading a batch of multiple files (Text, PPTX, Video) concurrently."""
        files_to_upload = [
            ("batch_notes.txt", b"Notes on database indexing and B-trees.\n" * 1000),
            ("batch_summary.txt", b"Summary of machine learning evaluation metrics.\n" * 1000),
            ("batch_clip.mp4", b"\x00\x00\x00\x18ftypmp42" + (b"\x00" * (1024 * 1024))),
        ]

        t0 = time.time()
        job_ids = []
        for idx, (fname, content) in enumerate(files_to_upload):
            fid = f"batch_file_{idx}_{int(time.time() * 1000)}"
            res = self.client.post(
                "/upload-chunk",
                data={
                    "file_id": fid,
                    "chunk_index": 0,
                    "total_chunks": 1,
                    "filename": fname,
                    "file_size": len(content),
                },
                files={"chunk": ("chunk_0", io.BytesIO(content))},
            )
            self.assertEqual(res.status_code, 200)
            job_ids.append(res.json().get("job_id"))

        upload_time = time.time() - t0

        # Poll all jobs until completion
        p_start = time.time()
        all_completed = False
        for _ in range(60):
            time.sleep(0.05)
            all_done = True
            for jid in job_ids:
                status = self.client.get(f"/job-status?job_id={jid}").json()
                if status.get("stage") not in ["completed", "failed"]:
                    all_done = False
                    break
            if all_done:
                all_completed = True
                break

        proc_time = time.time() - p_start
        total_time = time.time() - t0
        self.assertTrue(all_completed)
        print(f"\n[Multi-File Batch (3 files)] Upload: {upload_time:.3f}s | Processing: {proc_time:.3f}s | Total: {total_time:.3f}s | Status: 200 | All Completed: {all_completed}")

    def test_larger_file_chunked_upload(self):
        """Test larger 12MB file chunked upload across 6 chunks."""
        payload_12mb = b"\x00\x00\x00\x18ftypmp42" + (b"\x00" * (12 * 1024 * 1024))
        chunk_size = 2 * 1024 * 1024
        total_chunks = (len(payload_12mb) + chunk_size - 1) // chunk_size
        fid = f"large_12mb_{int(time.time() * 1000)}"

        t0 = time.time()
        final_res = None
        for idx in range(total_chunks):
            start = idx * chunk_size
            slice_bytes = payload_12mb[start: start + chunk_size]
            final_res = self.client.post(
                "/upload-chunk",
                data={
                    "file_id": fid,
                    "chunk_index": idx,
                    "total_chunks": total_chunks,
                    "filename": "large_lecture_12mb.mp4",
                    "file_size": len(payload_12mb),
                },
                files={"chunk": (f"chunk_{idx}", io.BytesIO(slice_bytes))},
            )
            self.assertEqual(final_res.status_code, 200)

        upload_dur = time.time() - t0
        job_id = final_res.json().get("job_id")

        p_start = time.time()
        completed = False
        last_status = {}
        for _ in range(60):
            time.sleep(0.05)
            last_status = self.client.get(f"/job-status?job_id={job_id}").json()
            if last_status.get("stage") == "completed":
                completed = True
                break

        proc_dur = time.time() - p_start
        total_dur = time.time() - t0
        print(f"[12MB MP4 Large Test] Chunks: {total_chunks} | Upload: {upload_dur:.3f}s | Processing: {proc_dur:.3f}s | Total: {total_dur:.3f}s | Status: 200 | Stage: {last_status.get('stage')}")
        self.assertTrue(completed)


if __name__ == "__main__":
    unittest.main()
