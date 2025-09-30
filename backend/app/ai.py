from __future__ import annotations

import json
import os
import logging
from typing import List, Tuple, Dict, Any, Optional
import re

logger = logging.getLogger("summit.ai")


def _has_key() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def should_use_ai() -> bool:
    """Decide whether to use AI, with reasons logged for observability."""
    use_env = os.getenv("USE_OPENAI")
    in_pytest = bool(os.getenv("PYTEST_CURRENT_TEST"))
    has_key = _has_key()
    logger.info(
        "AI decision context: USE_OPENAI=%r, in_pytest=%s, OPENAI_API_KEY_present=%s",
        use_env,
        in_pytest,
        has_key,
    )
    # Explicit opt-out
    if use_env == "0":
        logger.info("AI disabled via USE_OPENAI=0")
        return False
    # Explicit opt-in (requires key)
    if use_env == "1":
        result = has_key
        logger.info("AI %s via USE_OPENAI=1 (key present=%s)", "enabled" if result else "disabled", has_key)
        return result
    # Avoid AI during pytest unless explicitly enabled
    if in_pytest:
        logger.info("AI disabled during pytest (PYTEST_CURRENT_TEST set)")
        return False
    # Default: enable if key present (runtime)
    if has_key:
        logger.info("AI enabled: OPENAI_API_KEY present and no explicit override")
    else:
        logger.info("AI disabled: OPENAI_API_KEY missing and no explicit override")
    return has_key


def _try_parse_json(text: str) -> Any | None:
    """Best-effort JSON extraction from model output.

    Handles common cases:
    - Raw JSON
    - JSON wrapped in Markdown code fences (```json ... ```)
    - JSON preceded/followed by prose; extracts first array/object via regex
    """
    # 1) Direct parse
    try:
        return json.loads(text)
    except Exception:
        pass
    # 2) Strip Markdown code fences
    if "```" in text:
        try:
            first = text.find("```")
            second = text.find("```", first + 3)
            if first != -1 and second != -1:
                inner = text[first + 3 : second]
                # remove optional language tag at start (e.g., 'json\n')
                inner = re.sub(r"^\s*json\s*\n", "", inner, flags=re.IGNORECASE)
                return json.loads(inner.strip())
        except Exception:
            pass
    # 3) Regex extract first array/object block
    try:
        m = re.search(r"\[[\s\S]*\]", text)
        if m:
            return json.loads(m.group(0))
    except Exception:
        pass
    try:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
    except Exception:
        pass
    logger.debug("_try_parse_json: failed to parse JSON from text (first 500 chars)=%r", text[:500])
    return None


def generate_syllabus(text: str, max_items: int = 8, use_ai: bool = False, topics: Optional[str] = None) -> List[Tuple[str, str]]:
    if not use_ai or not _has_key():
        logger.info("generate_syllabus: using fallback (use_ai=%s, has_key=%s)", use_ai, _has_key())
        # naive fallback: pick non-empty lines
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return [("Introduction", "Overview of provided material.")]
        items: list[tuple[str, str]] = []
        step = max(1, len(lines) // max_items)
        for idx, i in enumerate(range(0, len(lines), step)):
            if idx >= max_items:
                break
            title = lines[i][:80]
            summary = " ".join(lines[i + 1 : i + 1 + 3])[:200] or "Summary for this section."
            items.append((title or f"Module {idx+1}", summary))
        return items

    # AI path
    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        logger.info("generate_syllabus: using AI model=%s, max_items=%d, topics_provided=%s", model, max_items, bool(topics))
        prompt = (
            "Create a concise syllabus from the provided course text. "
            "Return JSON array of objects: {title: string, summary: string}. "
            f"Limit to {max_items} items. Keep summaries under 200 chars. "
            "Do not include leading numbering tokens in titles (e.g., '1.', '1)', 'I.', 'A.', 'Chapter 1')."
        )
        if topics:
            prompt += f" Focus on these topics/goals where relevant: {topics}."
        combined = f"{prompt}\n\nTEXT:\n{text[:12000]}"
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("generate_syllabus: PROMPT (first 2k chars)=%s", combined[:2000])
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Return only a JSON array. Do not include code fences or extra text."},
                {"role": "user", "content": combined},
            ],
            temperature=0.2,
        )
        content = resp.choices[0].message.content or "[]"
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("generate_syllabus: RAW RESPONSE (first 2k chars)=%s", (content or "")[:2000])
        data = _try_parse_json(content) or []
        items: list[tuple[str, str]] = []
        for obj in data:
            title = str(obj.get("title", "Module")).strip()[:120]
            summary = str(obj.get("summary", "")).strip()[:300]
            if title:
                items.append((title, summary))
        if items:
            logger.info("generate_syllabus: AI returned %d items", len(items))
            return items[:max_items]
    except Exception:
        logger.warning("generate_syllabus: AI path failed; falling back", exc_info=True)
    return generate_syllabus(text, max_items=max_items, use_ai=False)


def generate_quiz_from_content(
    section_title: str,
    section_content: str,
    num_questions: int = 10,
    use_ai: bool = False
) -> List[Dict[str, Any]]:
    """Generate quiz questions from full section content rather than just titles."""
    import random

    if not use_ai or not _has_key():
        logger.info("generate_quiz_from_content: using fallback (use_ai=%s, has_key=%s)", use_ai, _has_key())
        # Simple fallback - create basic comprehension questions
        items: list[Dict[str, Any]] = []
        for i in range(min(num_questions, 3)):
            options = [
                f"Answer option {j+1} for {section_title}" for j in range(4)
            ]
            random.shuffle(options)
            items.append({
                "prompt": f"Question {i+1} about {section_title}",
                "options": options,
                "answer_index": 0,  # First option is always correct in fallback
            })
        return items

    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        logger.info("generate_quiz_from_content: using AI model=%s, num_questions=%d", model, num_questions)

        # Truncate content if too long (keep under ~8000 chars for context)
        content_excerpt = section_content[:8000] if len(section_content) > 8000 else section_content

        prompt = f"""Create {num_questions} multiple-choice questions based on the following content from "{section_title}".

Each question should:
- Test understanding of key concepts from the text
- Be clear and unambiguous
- Have exactly 4 options

Return a JSON array where each item has:
- "prompt": the question text
- "correct": the correct answer
- "wrong": array of 3 incorrect answers

Example format:
[
  {{
    "prompt": "What is the main topic discussed?",
    "correct": "The correct answer",
    "wrong": ["Wrong answer 1", "Wrong answer 2", "Wrong answer 3"]
  }}
]

CONTENT:
{content_excerpt}

Generate {num_questions} questions:"""

        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("="*80)
            logger.debug("GENERATE_QUIZ_FROM_CONTENT - START")
            logger.debug("Section Title: %s", section_title)
            logger.debug("Content Length: %d characters", len(content_excerpt))
            logger.debug("Number of Questions Requested: %d", num_questions)
            logger.debug("-"*40)
            logger.debug("PROMPT:")
            logger.debug(prompt)
            logger.debug("-"*40)

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a quiz generator. Return only valid JSON array with no additional text or code fences."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )

        content = resp.choices[0].message.content or "[]"
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("RESPONSE FROM MODEL (%s):", model)
            logger.debug(content)
            logger.debug("GENERATE_QUIZ_FROM_CONTENT - END")
            logger.debug("="*80)

        data = _try_parse_json(content) or []
        out: list[Dict[str, Any]] = []

        for obj in data[:num_questions]:
            prompt_text = str(obj.get("prompt", ""))[:300]
            correct = str(obj.get("correct", ""))[:120]
            wrong = obj.get("wrong", [])

            if not prompt_text or not correct or len(wrong) < 3:
                continue

            # Combine correct and wrong answers, then shuffle
            options = [correct] + [str(w)[:120] for w in wrong[:3]]
            random.shuffle(options)

            # Find where the correct answer ended up
            answer_index = options.index(correct)

            out.append({
                "prompt": prompt_text,
                "options": options,
                "answer_index": answer_index,
            })

        if len(out) < num_questions:
            logger.warning(f"Only generated {len(out)} questions out of {num_questions} requested")

        return out[:num_questions]

    except Exception as e:
        logger.warning("generate_quiz_from_content: AI path failed; falling back", exc_info=True)

    return generate_quiz_from_content(section_title, section_content[:500], num_questions=min(num_questions, 3), use_ai=False)


def generate_quiz_from_titles(titles: List[str], num_questions: int = 5, use_ai: bool = False) -> List[Dict[str, Any]]:
    """Legacy function for backward compatibility."""
    # Convert titles to pseudo-content and use new function
    content = "\n".join(f"Section: {t}" for t in titles)
    title = "Course Overview"
    return generate_quiz_from_content(title, content, num_questions, use_ai)


def generate_assignments_from_titles(titles: List[str], max_q: int = 3, use_ai: bool = False) -> List[Dict[str, str]]:
    if not use_ai or not _has_key():
        logger.info("generate_assignments_from_titles: using fallback (use_ai=%s, has_key=%s)", use_ai, _has_key())
        # fallback: short-answer prompts and first word as keyword
        out: list[Dict[str, str]] = []
        for idx, t in enumerate(titles[:max_q]):
            keyword = (t.split()[0] if t.split() else "topic").lower()
            out.append({"prompt": f"Write 1-2 sentences summarizing: {t}", "expected_keyword": keyword})
        return out

    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        logger.info("generate_assignments_from_titles: using AI model=%s, max_q=%d", model, max_q)
        prompt = (
            "Create short-answer assignment prompts from the syllabus titles. "
            "Return JSON array of {prompt: string, expected_keyword: string}. Limit to "
            f"{max_q}."
        )
        combined = prompt + "\n\nTITLES:\n" + "\n".join(f"- {t}" for t in titles[:50])
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("generate_assignments_from_titles: PROMPT (first 2k chars)=%s", combined[:2000])
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Return only a JSON array. Do not include code fences or extra text."},
                {"role": "user", "content": combined},
            ],
            temperature=0.2,
        )
        content = resp.choices[0].message.content or "[]"
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("generate_assignments_from_titles: RAW RESPONSE (first 2k chars)=%s", (content or "")[:2000])
        data = _try_parse_json(content) or []
        out: list[Dict[str, str]] = []
        for obj in data:
            out.append({
                "prompt": str(obj.get("prompt", "Answer:") )[:300],
                "expected_keyword": str(obj.get("expected_keyword", "topic")).lower()[:60],
            })
        if out:
            return out[:max_q]
    except Exception:
        logger.warning("generate_assignments_from_titles: AI path failed; falling back", exc_info=True)
    return generate_assignments_from_titles(titles, max_q=max_q, use_ai=False)


def summarize_section(title: str, text: str, use_ai: bool = False) -> str:
    """Return a concise (<=200 chars) summary for a section title+text."""
    if not use_ai or not _has_key():
        logger.info("summarize_section: using fallback (use_ai=%s, has_key=%s) for title=%r", use_ai, _has_key(), title[:80])
        # naive: first sentence clipped
        plain = (text or "").strip().replace("\n", " ")
        if not plain:
            return f"Summary for {title}."
        summary = plain.split(".")[0][:200]
        return summary if summary else f"Summary for {title}."
    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        sys = "Return only a single concise summary <= 200 chars."
        user = f"Title: {title}\n\nTEXT (sample):\n{text[:2000]}"
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        logger.info("summarize_section: using AI model=%s for title=%r", model, title[:80])
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("="*80)
            logger.debug("SUMMARIZE_SECTION - START")
            logger.debug("Model: %s", model)
            logger.debug("Title: %s", title)
            logger.debug("-"*40)
            logger.debug("SYSTEM PROMPT:")
            logger.debug(sys)
            logger.debug("-"*40)
            logger.debug("USER PROMPT:")
            logger.debug(user)
            logger.debug("-"*40)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0.2,
        )
        content = (resp.choices[0].message.content or "").strip()
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("RESPONSE FROM MODEL (%s):", model)
            logger.debug(content)
            logger.debug("SUMMARIZE_SECTION - END")
            logger.debug("="*80)
        return content[:200] if content else f"Summary for {title}."
    except Exception:
        logger.warning("summarize_section: AI path failed; falling back for title=%r", title[:80], exc_info=True)
        return f"Summary for {title}."


def extract_toc_from_text(text: str, max_items: int = 20, use_ai: bool = False) -> List[Dict[str, Any]]:
    """
    Ask the model to extract a Table of Contents from provided textbook text.
    Returns a list of {title: str, page: int|null} in order. Page numbers are optional.
    """
    if not use_ai or not _has_key():
        logger.info("extract_toc_from_text: using fallback (no-op) (use_ai=%s, has_key=%s)", use_ai, _has_key())
        return []
    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        sys = (
            "You extract a Table of Contents from textbook text. "
            "Return only JSON array of objects: {title: string, page?: number}. "
            f"Include up to {max_items} top-level items. Do not include nested sections. "
            "Do not include code fences or any extra text—return raw JSON only."
        )
        sample = text[:50000]  # cap for safety
        user = "Extract a TOC from this text (first pages):\n\n" + sample
        model = os.getenv("OPENAI_TOC_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini"))
        logger.info("extract_toc_from_text: using AI model=%s, sample_chars=%d, max_items=%d", model, len(sample), max_items)
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("="*80)
            logger.debug("EXTRACT_TOC_FROM_TEXT - START")
            logger.debug("Model: %s", model)
            logger.debug("Sample Length: %d characters", len(sample))
            logger.debug("Max Items Requested: %d", max_items)
            logger.debug("-"*40)
            logger.debug("SYSTEM PROMPT:")
            logger.debug(sys)
            logger.debug("-"*40)
            logger.debug("USER PROMPT (first 5000 chars):")
            logger.debug(user[:5000])
            if len(user) > 5000:
                logger.debug("... [%d more characters]", len(user) - 5000)
            logger.debug("-"*40)
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0.1,
        )
        content = resp.choices[0].message.content or "[]"
        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("RESPONSE FROM MODEL (%s):", model)
            logger.debug(content)
            logger.debug("EXTRACT_TOC_FROM_TEXT - END")
            logger.debug("="*80)
        data = _try_parse_json(content) or []
        out: List[Dict[str, Any]] = []
        for obj in data:
            title = str(obj.get("title", "")).strip()
            if not title:
                continue
            page = obj.get("page")
            try:
                page = int(page) if page is not None else None
            except Exception:
                page = None
            out.append({"title": title[:160], "page": page})
        logger.info("extract_toc_from_text: AI returned %d TOC items", len(out))
        return out[:max_items]
    except Exception:
        logger.warning("extract_toc_from_text: AI path failed; returning empty list", exc_info=True)
        return []
