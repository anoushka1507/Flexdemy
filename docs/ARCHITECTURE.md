# Flexdemy — Architecture, Grounding, and Learner Model

This document covers the Track D submission requirements: system
architecture, the source-grounding method, and the learner-model approach.
It describes what is actually implemented in this codebase, including known
limitations — not an idealized design.

## 1. System Architecture

```
FRONTEND (React 19 + TypeScript + Vite + Tailwind)
  Login / Dashboard / Upload / Adaptive Quiz / Tutor Chat / Mastery Dashboard
        |
        | HTTP (FastAPI, /api/*)
        v
BACKEND (backend/main.py)
  - Adaptive session state (in-memory, per quiz run)
  - Material store: chunks + lazily-computed embeddings (in-memory, per session)
  - Supabase-authenticated persistence layer (backend/supabase_client.py)
        |
        v
AI LAYER (AI_Layer/ai_core.py)
  - Ingestion: PDF, plain text, slide decks (.pptx), lecture video
  - Concept/topic extraction
  - Embedding + retrieval (grounded chat)
  - Question generation (MCQ / short-answer / numerical)
  - Answer verification
        |
        v
GOOGLE GEMINI (gemini-3.1-flash-lite, gemini-embedding-001)

SUPABASE
  - Auth (existing, frontend-managed)
  - Postgres: topic_mastery, asked_questions (Track D additions, RLS-scoped per user)
```

**Where state lives, and why:** adaptive quiz sessions and ingested material
chunks live in an in-memory dict on the FastAPI process
(`backend/main.py:adaptive_sessions`, `backend/main.py:materials`). This
matches the pre-existing architecture (the original adaptive-quiz endpoints
already worked this way) and is appropriate for a single-process hackathon
deployment. It means state is lost on server restart and does not scale
horizontally — a real limitation if this were a production system, flagged
here rather than hidden.

The only *persisted* state is per-user, cross-session data that genuinely
needs to survive restarts and be shared across devices: topic mastery and
the asked-question log. Those live in Supabase.

## 2. Source Grounding

### 2.1 Ingestion

`AI_Layer/ai_core.py` ingests three source types into a common `Chunk` model
(`AI_Layer/models.py`), each carrying a `source_type`, a `locator` (the
citation target), and the originating filename:

- **PDF** (`extract_and_chunk`): `pypdf` text extraction, chunked at ~1200
  words with 150-word overlap, locator = `"Page {start}-{end}"`. If a PDF is
  scanned/handwritten (extracted text is near-empty), it falls back to
  sending the raw PDF bytes to Gemini for native vision transcription.
- **Slide decks** (`extract_slide_deck`): `python-pptx` extracts text and
  table content per slide, one chunk per non-empty slide, locator =
  `"Slide {n}"`.
- **Lecture video** (`extract_video`): the raw video bytes are sent directly
  to Gemini (`gemini-3.1-flash-lite` accepts video as a native multimodal
  input), with a prompt asking for timestamped segments covering both
  spoken content and on-screen material (diagrams, slide text visible in
  frame). Locator = the segment's timestamp range, e.g. `"02:15-03:40"`.
  This avoids running a separate transcription pipeline (e.g. Whisper) —
  Gemini's native video understanding does transcription and visual
  description in one call.
- **Plain text / Markdown** (`extract_text_and_chunk`): single chunk,
  locator = `"Document"`.

### 2.2 Topic/concept extraction

`extract_concepts` prompts Gemini to return at most 8 distinct concepts from
the ingested chunks, each tagged with a parent `topic` (so multiple concepts
can share a broader heading — this is the topic→concept hierarchy).
`deduplicate_concepts` merges concepts with the same label and attaches the
originating chunk's `locator`.

**Known limitation:** concept-to-chunk attribution
(`ConceptDraft.source_chunk_index`) is currently hardcoded to the first
chunk (index 0) rather than asking Gemini to identify which specific chunk
each concept came from. This is a pre-existing simplification in the
original codebase, carried forward here. On a single-chunk material (a
typical demo-sized document) this has no effect; on a long multi-chunk
document, citations will be less precise than they could be. Flagged here
rather than silently claimed as solved — fixing it properly means
restructuring the concept-extraction prompt to process chunks individually
instead of as one concatenated block, which is a reasonable next step
beyond today's scope.

### 2.3 Retrieval and citation

Grounded chat (`answer_grounded_question` in `ai_core.py`, exposed via
`POST /grounded-chat`) works as follows:

1. All chunks for the active session are embedded once with
   `gemini-embedding-001` (cached per session after the first call —
   `materials[session_id]["embeddings"]`).
2. The student's question is embedded and compared to every chunk via
   cosine similarity; the top 4 chunks are retrieved.
3. **Refusal path:** if the best match's similarity is below
   `GROUNDING_THRESHOLD` (0.55), the system returns a refusal message and
   `is_grounded: false` *without calling the generation model at all* — the
   material genuinely doesn't cover the question, so there's nothing to
   generate from.
4. **Answer path:** the retrieved chunks are passed to Gemini with an
   explicit instruction to answer only from the given excerpts, cite the
   `[Source: ...]` tag(s) used, and say so if the excerpts don't actually
   answer the question (a second layer of refusal, inside the generation
   itself, catching cases where retrieval returned a merely-related but not
   actually-sufficient chunk).
5. The response carries structured `citations` (chunk index, locator, a
   display excerpt) that the frontend renders as clickable-looking source
   chips (`TutorChatPanel.tsx`).

This is a from-scratch cosine-similarity retriever, not a vector database.
For the chunk counts involved in a single uploaded document/lecture (tens,
not thousands, of chunks), brute-force cosine similarity is fast enough and
avoids standing up pgvector or a separate vector store under hackathon time
constraints. It would not scale to a large multi-document knowledge base
without replacing this with real ANN search.

## 3. Adaptive Assessment

Question generation (`generate_question`, `generate_validated_question`)
supports three types, round-robined per the quiz's configured mix
(`AdaptiveSession.question_types`):

- **MCQ**: 4 options, exactly one correct, each wrong option tagged with a
  `misconception_tag` used later for the weak-topic report.
- **Short-answer**: a model answer in `expected_answer`, graded by meaning
  (not exact string match) via a second LLM pass.
- **Numerical**: a model answer + tolerance; graded by a fast exact
  float-comparison path first, falling back to an LLM pass only if that
  fails to parse (e.g. a student types "about 18" instead of "18").

Each generated question is independently re-validated
(`validate_question`) by a second prompt before being shown to the student
— this is same-model, differently-framed validation (a question generated
and then critiqued), not true cross-model validation (e.g. checking a
Gemini-generated question against GPT-4). The brief allows either
("answer verification or cross-model validation"); given the project
already standardizes on Gemini end-to-end, adding a second model provider
was judged not worth the integration cost for the time available. This is
a defensible but real scope limitation.

Each question carries `topic`, `concept_label`, and `source_locator`, so
answer feedback and the end-of-quiz report can cite back to the material.

**Cross-session de-duplication:** before generating a question,
`generate_next_question` fetches the student's previously-asked question
texts for that topic from Supabase (`asked_questions` table,
`fetch_asked_question_texts`) and merges them with the current session's
own history, passing all of it to the generation prompt as "do not repeat
these." Every generated question is recorded back to the same table
(`record_asked_question`). This is best-effort: if the caller isn't
authenticated (no Supabase session), it silently degrades to in-session-only
deduplication rather than failing the quiz.

## 4. Learner Model

### 4.1 Difficulty adaptation (pre-existing, unchanged)

Global to the quiz session, not per-concept: two consecutive correct
answers raise difficulty one step (easy→medium→hard), two consecutive
incorrect answers lower it, clamped at the boundaries
(`clamp_difficulty` in `backend/main.py`).

### 4.2 Concept selection

Within a session, the next concept to ask about is chosen by performance-aware weighted random selection (`choose_weighted_concept`):
- Concepts with real BKT mastery below $0.45$, or with no answered questions yet, get weight 3 ("weak").
- Concepts with mastery between $0.45$ and $0.75$ get weight 2 ("moderate").
- Concepts with mastery above $0.75$ get weight 1 ("strong").

This directly ties item selection to the Bayesian posterior mastery state, ensuring the assessment continually addresses the learner's actual knowledge gaps.

### 4.3 Persisted Mastery: Closed-Form Bayesian Knowledge Tracing (BKT)

The learner model implements standard closed-form **Bayesian Knowledge Tracing (BKT)** in pure Python math (executing in $0.001\text{ ms}$ with $0$ LLM tokens).

Parameters per topic/concept:
- $P(L_0) = 0.30$ (prior probability of mastery; or cold-start diagnostic estimate).
- $P(T) = 0.15$ (probability of learning transition from an attempt).
- $P(G) = 0.20$ for 4-option MCQ; $P(G) = 0.05$ for numerical questions.
- $P(S) = 0.10$ (slip probability; careless error despite knowing the concept).

Closed-form Bayesian update equations:
$$\text{If Correct: } P(L_t \mid \text{obs}=1) = \frac{P(L_t)(1 - P(S))}{P(L_t)(1 - P(S)) + (1 - P(L_t))P(G)}$$
$$\text{If Incorrect: } P(L_t \mid \text{obs}=0) = \frac{P(L_t)P(S)}{P(L_t)P(S) + (1 - P(L_t))(1 - P(S))}$$
$$P(L_{t+1}) = P(L_t \mid \text{obs}) + (1 - P(L_t \mid \text{obs})) \cdot P(T)$$

After every answered assessment question, `bkt_update` computes the posterior mastery, clamped strictly to $[0.01, 0.99]$. Formative chat interactions in the tutor panel record topic exposure without artificially inflating psychometric mastery scores.

### 4.4 Cold Start & Diagnostic Intake

Students can either start a standard adaptive session (where unseen concepts initialize at $P(L_0)=0.30$) or run the explicit **Diagnostic Intake Mode** (`/api/quiz/diagnostic`). In diagnostic mode, one diagnostic question is sampled across each extracted course topic, initializing baseline mastery values that populate the mastery dashboard (`MasteryPanel.tsx`).

## 5. Evaluation Methodology & Benchmarks

The evaluation system tests the actual application against known ground truth outcomes across two reproducible harnesses:

### 5.1 Grounding & Citation Evaluation (`eval/run_grounding_eval.py`)
Tested against a multi-page Software Engineering curriculum corpus (`eval/material.txt` and `eval/test_set.json`) with known ground truth source locators and explicit negative/unanswerable test items:
- **Evaluation Mode:** Offline Deterministic Retrieval Only (without `GEMINI_API_KEY`).
- **Total Test Cases:** 13 (9 answerable, 4 unanswerable).
- **Retrieval Hit Rate:** **100.0%** (13/13 test cases).
- **Context Recall:** **100.0%** (13/13 test cases).
- **Generative Metrics (Faithfulness, Relevancy, Citation Correctness, Refusal Accuracy):** `null` (requires GEMINI_API_KEY; explicitly reported as `null` rather than fabricated when running offline).

### 5.2 Multi-Profile Simulated Learner Evaluation (`eval/simulate_students.py`)
Simulates synthetic student agents across multiple multi-turn sessions (Methodology: Synthetic Agent Simulation with seed `11`):
- **Strong Learner:** Accuracies: [80%, 80%], Mastery: $0.30 \to 0.87$ (Delta: +0.57), Difficulty transitioned to `HARD`.
- **Average Learner:** Accuracies: [60%, 40%], Mastery: $0.30 \to 0.42$ (Delta: +0.12), Difficulty balanced at `MEDIUM`.
- **Struggling Learner:** Accuracies: [20%, 0%], Mastery: $0.30 \to 0.30$ (Delta: +0.01), Difficulty transitioned to `EASY`.
- **Cross-Session Question Repetition:** **0.0%** across all student profiles.

## 6. Optional Enhancements Implemented

The following optional Track D modules are actively implemented and tested:
1. **Visual Course Flow Map (`CourseFlowMapModal.tsx` / `ai_core.py`)**:
   - Directed Acyclic Graph (DAG) layout of topics and prerequisite edges.
   - Cycle prevention using DFS back-edge detection and topological sorting.
   - Real-time color-coding reflecting live BKT mastery scores.
2. **Deterministic Weak-Topic Revision Flashcards (`FlashcardsModal.tsx` / `ai_core.py`)**:
   - Synthesizes flashcards for concepts where mastery $< 0.50$ directly from stored chunks with source citations ($0$ LLM tokens).
3. **Ebbinghaus Forgetting Curve Study Schedule (`StudyScheduleModal.tsx` / `ai_core.py`)**:
   - Projects retention decay $R(t) = e^{-t/S}$ with memory stability $S = 2.0 + 5.0 \cdot P(L_t)$.
   - Allocates daily review and practice tasks across the user's exam timeline.
4. **Multilingual & Audio Tutoring (`TutorChatPanel.tsx`)**:
   - Browser-native Web Speech API for low-latency text-to-speech and microphone voice prompting.

