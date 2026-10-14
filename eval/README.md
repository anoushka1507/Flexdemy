# Evaluation Harness (Track D, Requirement 5)

This directory contains automated, reproducible evaluation harnesses and benchmarks for **Track D: Personalized Tutoring & Adaptive Learning**.

## Test Datasets

- `material.txt`: Representative Software Engineering curriculum chapter (*Software Engineering - Chapter 1: Introduction* by Ashish Pandey), covering the Software Crisis, empirical Standish Group CHAOS metrics, infamous failures (Ariane 5 64-to-16 bit float overflow, Patriot missile timing drift, Space Shuttle fuel dump restart crashes), and Brooks' "No Silver Bullet".
- `test_set.json`: 13 verified benchmark queries, including:
  - Multi-passage factual queries across sections.
  - Known ground-truth source locators (`Section 1`, `Section 2`).
  - Deliberately unanswerable/out-of-scope negative queries (*"Who wrote Romeo and Juliet?"*, *"Boiling point of water at sea level"*, *"Backpropagation neural networks"*).

## Evaluation Scripts

### 1. Grounding & Retrieval Evaluation (`run_grounding_eval.py`)
Computes:
- **Retrieval Hit Rate**: Evaluates whether the ground-truth section/locator appears in top-$k$ retrieved chunks across the 9 answerable cases (9/9 = 100.0%). The 4 unanswerable cases are out-of-scope negative controls testing refusal.
- **Context Recall (Proxy)**: Context recall is reported as a retrieval-hit-rate proxy across the benchmark's answerable items.
- **Context Precision**: Fraction of retrieved passages judged genuinely relevant.
- **Citation Correctness**: Verifies emitted citation locators against actual material chunks.
- **Refusal Precision & Recall**: Tests whether out-of-scope questions are refused cleanly without hallucination.
- **Faithfulness & Answer Relevancy**: LLM-as-judge scoring (1–5) on supported claims.

*Integrity note:* When running offline without `GEMINI_API_KEY`, model-dependent metrics (`faithfulness`, `relevancy`, `context_precision`, `refusal_accuracy`) are reported as `null` rather than generating fabricated scores. Retrieval Hit Rate is computed directly from local lexical retrieval on the 9 answerable cases (9/9 = 100.0%).

### 2. Multi-Session Simulated Learner Evaluation (`simulate_students.py`)
Simulates synthetic student agents across multiple learning sessions:
- Profiles: `strong_learner` ($p=0.85$), `average_learner` ($p=0.60$), and `struggling_learner` ($p=0.35$).
- Tracks Corbett & Anderson **Bayesian Knowledge Tracing (BKT)** posterior probabilities $P(L_t)$.
- Verifies dynamic difficulty streak adaptation (+1 on 2 consecutive correct, -1 on 2 consecutive incorrect).
- Evaluates cross-session deduplication against a realistic item pool.
- *Methodology:* Fixed-seed synthetic agent simulation (not a human-subject clinical trial).

## Execution Commands

```bash
# Run Grounding Evaluation
python eval/run_grounding_eval.py

# Run Simulated Learner Benchmark
python eval/simulate_students.py
```
Output reports are written to `eval/grounding_eval_report.json` and `eval/simulated_students_report.json`.
