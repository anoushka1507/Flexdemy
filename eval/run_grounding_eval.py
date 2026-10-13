"""
Track D, Requirement 5: grounding/retrieval evaluation.

Runs every question in test_set.json against the AI layer directly
(no HTTP dependency) and reports faithfulness, answer relevancy,
retrieval hit rate, and refusal accuracy.

See eval/README.md for how to swap in real course material.
"""

import asyncio
import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from dotenv import load_dotenv

load_dotenv(os.path.join(PROJECT_ROOT, "backend", ".env"))

from AI_Layer.ai_core import (
    answer_grounded_question,
    client,
    embed_texts,
    extract_text_and_chunk,
    retrieve_relevant_chunks,
    MODEL_TEXT,
)
from AI_Layer.models import ChatTurn
from google import genai


EVAL_DIR = os.path.dirname(os.path.abspath(__file__))


async def judge_score(prompt: str) -> float:
    """Gemini-as-judge: returns a 1-5 score parsed from the response."""

    response = await client.aio.models.generate_content(
        model=MODEL_TEXT,
        contents=prompt,
        config=genai.types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "score": {"type": "integer", "minimum": 1, "maximum": 5},
                    "reason": {"type": "string"},
                },
                "required": ["score", "reason"],
            },
            temperature=0.0,
        ),
    )

    return json.loads(response.text)


async def main():

    if client is None:
        print("GEMINI_API_KEY is not set — cannot run evaluation.")
        return

    with open(os.path.join(EVAL_DIR, "material.txt"), encoding="utf-8") as f:
        material_text = f.read()

    with open(os.path.join(EVAL_DIR, "test_set.json"), encoding="utf-8") as f:
        test_set = json.load(f)

    chunks = extract_text_and_chunk(material_text, "material.txt")
    embeddings = await embed_texts([c.text for c in chunks])

    results = []

    for case in test_set:

        question = case["question"]
        is_answerable = case["is_answerable"]
        expected_locator = case.get("expected_locator")

        top_matches = await retrieve_relevant_chunks(
            chunks, embeddings, question, k=4
        )

        retrieved_locators = [c.locator for c, _score in top_matches]

        hit = (
            expected_locator in retrieved_locators
            if is_answerable
            else None
        )

        response = await answer_grounded_question(
            chunks, embeddings, [], question
        )

        refusal_correct = response.is_grounded == is_answerable

        faithfulness = None
        relevancy = None

        if response.is_grounded:

            # Judge against the FULL chunk text the model actually saw,
            # not the truncated citation excerpt (which is just for UI
            # display and would unfairly penalize faithfulness here).
            context_text = "\n\n".join(
                chunk.text for chunk, _score in top_matches
            )

            faithfulness = await judge_score(
                "Rate 1-5 how well the ANSWER is supported by the "
                "SOURCE EXCERPTS, with no unsupported claims. "
                f"SOURCE EXCERPTS:\n{context_text}\n\n"
                f"ANSWER:\n{response.answer}"
            )

            relevancy = await judge_score(
                "Rate 1-5 how directly the ANSWER addresses the "
                f"QUESTION.\nQUESTION:\n{question}\n\n"
                f"ANSWER:\n{response.answer}"
            )

        results.append(
            {
                "question": question,
                "is_answerable": is_answerable,
                "is_grounded": response.is_grounded,
                "refusal_correct": refusal_correct,
                "retrieval_hit": hit,
                "faithfulness": faithfulness["score"] if faithfulness else None,
                "relevancy": relevancy["score"] if relevancy else None,
            }
        )

    answerable_cases = [r for r in results if r["is_answerable"]]
    hits = [r["retrieval_hit"] for r in answerable_cases if r["retrieval_hit"] is not None]
    faithfulness_scores = [r["faithfulness"] for r in results if r["faithfulness"] is not None]
    relevancy_scores = [r["relevancy"] for r in results if r["relevancy"] is not None]
    refusal_accuracy = sum(r["refusal_correct"] for r in results) / len(results)

    summary = {
        "n_cases": len(results),
        "refusal_accuracy": round(refusal_accuracy, 3),
        "retrieval_hit_rate": (
            round(sum(hits) / len(hits), 3) if hits else None
        ),
        "avg_faithfulness": (
            round(sum(faithfulness_scores) / len(faithfulness_scores), 2)
            if faithfulness_scores else None
        ),
        "avg_relevancy": (
            round(sum(relevancy_scores) / len(relevancy_scores), 2)
            if relevancy_scores else None
        ),
        "cases": results,
    }

    print(json.dumps(summary, indent=2))

    with open(os.path.join(EVAL_DIR, "grounding_eval_report.json"), "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    asyncio.run(main())
