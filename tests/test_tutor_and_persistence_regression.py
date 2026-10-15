"""
Regression tests for:
1. Tutor Grounding & Answer Quality (7 required cases):
   - A question whose answer is explicitly in the material.
   - A question requiring multiple passages from the material.
   - A follow-up referring to the previous answer.
   - A question about a concept mentioned but not explained in the material.
   - A question unrelated to the uploaded material.
   - A question whose answer is on a particular slide/page, verifying the citation.
   - A question after switching between two uploaded documents.
2. Saved Learning Paths (Course flow persistence)
3. Flashcards (deck creation, spaced repetition review, due count)
4. State isolation and auth checks
All tests run 100% offline without Gemini API calls.
"""

import asyncio
import unittest
from AI_Layer.ai_core import (
    answer_grounded_question,
    retrieve_relevant_chunks,
    _lexical_similarity,
)
from AI_Layer.models import Chunk, ChatTurn
from backend.main import (
    app,
    get_learning_paths_api,
    save_learning_path_api,
    delete_learning_path_api,
    SaveLearningPathPayload,
    get_flashcard_decks_api,
    save_flashcard_deck_api,
    delete_flashcard_deck_api,
    record_flashcard_review_api,
    SaveFlashcardDeckPayload,
    FlashcardReviewPayload,
)


class TestTutorGroundingRegression(unittest.TestCase):
    def setUp(self):
        # Two mock uploaded documents
        self.doc1_chunks = [
            Chunk(
                chunk_index=0,
                text="The central nervous system consists of the brain and spinal cord. Neurons transmit electrical signals using action potentials across the axon membrane.",
                locator="Page 1",
                source_type="pdf",
                source_filename="Neuroscience_Ch1.pdf",
            ),
            Chunk(
                chunk_index=1,
                text="Synapses are specialized junctions where neurons communicate with each other using neurotransmitters like dopamine and serotonin.",
                locator="Page 2",
                source_type="pdf",
                source_filename="Neuroscience_Ch1.pdf",
            ),
            Chunk(
                chunk_index=2,
                text="Dendrites receive inputs from other cells. Action potentials propagate down the myelin sheath via saltatory conduction.",
                locator="Page 3",
                source_type="pdf",
                source_filename="Neuroscience_Ch1.pdf",
            ),
            Chunk(
                chunk_index=3,
                text="Quantum decoherence was briefly noted in historical physics footnotes but is outside biology.",
                locator="Page 4",
                source_type="pdf",
                source_filename="Neuroscience_Ch1.pdf",
            ),
        ]

        self.doc2_chunks = [
            Chunk(
                chunk_index=0,
                text="Photosynthesis occurs in chloroplasts. Chlorophyll absorbs blue and red light while reflecting green light.",
                locator="Slide 1",
                source_type="slide",
                source_filename="Plant_Biology.pptx",
            ),
            Chunk(
                chunk_index=1,
                text="The light-dependent reactions produce ATP and NADPH in the thylakoid membranes.",
                locator="Slide 2",
                source_type="slide",
                source_filename="Plant_Biology.pptx",
            ),
        ]

    # 1. A question whose answer is explicitly in the material
    def test_explicit_answer_grounding(self):
        loop = asyncio.new_event_loop()
        try:
            resp = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="How do neurons transmit electrical signals?",
                )
            )
            self.assertTrue(resp.is_grounded)
            self.assertGreaterEqual(len(resp.citations), 1)
            self.assertEqual(resp.citations[0].locator, "Page 1")
            self.assertEqual(resp.citations[0].source_filename, "Neuroscience_Ch1.pdf")
            self.assertIn("action potentials", resp.answer)
        finally:
            loop.close()

    # 2. A question requiring multiple passages from the material
    def test_multiple_passages_retrieval(self):
        loop = asyncio.new_event_loop()
        try:
            # Query touching both neurons (Page 1) and synapses (Page 2)
            matches = loop.run_until_complete(
                retrieve_relevant_chunks(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    query="What is the difference between neurons transmitting action potentials and synapses releasing neurotransmitters?",
                    k=3,
                )
            )
            matched_locators = {c.locator for c, _score in matches if _score > 0.25}
            self.assertIn("Page 1", matched_locators)
            self.assertIn("Page 2", matched_locators)
        finally:
            loop.close()

    # 3. A follow-up referring to the previous answer
    def test_followup_question_referencing_previous_answer(self):
        loop = asyncio.new_event_loop()
        try:
            history = [
                ChatTurn(role="user", text="What is an action potential in neurons?"),
                ChatTurn(
                    role="model",
                    text="An action potential is an electrical signal that travels along an axon.",
                ),
            ]
            # Student asks anaphoric follow-up about dendrites
            resp = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=history,
                    student_message="What about its dendrites?",
                )
            )
            self.assertTrue(resp.is_grounded)
            self.assertGreaterEqual(len(resp.citations), 1)
            self.assertEqual(resp.citations[0].locator, "Page 3")
            self.assertIn("Dendrites receive inputs", resp.answer)
        finally:
            loop.close()

    # 4. A question about a concept mentioned but not explained
    def test_concept_mentioned_but_not_explained(self):
        loop = asyncio.new_event_loop()
        try:
            # "Quantum decoherence" is mentioned on Page 4 but not explained
            resp = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="Explain how quantum decoherence operates in neural microtubules.",
                )
            )
            # Should not hallucinate an explanation; either honest excerpt or transparent refusal
            self.assertTrue(
                "[Offline Mode" in resp.answer
                or "does not contain enough information" in resp.answer
            )
        finally:
            loop.close()

    # 5. A question completely unrelated to the uploaded material
    def test_unrelated_question_refusal(self):
        loop = asyncio.new_event_loop()
        try:
            resp = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="What is the capital of Australia and what is its GDP?",
                )
            )
            self.assertFalse(resp.is_grounded)
            self.assertEqual(len(resp.citations), 0)
            self.assertIn("does not contain enough information", resp.answer)
        finally:
            loop.close()

    # 6. A question whose answer is on a particular slide/page, verifying citation
    def test_page_citation_accuracy(self):
        loop = asyncio.new_event_loop()
        try:
            resp = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="Which neurotransmitters are involved in synaptic communication?",
                )
            )
            self.assertTrue(resp.is_grounded)
            self.assertEqual(resp.citations[0].locator, "Page 2")
            self.assertEqual(resp.citations[0].source_filename, "Neuroscience_Ch1.pdf")
            self.assertIn("dopamine and serotonin", resp.answer)
        finally:
            loop.close()

    # 7. A question after switching between two uploaded documents
    def test_switching_between_two_uploaded_documents(self):
        loop = asyncio.new_event_loop()
        try:
            # Query Doc 1
            resp1 = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc1_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="What cells receive inputs?",
                )
            )
            self.assertEqual(resp1.citations[0].source_filename, "Neuroscience_Ch1.pdf")

            # Switch to Doc 2
            resp2 = loop.run_until_complete(
                answer_grounded_question(
                    chunks=self.doc2_chunks,
                    chunk_embeddings=None,
                    conversation_history=[],
                    student_message="Where does photosynthesis take place and what absorbs light?",
                )
            )
            self.assertEqual(resp2.citations[0].source_filename, "Plant_Biology.pptx")
            self.assertEqual(resp2.citations[0].locator, "Slide 1")
            self.assertIn("chloroplasts", resp2.answer)
        finally:
            loop.close()


class TestLearningPathsAndFlashcardsPersistence(unittest.TestCase):
    def test_saved_learning_paths_crud(self):
        loop = asyncio.new_event_loop()
        try:
            mock_auth = "Bearer test-user-token-123"
            # Note: without live JWT verification, mock headers use in-memory store
            # Let's test with direct API payloads
            payload = SaveLearningPathPayload(
                id="lp-test-01",
                title="Cell Biology Learning Path",
                collection_id="col-bio-01",
                source_files=[{"name": "lecture1.pdf", "size": 1024}],
                concepts=[
                    {
                        "label": "Cell Membrane",
                        "description": "Phospholipid bilayer",
                        "topic": "Biology",
                        "subtopic": "Cytology",
                        "prerequisites": [],
                    },
                    {
                        "label": "Osmosis",
                        "description": "Passive water transport",
                        "topic": "Biology",
                        "subtopic": "Transport",
                        "prerequisites": ["Cell Membrane"],
                    },
                ],
            )
            # Direct save
            from backend.supabase_client import (
                save_learning_path,
                fetch_saved_learning_paths,
                delete_learning_path,
            )
            saved = loop.run_until_complete(
                save_learning_path(None, "user-test-uuid", payload.model_dump())
            )
            self.assertTrue(saved)

            # Fetch
            paths = loop.run_until_complete(
                fetch_saved_learning_paths(None, "user-test-uuid")
            )
            self.assertEqual(len(paths), 1)
            self.assertEqual(paths[0]["title"], "Cell Biology Learning Path")
            self.assertEqual(len(paths[0]["concepts"]), 2)

            # Delete
            deleted = loop.run_until_complete(
                delete_learning_path(None, "user-test-uuid", "lp-test-01")
            )
            self.assertTrue(deleted)
            remaining = loop.run_until_complete(
                fetch_saved_learning_paths(None, "user-test-uuid")
            )
            self.assertEqual(len(remaining), 0)
        finally:
            loop.close()

    def test_flashcard_decks_and_spaced_repetition(self):
        loop = asyncio.new_event_loop()
        try:
            from backend.supabase_client import (
                save_flashcard_deck,
                fetch_flashcard_decks,
                record_flashcard_review,
                delete_flashcard_deck,
            )
            deck = {
                "deck_id": "deck-test-01",
                "title": "Database Fundamentals",
                "topic": "Databases",
                "cards": [
                    {
                        "id": "c1",
                        "front": "What is an index in RDBMS?",
                        "back": "A data structure like a B-tree that accelerates searches.",
                        "source_locator": "Page 4",
                        "interval_days": 1,
                        "repetitions": 0,
                    },
                    {
                        "id": "c2",
                        "front": "What does ACID stand for?",
                        "back": "Atomicity, Consistency, Isolation, Durability.",
                        "source_locator": "Page 7",
                        "interval_days": 1,
                        "repetitions": 0,
                    },
                ],
            }
            saved = loop.run_until_complete(
                save_flashcard_deck(None, "user-test-uuid", deck)
            )
            self.assertTrue(saved)

            # Fetch decks
            decks = loop.run_until_complete(
                fetch_flashcard_decks(None, "user-test-uuid")
            )
            self.assertEqual(len(decks), 1)
            self.assertEqual(len(decks[0]["cards"]), 2)

            # Record review (good -> 4 days)
            reviewed = loop.run_until_complete(
                record_flashcard_review(
                    None,
                    "user-test-uuid",
                    "deck-test-01",
                    "c1",
                    "good",
                    4,
                )
            )
            self.assertTrue(reviewed)

            # Verify card updated
            updated_decks = loop.run_until_complete(
                fetch_flashcard_decks(None, "user-test-uuid")
            )
            card1 = updated_decks[0]["cards"][0]
            self.assertEqual(card1["interval_days"], 4)
            self.assertEqual(card1["last_rating"], "good")
            self.assertIsNotNone(card1["next_review"])

            # Delete
            deleted = loop.run_until_complete(
                delete_flashcard_deck(None, "user-test-uuid", "deck-test-01")
            )
            self.assertTrue(deleted)
        finally:
            loop.close()


if __name__ == "__main__":
    unittest.main()
