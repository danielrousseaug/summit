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


async def summarize_section_async(title: str, text: str, use_ai: bool = False) -> str:
    """Async version of summarize_section for parallel execution."""
    if not use_ai or not _has_key():
        # naive: first sentence clipped
        plain = (text or "").strip().replace("\n", " ")
        if not plain:
            return f"Summary for {title}."
        summary = plain.split(".")[0][:200]
        return summary if summary else f"Summary for {title}."
    try:
        from openai import AsyncOpenAI  # type: ignore
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        sys = "Return only a single concise summary <= 200 chars."
        user = f"Title: {title}\n\nTEXT (sample):\n{text[:2000]}"
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0.2,
        )
        content = (resp.choices[0].message.content or "").strip()
        return content[:200] if content else f"Summary for {title}."
    except Exception:
        logger.warning("summarize_section_async: AI path failed; falling back for title=%r", title[:80], exc_info=True)
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

        # Common preface/front matter sections to filter (exact matches or starts-with)
        skip_exact = {
            "preface", "foreword", "acknowledgment", "acknowledgments", "dedication",
            "about the author", "about the authors", "about this book",
            "to everyone", "to educators", "to students", "to readers",
            "final words", "references", "bibliography", "index",
            "table of contents", "contents", "copyright", "publishing information",
            "a dialogue on the book"
        }
        skip_startswith = ["preface to", "appendix", "how to use"]

        out: List[Dict[str, Any]] = []
        for obj in data:
            title = str(obj.get("title", "")).strip()
            if not title:
                continue

            # Skip common preface/front matter sections
            title_lower = title.lower()

            # Check exact matches
            if title_lower in skip_exact:
                logger.debug("extract_toc_from_text: skipping preface item: %s", title)
                continue

            # Check starts-with patterns
            if any(title_lower.startswith(pattern) for pattern in skip_startswith):
                logger.debug("extract_toc_from_text: skipping preface item: %s", title)
                continue

            page = obj.get("page")
            try:
                page = int(page) if page is not None else None
            except Exception:
                page = None
            out.append({"title": title[:160], "page": page})

        logger.info("extract_toc_from_text: AI returned %d TOC items (after filtering preface)", len(out))
        return out[:max_items]
    except Exception:
        logger.warning("extract_toc_from_text: AI path failed; returning empty list", exc_info=True)
        return []


def extract_structural_markers(pdf_path: str, max_pages: int = None) -> List[Dict[str, Any]]:
    """
    Analyze PDF structure to find chapter/section markers using font size and formatting.
    Returns list of {text: str, page: int, font_size: float} for potential headers.
    """
    try:
        import fitz  # type: ignore

        markers: List[Dict[str, Any]] = []

        with fitz.open(pdf_path) as doc:
            total_pages = doc.page_count if max_pages is None else min(doc.page_count, max_pages)
            logger.info("extract_structural_markers: analyzing %d pages for headers", total_pages)

            # Collect font sizes across document to determine what's "large"
            font_sizes: List[float] = []

            for page_num in range(total_pages):
                page = doc[page_num]
                blocks = page.get_text("dict")["blocks"]

                for block in blocks:
                    if "lines" in block:
                        for line in block["lines"]:
                            for span in line["spans"]:
                                font_sizes.append(span["size"])

            if not font_sizes:
                return []

            # Calculate threshold: headers are typically 20%+ larger than median
            font_sizes.sort()
            median_size = font_sizes[len(font_sizes) // 2]
            header_threshold = median_size * 1.2
            logger.info("extract_structural_markers: median_font=%0.1f, threshold=%0.1f", median_size, header_threshold)

            # Now extract text with large fonts
            for page_num in range(total_pages):
                page = doc[page_num]
                blocks = page.get_text("dict")["blocks"]

                for block in blocks:
                    if "lines" in block:
                        for line in block["lines"]:
                            # Check if line has large font
                            max_font_in_line = max((span["size"] for span in line["spans"]), default=0)

                            if max_font_in_line >= header_threshold:
                                # Extract text from this line
                                text = " ".join(span["text"] for span in line["spans"]).strip()

                                # Filter out page numbers and very short text
                                if text and len(text) > 5 and not text.isdigit():
                                    # Check for common chapter/section patterns
                                    chapter_pattern = re.match(r'^(Chapter|Section|Part|Unit|Module|Lesson)\s+\d+', text, re.IGNORECASE)
                                    numbered_pattern = re.match(r'^\d+\.?\d*\s+[A-Z]', text)

                                    if chapter_pattern or numbered_pattern or max_font_in_line >= header_threshold * 1.1:
                                        markers.append({
                                            "text": text[:200],
                                            "page": page_num + 1,  # 1-indexed
                                            "font_size": max_font_in_line
                                        })

            logger.info("extract_structural_markers: found %d potential headers", len(markers))
            return markers

    except Exception as e:
        logger.warning("extract_structural_markers: failed with error: %s", e, exc_info=True)
        return []


def extract_toc_structure(pdf_path: str, use_ai: bool = False) -> List[str]:
    """
    Extract table of contents STRUCTURE (chapter titles only, no page numbers) from first 30 pages.
    Uses small/cheap model since this is just for context.
    Returns list of chapter titles.
    """
    if not use_ai or not _has_key():
        return []

    try:
        import fitz  # type: ignore
        from openai import OpenAI  # type: ignore

        with fitz.open(pdf_path) as doc:
            # Get first 30 pages
            toc_pages = min(doc.page_count, 30)
            toc_text = "\n".join([doc[i].get_text() for i in range(toc_pages)])[:20000]  # Limit chars

        if not toc_text.strip():
            return []

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = "gpt-4o-mini"  # Use cheap model for this

        prompt = f"""Extract the table of contents from this textbook. Return ONLY the chapter/section TITLES as a JSON array of strings.

Rules:
- Return chapter titles ONLY (no page numbers, no subsections)
- Skip preface, acknowledgments, references, index
- Focus on main learning chapters
- Return empty array [] if no clear TOC found

Example output: ["Introduction to Operating Systems", "Processes and Threads", "Memory Management", "File Systems"]

TEXT FROM FIRST 30 PAGES:
{toc_text}

Return ONLY a JSON array of strings, no code fences."""

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You extract table of contents structure. Return only JSON array of strings."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
        )

        content = resp.choices[0].message.content or "[]"
        data = _try_parse_json(content)

        if isinstance(data, list) and all(isinstance(x, str) for x in data):
            # Clean up and return
            titles = [str(t).strip()[:150] for t in data if str(t).strip()]
            logger.info("extract_toc_structure: extracted %d chapter titles", len(titles))
            return titles
        else:
            logger.warning("extract_toc_structure: invalid format returned")
            return []

    except Exception as e:
        logger.warning("extract_toc_structure: failed: %s", e, exc_info=True)
        return []


def extract_all_headers_from_pdf(pdf_path: str, total_pages: int) -> List[Dict[str, Any]]:
    """
    Extract ALL large-font text from PDF that could potentially be headers.
    Returns list of {text: str, page: int, font_size: float}

    No filtering - we let AI decide what's a chapter vs front matter.
    """
    try:
        import fitz  # type: ignore

        logger.info("extract_all_headers_from_pdf: scanning %d pages for large text", total_pages)

        with fitz.open(pdf_path) as doc:
            # First: determine what "large" means by sampling
            all_font_sizes = []
            sample_pages = list(range(0, min(total_pages, 50)))

            for page_num in sample_pages:
                page = doc[page_num]
                blocks = page.get_text("dict")["blocks"]
                for block in blocks:
                    if "lines" in block:
                        for line in block["lines"]:
                            for span in line["spans"]:
                                all_font_sizes.append(span["size"])

            if not all_font_sizes:
                logger.warning("extract_all_headers_from_pdf: no text found")
                return []

            all_font_sizes.sort()
            median_size = all_font_sizes[len(all_font_sizes) // 2]
            # Collect anything 20%+ larger than median
            threshold = median_size * 1.2

            logger.info("extract_all_headers_from_pdf: median_font=%.1f, threshold=%.1f", median_size, threshold)

            # Second: extract all large text with page numbers
            headers = []
            seen = set()

            for page_num in range(total_pages):
                page = doc[page_num]
                blocks = page.get_text("dict")["blocks"]

                for block in blocks:
                    if "lines" in block:
                        for line in block["lines"]:
                            if not line["spans"]:
                                continue

                            max_font = max(span["size"] for span in line["spans"])

                            if max_font >= threshold:
                                text = " ".join(span["text"] for span in line["spans"]).strip()

                                # Basic cleanup only
                                if len(text) < 2 or len(text) > 250:
                                    continue
                                if text.isdigit():
                                    continue

                                # Track unique (text, page) pairs
                                key = (text, page_num + 1)
                                if key not in seen:
                                    headers.append({
                                        "text": text,
                                        "page": page_num + 1,
                                        "font_size": max_font
                                    })
                                    seen.add(key)

            logger.info("extract_all_headers_from_pdf: found %d large-font items", len(headers))
            return headers

    except Exception as e:
        logger.warning("extract_all_headers_from_pdf: failed: %s", e, exc_info=True)
        return []


async def generate_intelligent_syllabus(pdf_path: str, total_pages: int, use_ai: bool = False, debug_log_path: str = None) -> List[Dict[str, Any]]:
    """
    Generate syllabus by:
    1. Extracting ALL large-font text from PDF with page numbers
    2. Using AI to intelligently identify which are chapters vs front matter
    3. AI returns proper page ranges

    Returns list of dicts with: {title: str, summary: str, start_page: int, end_page: int}
    """
    import fitz  # type: ignore
    from openai import OpenAI  # type: ignore
    from datetime import datetime
    import asyncio

    # Setup dedicated debug log
    debug_lines = []
    def debug_log(msg: str):
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        line = f"[{timestamp}] {msg}"
        debug_lines.append(line)
        logger.info(msg)

    debug_log("="*80)
    debug_log("SYLLABUS GENERATION DEBUG LOG")
    debug_log("="*80)
    debug_log(f"PDF: {pdf_path}")
    debug_log(f"Total Pages: {total_pages}")
    debug_log(f"AI Enabled: {use_ai}")
    debug_log("")

    # STEP 1A: Extract TOC structure (titles only) from first 30 pages
    debug_log("STEP 1A: Extracting table of contents structure from first 30 pages...")
    toc_titles = extract_toc_structure(pdf_path, use_ai=use_ai)

    if toc_titles:
        debug_log(f"Found TOC with {len(toc_titles)} chapters:")
        for i, title in enumerate(toc_titles, 1):
            debug_log(f"  {i}. {title}")
    else:
        debug_log("No clear TOC found (this is okay, will use headers only)")
    debug_log("")

    # STEP 1B: Extract all potential headers from the PDF
    debug_log("STEP 1B: Extracting all large-font text from PDF...")
    all_headers = extract_all_headers_from_pdf(pdf_path, total_pages)

    debug_log(f"Found {len(all_headers)} large-font items")
    debug_log("")
    debug_log("Extracted Headers:")
    for i, h in enumerate(all_headers[:50], 1):  # Show first 50
        debug_log(f"  {i}. Page {h['page']:3d}: {h['text']}")
    if len(all_headers) > 50:
        debug_log(f"  ... and {len(all_headers) - 50} more")
    debug_log("")

    if not all_headers:
        debug_log("ERROR: No headers found!")
        debug_log("Using simple fallback: equal page division")
        items_count = min(12, max(8, total_pages // 50))
        pages_per = total_pages // items_count
        result = []
        for i in range(items_count):
            start = i * pages_per + 1
            end = total_pages if i == items_count - 1 else (i + 1) * pages_per
            result.append({
                "title": f"Section {i + 1}",
                "summary": f"Content from pages {start} to {end}",
                "start_page": start,
                "end_page": end
            })
        return result

    if not use_ai or not _has_key():
        debug_log("STEP 2: AI not available or disabled")
        debug_log("Using heuristic approach (pattern matching)")
        # Simple heuristic: take headers that look like chapters
        import re
        chapters = []
        for h in all_headers:
            if re.match(r'^(\d+\.?\d*\s+[A-Z]|Chapter|Section|Part)', h["text"], re.IGNORECASE):
                chapters.append(h)

        if len(chapters) < 3:
            chapters = all_headers[:min(15, len(all_headers))]

        result = []
        for i, ch in enumerate(chapters):
            start = ch["page"]
            end = chapters[i + 1]["page"] - 1 if i + 1 < len(chapters) else total_pages
            result.append({
                "title": ch["text"],
                "summary": f"Chapter covering {ch['text']}",
                "start_page": start,
                "end_page": end
            })
        return result

    # AI-DRIVEN APPROACH
    debug_log("STEP 2: Using AI to identify chapters from headers...")
    debug_log("")

    try:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        # Use reasoning model for syllabus generation - better at logical structure analysis
        model = os.getenv("OPENAI_SYLLABUS_MODEL", "o3-mini")

        # Send ALL headers to AI - we have plenty of context (128k tokens)
        headers_text = "\n".join([
            f"Page {h['page']}: {h['text']}"
            for h in all_headers
        ])

        debug_log(f"Sending ALL {len(all_headers)} headers to AI model: {model}")
        debug_log(f"Coverage: pages {all_headers[0]['page']} to {all_headers[-1]['page']}")

        # Build TOC context if available
        toc_context = ""
        if toc_titles:
            toc_list = "\n".join([f"- {title}" for title in toc_titles])
            toc_context = f"""
TABLE OF CONTENTS STRUCTURE (from book's TOC - use this to understand intended chapter organization):
{toc_list}

NOTE: The TOC above shows the book's intended structure, but does NOT have accurate PDF page numbers.
Use the headers below (which have accurate PDF page numbers) to determine actual page ranges.
"""

        prompt = f"""You are analyzing a {total_pages}-page textbook PDF. I've extracted the table of contents structure AND all large-font text with page numbers.

Your task: Create a syllabus with 10-20 main chapters.
{toc_context}

CRITICAL RULES FOR PAGE RANGES:
1. Start page = where the chapter header appears
2. End page = one page BEFORE the next chapter starts (NOT just start_page + 1!)
3. Each chapter should span multiple pages (typically 10-50 pages)
4. The LAST chapter ends at page {total_pages}

FRONT MATTER RULE:
- Combine ALL front matter (preface, acknowledgments, "to everyone", "to educators", table of contents, etc.) into a SINGLE "Introduction" entry
- This introduction should cover from page 1 until the first real chapter begins
- Do NOT create separate entries for each preface section

BACK MATTER RULE:
- Skip references, bibliography, index, appendices entirely
- The last chapter should be the last substantive content chapter

Return JSON array: [{{"title": str, "summary": str, "start_page": int, "end_page": int}}, ...]

EXAMPLE of correct page ranges:
If headers are:
- Page 7: Preface
- Page 15: Contents
- Page 39: Introduction to OS
- Page 95: Scheduling
- Page 200: Memory Management

Correct output:
[
  {{"title": "Introduction", "summary": "...", "start_page": 1, "end_page": 38}},
  {{"title": "Introduction to Operating Systems", "summary": "...", "start_page": 39, "end_page": 94}},
  {{"title": "Scheduling", "summary": "...", "start_page": 95, "end_page": 199}},
  {{"title": "Memory Management", "summary": "...", "start_page": 200, "end_page": {total_pages}}}
]

EXTRACTED HEADERS:
{headers_text}

Return ONLY valid JSON array, no code fences or extra text."""

        debug_log("")
        debug_log("AI PROMPT:")
        debug_log("-" * 40)
        debug_log(prompt)
        debug_log("-" * 40)
        debug_log("")

        # Reasoning models (o3, o1) don't support temperature
        if model.startswith(("o3", "o1")):
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
            )
        else:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are an expert at analyzing textbook structure. Return only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
            )

        content = resp.choices[0].message.content or "[]"

        debug_log("AI RESPONSE:")
        debug_log("-" * 40)
        debug_log(content)
        debug_log("-" * 40)
        debug_log("")

        data = _try_parse_json(content) or []
        result = []

        # Check if enhanced summaries are enabled (default: disabled for speed)
        enable_enhanced_summaries = os.getenv("ENABLE_ENHANCED_SUMMARIES", "false").lower() in ("true", "1", "yes")

        with fitz.open(pdf_path) as doc:
            # First pass: collect all valid chapters with their base summaries
            chapters_to_enhance = []

            for obj in data:
                title = str(obj.get("title", "")).strip()[:120]
                summary = str(obj.get("summary", "")).strip()[:250]
                start_page = obj.get("start_page")
                end_page = obj.get("end_page")

                try:
                    start_page = int(start_page)
                    end_page = int(end_page)

                    # Validate range
                    start_page = max(1, min(start_page, total_pages))
                    end_page = max(start_page, min(end_page, total_pages))

                    if title and summary:
                        chapter_data = {
                            "title": title,
                            "summary": summary,
                            "start_page": start_page,
                            "end_page": end_page,
                            "page_text": None
                        }

                        # Extract first page text if enhanced summaries are enabled
                        if enable_enhanced_summaries and use_ai:
                            try:
                                chapter_data["page_text"] = doc[start_page - 1].get_text()[:2000]
                            except:
                                pass

                        chapters_to_enhance.append(chapter_data)
                except (ValueError, TypeError):
                    logger.warning("generate_intelligent_syllabus: invalid page numbers: %s", obj)
                    continue

            # Second pass: enhance summaries in parallel using async
            if enable_enhanced_summaries and use_ai and chapters_to_enhance:
                debug_log(f"STEP 3: Enhancing summaries for {len(chapters_to_enhance)} chapters in parallel...")

                # Create async tasks for all chapters that have page text
                async_tasks = []
                task_indices = []

                for i, chapter in enumerate(chapters_to_enhance):
                    if chapter["page_text"]:
                        async_tasks.append(
                            summarize_section_async(chapter["title"], chapter["page_text"], use_ai=True)
                        )
                        task_indices.append(i)

                # Run all summarizations in parallel
                if async_tasks:
                    enhanced_summaries = await asyncio.gather(*async_tasks)

                    # Update chapters with enhanced summaries
                    for task_idx, enhanced_summary in zip(task_indices, enhanced_summaries):
                        if enhanced_summary and len(enhanced_summary) > 20:
                            chapters_to_enhance[task_idx]["summary"] = enhanced_summary

            # Build final result
            for chapter in chapters_to_enhance:
                result.append({
                    "title": chapter["title"],
                    "summary": chapter["summary"],
                    "start_page": chapter["start_page"],
                    "end_page": chapter["end_page"]
                })

        if result and len(result) >= 3:
            debug_log("STEP 3: AI successfully identified chapters")
            debug_log("")
            debug_log(f"Final Syllabus ({len(result)} chapters):")
            for i, ch in enumerate(result, 1):
                debug_log(f"  {i}. {ch['title']}")
                debug_log(f"      Pages: {ch['start_page']}-{ch['end_page']}")
                debug_log(f"      Summary: {ch['summary']}")
                debug_log("")

            debug_log("="*80)
            debug_log("SUCCESS: Syllabus generation complete")
            debug_log("="*80)

            # Save debug log to file
            if debug_log_path:
                try:
                    with open(debug_log_path, 'w') as f:
                        f.write("\n".join(debug_lines))
                    debug_log(f"Debug log saved to: {debug_log_path}")
                except Exception as e:
                    logger.error(f"Failed to save debug log: {e}")

            return result
        else:
            debug_log(f"WARNING: AI returned insufficient chapters ({len(result)})")

    except Exception as e:
        debug_log(f"ERROR: AI processing failed: {e}")
        import traceback
        debug_log(traceback.format_exc())

    # Fallback if AI fails
    debug_log("Using fallback: equal page division")
    items_count = min(12, max(8, total_pages // 50))
    pages_per = total_pages // items_count
    result = []
    for i in range(items_count):
        start = i * pages_per + 1
        end = total_pages if i == items_count - 1 else (i + 1) * pages_per
        result.append({
            "title": f"Section {i + 1}",
            "summary": f"Content from pages {start} to {end}",
            "start_page": start,
            "end_page": end
        })

    debug_log("")
    debug_log(f"Fallback generated {len(result)} sections")
    debug_log("="*80)

    # Save debug log
    if debug_log_path:
        try:
            with open(debug_log_path, 'w') as f:
                f.write("\n".join(debug_lines))
            logger.info(f"Debug log saved to: {debug_log_path}")
        except Exception as e:
            logger.error(f"Failed to save debug log: {e}")

    return result


def generate_syllabus_from_samples(samples: List[Dict[str, str]], total_pages: int, max_items: int = 8, use_ai: bool = False) -> List[Tuple[str, str]]:
    """
    Generate syllabus from distributed page samples across a large document.
    samples: [{"page": int, "content": str}, ...]
    Returns list of (title, summary) tuples.
    """
    if not use_ai or not _has_key():
        logger.info("generate_syllabus_from_samples: using fallback")
        # Simple fallback: use first line of each sample as title
        items = []
        for idx, sample in enumerate(samples[:max_items]):
            lines = [l.strip() for l in sample["content"].split("\n") if l.strip()]
            title = lines[0][:80] if lines else f"Section {idx + 1}"
            summary = " ".join(lines[1:4])[:200] if len(lines) > 1 else "Summary for this section."
            items.append((title, summary))
        return items

    try:
        from openai import OpenAI  # type: ignore

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

        # Build context from samples
        context_parts = []
        for sample in samples[:20]:  # Limit to prevent token overflow
            context_parts.append(f"--- Page {sample['page']} ---\n{sample['content'][:1500]}")

        context = "\n\n".join(context_parts)

        prompt = f"""You are analyzing a {total_pages}-page textbook. I'm providing you with text samples from various pages throughout the document.

Based on these samples, create a logical syllabus structure with {max_items} main topics/chapters.

Return a JSON array of objects with:
- "title": A clear, descriptive chapter/topic title (no numbering prefixes like "1.", "Chapter 1")
- "summary": A concise summary (under 200 characters)

The syllabus should represent a logical learning progression through the material.

SAMPLES:
{context}

Return only valid JSON array, no code fences or extra text."""

        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("="*80)
            logger.debug("GENERATE_SYLLABUS_FROM_SAMPLES - START")
            logger.debug("Model: %s", model)
            logger.debug("Total Pages: %d", total_pages)
            logger.debug("Samples Count: %d", len(samples))
            logger.debug("Max Items: %d", max_items)
            logger.debug("-"*40)
            logger.debug("PROMPT (first 3000 chars):")
            logger.debug(prompt[:3000])
            logger.debug("-"*40)

        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are an educational content analyzer. Return only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
        )

        content = resp.choices[0].message.content or "[]"

        if os.getenv("AI_DEBUG_LOG") == "1":
            logger.debug("RESPONSE FROM MODEL:")
            logger.debug(content)
            logger.debug("GENERATE_SYLLABUS_FROM_SAMPLES - END")
            logger.debug("="*80)

        data = _try_parse_json(content) or []
        items: List[Tuple[str, str]] = []

        for obj in data[:max_items]:
            title = str(obj.get("title", "")).strip()[:120]
            summary = str(obj.get("summary", "")).strip()[:300]

            if title:
                items.append((title, summary or f"Overview of {title}"))

        if items:
            logger.info("generate_syllabus_from_samples: AI returned %d items", len(items))
            return items

    except Exception as e:
        logger.warning("generate_syllabus_from_samples: AI failed, using fallback: %s", e, exc_info=True)

    # Fallback
    return generate_syllabus_from_samples(samples, total_pages, max_items, use_ai=False)
