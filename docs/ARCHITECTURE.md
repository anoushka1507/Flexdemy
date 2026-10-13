# FlexQuizz — Architecture, Grounding, and Learner Model

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

### 4.2 Concept selection (pre-existing, unchanged)

Within a session, the next concept to ask about is chosen by weighted
random selection (`choose_weighted_concept`): concepts with no answered
questions yet, or with session accuracy below 50%, get weight 3 ("weak");
50-80% accuracy gets weight 2; above 80% gets weight 1. This keeps the quiz
focused on what the student is actually struggling with.

### 4.3 Persisted mastery (new, Track D)

This is deliberately a **simplified exponential-moving-average estimate**,
not a full Bayesian Knowledge Tracing or IRT model — a defensible scope
decision given the time available, not a claim of psychometric rigor.

After every answered question, `record_answer_and_advance` calls
`upsert_mastery` (`backend/supabase_client.py`), which updates:

```
new_score = current_score + learning_rate * (target - current_score)
```

where `target` is 1.0 for a correct answer, 0.0 for incorrect, and
`learning_rate = 0.3`. This is the standard EMA update rule — it responds
quickly to recent performance while still being resistant to a single lucky
or unlucky answer. Scores start at 0.3 for an unseen topic (a mild
pessimistic prior, consistent with the in-session "weak" bucket), and are
visible per-topic on the Analytics dashboard (`MasteryPanel.tsx`), sorted
weakest-first.

### 4.4 Cold start

A student with no mastery history has every topic default to the 0.3 prior
and every in-session concept starts in the "weak" selection bucket (section
4.2), so the first quiz for a new student functions as an implicit
diagnostic — no separate intake flow was built, since the adaptive
selection logic already produces that behavior as a side effect.

## 5. Evaluation Methodology

RAGAS was evaluated first but has a currently-broken dependency chain
(`ragas.llms.base` imports `langchain_community.chat_models.vertexai`,
which no longer exists in current `langchain_community` releases).
Rather than spend hackathon time pinning a working combination of
third-party package versions, `eval/run_grounding_eval.py` implements the
same evaluation *concepts* directly against Gemini as a judge model — this
is explicitly permitted by the brief ("RAGAS, DeepEval, TruLens, or
similar").

Metrics computed, per question in `eval/test_set.json`:

- **Refusal accuracy**: does `is_grounded` match whether the question is
  actually answerable from the material (both true positives and true
  negatives count).
- **Retrieval hit rate** (context recall proxy): for answerable questions,
  did the expected source locator appear among the top-4 retrieved chunks.
- **Faithfulness**: Gemini-judge score (1-5) on whether the answer's claims
  are supported by the *full* text of the retrieved chunks the generation
  model actually saw (not the truncated citation excerpt — an earlier
  version of this script judged against the truncated excerpt and produced
  misleadingly low scores; this was caught and fixed during testing).
- **Answer relevancy**: Gemini-judge score (1-5) on whether the answer
  addresses the question asked.

`eval/simulate_students.py` drives the live adaptive-quiz HTTP API with
several synthetic student profiles (different target correct-answer
probabilities), and reports first-half vs. second-half accuracy, the
difficulty trajectory, and the question-repetition rate per profile — a
proxy for "does the adaptive engine actually behave differently for
different students," since full longitudinal mastery-gain measurement
requires the Supabase-persisted mastery table to be live.

**As of this writing, `eval/material.txt` and `eval/test_set.json` are
placeholder content** (a short photosynthesis sample) used to validate the
harness itself. They must be replaced with the team's actual demo course
material before the reported numbers mean anything for the submission.

## 6. Explicitly Out of Scope

Per the team's own time-boxing decision, the following brief items were not
attempted: visual course flow map, auto-generated revision material
(flashcards/slides/audio briefs), study schedule generation, multilingual
support, and audio-based tutoring. These are listed in the brief as
"Optional Enhancements," not core requirements.
