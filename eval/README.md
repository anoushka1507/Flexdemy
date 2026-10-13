# Evaluation harness (Track D, Requirement 5)

RAGAS pulls in a broken `langchain_community` dependency chain as of this
writing (`ChatVertexAI` import fails). Rather than burn hours fixing someone
else's dependency conflict, this is a small self-built harness that computes
the same conceptually-grounded metrics via Gemini-as-judge, which the brief
explicitly allows ("RAGAS, DeepEval, TruLens, **or similar**").

## Files

- `material.txt` — placeholder study material. **Swap this for your real
  course material** (MIT OCW transcript, NPTEL slides, textbook excerpt...).
- `test_set.json` — hand-written questions against `material.txt`, each
  tagged with whether it's answerable from the material and (if so) which
  source locator should ground the answer. **Rewrite this to match whatever
  material you swap in** — the questions here are specific to the
  photosynthesis placeholder.
- `run_grounding_eval.py` — runs every question in `test_set.json` through
  the grounded-chat pipeline and reports:
  - **Retrieval hit rate** — for answerable questions, did the expected
    source locator show up in the top-k retrieved chunks (context recall
    proxy)
  - **Refusal accuracy** — correct is_grounded=True/False classification
  - **Faithfulness** — Gemini-judge score (1-5) on whether the answer's
    claims are supported by the cited excerpts
  - **Answer relevancy** — Gemini-judge score (1-5) on whether the answer
    addresses the question asked
- `simulate_students.py` — runs several simulated student profiles (biased
  toward being weak/strong on certain concepts) through the live adaptive
  quiz API repeatedly, logging accuracy trend, difficulty adaptation, and
  question-repetition rate as a personalization-effectiveness proxy.

## Running

```bash
# backend must be running on :8000 (uvicorn backend.main:app)
cd backend && venv\Scripts\activate  # or source venv/bin/activate
pip install -r ../requirements.txt
python ../eval/run_grounding_eval.py
python ../eval/simulate_students.py
```

Both scripts print a metrics table and write a JSON report next to
themselves for inclusion in the project documentation deliverable.
