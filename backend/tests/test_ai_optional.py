from __future__ import annotations

import os
import pytest
from dotenv import load_dotenv

load_dotenv()

HAS_KEY = bool(os.getenv("OPENAI_API_KEY"))
TEST_AI = os.getenv("TEST_OPENAI") == "1"

pytestmark = pytest.mark.skipif(not (HAS_KEY and TEST_AI), reason="OpenAI key not present or TEST_OPENAI!=1")

from app.ai import generate_syllabus, generate_quiz_from_titles, generate_assignments_from_titles  # noqa: E402


def test_ai_generate_syllabus() -> None:
    text = "Intro to Sets\nOperations\nFunctions"
    items = generate_syllabus(text, max_items=5, use_ai=True)
    assert isinstance(items, list) and len(items) >= 1
    title, summary = items[0]
    assert isinstance(title, str) and title
    assert isinstance(summary, str)


def test_ai_generate_quiz() -> None:
    titles = ["Sets and Subsets", "Functions", "Relations"]
    qs = generate_quiz_from_titles(titles, num_questions=3, use_ai=True)
    assert isinstance(qs, list) and len(qs) >= 1
    q0 = qs[0]
    assert "prompt" in q0 and "options" in q0 and "answer_index" in q0
    assert len(q0["options"]) == 4


def test_ai_generate_assignments() -> None:
    titles = ["Sets and Subsets", "Functions", "Relations"]
    qs = generate_assignments_from_titles(titles, max_q=2, use_ai=True)
    assert isinstance(qs, list) and len(qs) >= 1
    q0 = qs[0]
    assert "prompt" in q0 and "expected_keyword" in q0
