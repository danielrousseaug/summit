from __future__ import annotations

import random
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from sqlmodel import Session, select
from pydantic import BaseModel

from .auth import get_current_user
from .db import get_session
import os
import logging
from .ai import generate_quiz_from_titles, generate_quiz_from_content, should_use_ai

logger = logging.getLogger("summit.quizzes")
from .models import (
    Course,
    Quiz,
    QuizDetailRead,
    QuizQuestion,
    QuizQuestionRead,
    QuizRead,
    QuizSubmission,
    QuizSubmissionRead,
    SyllabusItem,
    Reading,
    User,
    PDFPage,
)
from fpdf import FPDF
import json

router = APIRouter(prefix="/courses", tags=["quizzes"])


class QuizGenerateRequest(BaseModel):
    syllabus_item_id: Optional[int] = None


def _quiz_question_from_titles(titles: List[str]) -> tuple[str, List[str], int]:
    # Prompt and multiple-choice options based on syllabus titles
    correct_title = random.choice(titles)
    distractors = [t for t in titles if t != correct_title]
    random.shuffle(distractors)
    # Ensure at least 3 distractors by allowing duplicates if necessary
    while len(distractors) < 3:
        distractors.append(random.choice(titles))
    options = distractors[:3] + [correct_title]
    random.shuffle(options)
    # Ensure we still have 4 options
    while len(options) < 4:
        options.append(random.choice(titles))
    options = options[:4]
    correct_index = options.index(correct_title)
    prompt = "Which of the following is a syllabus item of this course?"
    return prompt, options, correct_index


@router.post("/{course_id}/quizzes/generate", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def generate_quiz(
    course_id: int,
    request: QuizGenerateRequest = QuizGenerateRequest(),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> QuizRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id).order_by(SyllabusItem.order_index)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Course has no syllabus items")

    target_item = None
    syllabus_item_id = request.syllabus_item_id

    if syllabus_item_id:
        # Generate quiz for specific syllabus item
        target_item = session.get(SyllabusItem, syllabus_item_id)
        if not target_item or target_item.course_id != course_id:
            raise HTTPException(status_code=404, detail="Syllabus item not found")

        # Check if quiz already exists for this item
        existing_quiz = session.exec(select(Quiz).where(Quiz.course_id == course_id, Quiz.syllabus_item_id == syllabus_item_id)).first()
        if existing_quiz:
            raise HTTPException(status_code=400, detail="Quiz already exists for this syllabus item")
    else:
        # Find the first syllabus item that doesn't have a quiz yet (legacy behavior)
        existing_quizzes = session.exec(select(Quiz.syllabus_item_id).where(Quiz.course_id == course_id, Quiz.syllabus_item_id.isnot(None))).all()
        existing_ids = set(existing_quizzes)

        for item in items:
            if item.id not in existing_ids:
                target_item = item
                break

        if not target_item:
            raise HTTPException(status_code=400, detail="All syllabus items already have quizzes")

    quiz = Quiz(course_id=course_id, syllabus_item_id=target_item.id)
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    # Get PDF content for this syllabus item's pages if available
    section_content = ""
    if course.pdf_path:
        # Get readings associated with this syllabus item to find page ranges
        readings = session.exec(
            select(Reading)
            .where(Reading.course_id == course_id, Reading.syllabus_item_id == target_item.id)
            .order_by(Reading.start_page)
        ).all()

        if readings:
            # Get the page range from readings
            start_page = min(r.start_page for r in readings)
            end_page = max(r.end_page for r in readings)
        else:
            # Estimate page range based on syllabus order (rough estimate)
            items_count = len(items)
            pages_per_item = max(1, (course.num_pages or 100) // items_count) if items_count > 0 else 10
            item_index = next((i for i, item in enumerate(items) if item.id == target_item.id), 0)
            start_page = item_index * pages_per_item + 1
            end_page = min((item_index + 1) * pages_per_item, course.num_pages or start_page + 10)

        # Get PDF page content from database
        pdf_pages = session.exec(
            select(PDFPage)
            .where(
                PDFPage.course_id == course_id,
                PDFPage.page_number >= start_page,
                PDFPage.page_number <= end_page
            )
            .order_by(PDFPage.page_number)
        ).all()

        if pdf_pages:
            section_content = "\n\n".join(page.content for page in pdf_pages)
        else:
            # Fallback to reading PDF directly if pages not in DB
            try:
                import fitz  # type: ignore
                with fitz.open(course.pdf_path) as doc:
                    pages_text = []
                    for page_num in range(start_page - 1, min(end_page, doc.page_count)):
                        pages_text.append(doc[page_num].get_text())
                    section_content = "\n\n".join(pages_text)
            except Exception as e:
                logger.warning(f"Failed to extract PDF content: {e}")

    # Generate quiz using content if available, otherwise use title
    use_ai = should_use_ai()
    if section_content:
        questions = generate_quiz_from_content(
            target_item.title,
            section_content,
            num_questions=10,  # Increased from 5 to 10
            use_ai=use_ai
        )
    else:
        # Fallback to title-based generation
        questions = generate_quiz_from_titles([target_item.title], num_questions=10, use_ai=use_ai)

    num_questions = len(questions)
    for idx, q in enumerate(questions):
        prompt = q["prompt"]
        options = q["options"]
        correct_index = int(q["answer_index"]) if 0 <= int(q["answer_index"]) < 4 else 0
        qq = QuizQuestion(
            quiz_id=quiz.id,
            order_index=idx,
            prompt=prompt,
            option_a=options[0],
            option_b=options[1],
            option_c=options[2],
            option_d=options[3],
            answer_index=correct_index,
        )
        session.add(qq)
    session.commit()

    return QuizRead(
        id=quiz.id,
        course_id=quiz.course_id,
        syllabus_item_id=target_item.id,
        syllabus_item_title=target_item.title,
        created_at=quiz.created_at,
        num_questions=num_questions
    )


@router.post("/readings/{reading_id}/quizzes/generate", response_model=QuizRead, status_code=status.HTTP_201_CREATED)
def generate_reading_quiz(
    reading_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> QuizRead:
    reading = session.get(Reading, reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")

    course = session.get(Course, reading.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reading not found")

    # Generate quiz based on the specific reading/syllabus item
    syllabus_item = None
    if reading.syllabus_item_id:
        syllabus_item = session.get(SyllabusItem, reading.syllabus_item_id)
        if syllabus_item:
            titles = [syllabus_item.title]
        else:
            titles = [reading.title]
    else:
        titles = [reading.title]

    quiz = Quiz(course_id=course.id, syllabus_item_id=reading.syllabus_item_id)
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    # Get PDF content for the reading pages
    section_content = ""
    if course.pdf_path:
        # Get PDF page content from database
        pdf_pages = session.exec(
            select(PDFPage)
            .where(
                PDFPage.course_id == course.id,
                PDFPage.page_number >= reading.start_page,
                PDFPage.page_number <= reading.end_page
            )
            .order_by(PDFPage.page_number)
        ).all()

        if pdf_pages:
            section_content = "\n\n".join(page.content for page in pdf_pages)
        else:
            # Fallback to reading PDF directly if pages not in DB
            try:
                import fitz  # type: ignore
                with fitz.open(course.pdf_path) as doc:
                    pages_text = []
                    for page_num in range(reading.start_page - 1, min(reading.end_page, doc.page_count)):
                        pages_text.append(doc[page_num].get_text())
                    section_content = "\n\n".join(pages_text)
            except Exception as e:
                logger.warning(f"Failed to extract PDF content: {e}")

    # Generate quiz using content
    use_ai = should_use_ai()
    reading_title = syllabus_item.title if syllabus_item else reading.title

    if section_content:
        questions = generate_quiz_from_content(
            reading_title,
            section_content,
            num_questions=10,  # Increased from 5 to 10
            use_ai=use_ai
        )
    else:
        # Fallback to title-based generation
        questions = generate_quiz_from_titles(titles, num_questions=10, use_ai=use_ai)

    num_questions = len(questions)
    for idx, q in enumerate(questions):
        prompt = q["prompt"]
        options = q["options"]
        correct_index = int(q["answer_index"]) if 0 <= int(q["answer_index"]) < 4 else 0
        qq = QuizQuestion(
            quiz_id=quiz.id,
            order_index=idx,
            prompt=prompt,
            option_a=options[0],
            option_b=options[1],
            option_c=options[2],
            option_d=options[3],
            answer_index=correct_index,
        )
        session.add(qq)
    session.commit()

    return QuizRead(
        id=quiz.id,
        course_id=quiz.course_id,
        syllabus_item_id=reading.syllabus_item_id,
        syllabus_item_title=syllabus_item.title if syllabus_item else None,
        created_at=quiz.created_at,
        num_questions=num_questions
    )


@router.get("/{course_id}/quizzes", response_model=List[QuizRead])
def list_quizzes(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[QuizRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    quizzes = session.exec(select(Quiz).where(Quiz.course_id == course_id).order_by(Quiz.created_at.desc())).all()
    reads: List[QuizRead] = []
    for q in quizzes:
        qcount = len(session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == q.id)).all())
        syllabus_item = None
        syllabus_item_title = None
        if q.syllabus_item_id:
            syllabus_item = session.get(SyllabusItem, q.syllabus_item_id)
            if syllabus_item:
                syllabus_item_title = syllabus_item.title
        reads.append(QuizRead(
            id=q.id,
            course_id=q.course_id,
            syllabus_item_id=q.syllabus_item_id,
            syllabus_item_title=syllabus_item_title,
            created_at=q.created_at,
            num_questions=qcount
        ))
    return reads


@router.get("/quizzes/{quiz_id}", response_model=QuizDetailRead)
def get_quiz(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> QuizDetailRead:
    quiz = session.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = session.get(Course, quiz.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")

    qs = session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order_index)).all()
    questions = [
        QuizQuestionRead(
            id=qq.id,
            order_index=qq.order_index,
            prompt=qq.prompt,
            options=[qq.option_a, qq.option_b, qq.option_c, qq.option_d],
        )
        for qq in qs
    ]
    return QuizDetailRead(id=quiz.id, course_id=quiz.course_id, created_at=quiz.created_at, questions=questions)


@router.post("/quizzes/{quiz_id}/submit")
def submit_quiz(
    quiz_id: int,
    answers: List[int],
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    quiz = session.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = session.get(Course, quiz.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")

    qs = session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order_index)).all()
    if len(answers) != len(qs):
        raise HTTPException(status_code=400, detail="Invalid number of answers")

    score = 0
    correct_indices: List[int] = []
    for idx, qq in enumerate(qs):
        correct_indices.append(qq.answer_index)
        if answers[idx] == qq.answer_index:
            score += 1

    sub = QuizSubmission(quiz_id=quiz.id, user_id=current_user.id, score=score, total=len(qs))
    session.add(sub)
    session.commit()

    return {"score": score, "total": len(qs), "correct_indices": correct_indices}


@router.get("/quizzes/{quiz_id}/submissions", response_model=List[QuizSubmissionRead])
def list_quiz_submissions(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[QuizSubmissionRead]:
    quiz = session.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = session.get(Course, quiz.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    subs = session.exec(select(QuizSubmission).where(QuizSubmission.quiz_id == quiz.id).order_by(QuizSubmission.created_at.desc())).all()
    return [QuizSubmissionRead(id=s.id, created_at=s.created_at, score=s.score, total=s.total) for s in subs]


@router.get("/quizzes/{quiz_id}/pdf")
def download_quiz_pdf(
    quiz_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    quiz = session.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = session.get(Course, quiz.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")

    # Get syllabus item title if available
    syllabus_item_title = None
    if quiz.syllabus_item_id:
        syllabus_item = session.get(SyllabusItem, quiz.syllabus_item_id)
        if syllabus_item:
            syllabus_item_title = syllabus_item.title

    qs = session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order_index)).all()

    # Helper function to safely encode text for PDF
    def safe_encode(text: str) -> str:
        """Convert Unicode characters to ASCII equivalents for PDF compatibility"""
        if not text:
            return ""
        # Replace common Unicode characters with ASCII equivalents
        replacements = {
            '\u2022': '*',  # bullet point
            '\u2013': '-',  # en dash
            '\u2014': '--', # em dash
            '\u2018': "'",  # left single quote
            '\u2019': "'",  # right single quote
            '\u201c': '"',  # left double quote
            '\u201d': '"',  # right double quote
            '\u2026': '...', # ellipsis
        }
        for unicode_char, ascii_equiv in replacements.items():
            text = text.replace(unicode_char, ascii_equiv)
        # Remove any remaining non-ASCII characters
        text = text.encode('ascii', errors='ignore').decode('ascii')
        return text

    # Create PDF with better formatting
    pdf = FPDF()
    pdf.add_page()

    # Header with branding
    pdf.set_font("Arial", "B", 18)
    pdf.set_text_color(45, 55, 72)  # Dark gray
    pdf.cell(0, 15, "Summit Learning Platform", 0, 1, "C")

    # Add a subtle line separator
    pdf.set_draw_color(200, 200, 200)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(8)

    # Course title
    pdf.set_font("Arial", "B", 14)
    pdf.set_text_color(75, 85, 99)
    pdf.cell(0, 8, safe_encode(f"Course: {course.title}"), 0, 1)
    pdf.ln(2)

    # Quiz title - use syllabus item title if available
    pdf.set_font("Arial", "B", 16)
    pdf.set_text_color(0, 0, 0)
    if syllabus_item_title:
        quiz_title = f"Quiz: {syllabus_item_title}"
    else:
        quiz_title = f"Quiz for {course.title}"

    pdf.cell(0, 10, safe_encode(quiz_title), 0, 1)

    # Quiz metadata
    pdf.set_font("Arial", "", 10)
    pdf.set_text_color(107, 114, 128)  # Gray
    from datetime import datetime
    quiz_date = quiz.created_at.strftime("%B %d, %Y")
    pdf.cell(0, 6, f"Generated: {quiz_date} | Questions: {len(qs)}", 0, 1)
    pdf.ln(8)

    # Instructions
    pdf.set_font("Arial", "B", 11)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 6, "Instructions:", 0, 1)
    pdf.set_font("Arial", "", 10)
    pdf.set_text_color(75, 85, 99)
    pdf.multi_cell(0, 5, safe_encode("Choose the best answer for each question. Mark your answers clearly."))
    pdf.ln(5)

    # Questions section
    pdf.set_font("Arial", "B", 12)
    pdf.set_text_color(0, 0, 0)
    pdf.cell(0, 8, "Questions:", 0, 1)
    pdf.ln(3)

    # Reset text color for questions
    pdf.set_text_color(0, 0, 0)

    for i, q in enumerate(qs, start=1):
        # Question number and text
        pdf.set_font("Arial", "B", 11)
        pdf.cell(0, 8, f"Question {i}:", 0, 1)
        pdf.set_font("Arial", "", 10)
        pdf.multi_cell(0, 6, safe_encode(q.prompt))
        pdf.ln(2)

        # Answer options with proper indentation
        pdf.set_font("Arial", "", 10)
        options = [q.option_a, q.option_b, q.option_c, q.option_d]
        option_letters = ["A", "B", "C", "D"]

        for letter, option in zip(option_letters, options):
            # Create a proper indented layout - use cell for the entire option
            pdf.cell(0, 6, safe_encode(f"{letter}) {option}"), 0, 1)  # Single cell for option letter and text

        pdf.ln(4)  # Space between questions

        # Add page break if we're running out of space (leave 30mm for footer)
        if pdf.get_y() > 250:
            pdf.add_page()

    # Footer
    pdf.ln(10)
    pdf.set_draw_color(200, 200, 200)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(3)
    pdf.set_font("Arial", "", 8)
    pdf.set_text_color(156, 163, 175)  # Light gray
    pdf.cell(0, 4, "Generated by Summit Learning Platform", 0, 1, "C")

    data = pdf.output(dest='S')

    # Create a clean filename
    safe_title = syllabus_item_title or course.title
    # Remove special characters for filename
    import re
    safe_title = re.sub(r'[^\w\s-]', '', safe_title).strip()
    safe_title = re.sub(r'[-\s]+', '_', safe_title)
    filename = f"quiz_{safe_title.lower()}.pdf"

    return Response(content=bytes(data), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/quizzes/{quiz_id}/grade-upload")
def grade_quiz_upload(
    quiz_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Extract student answers from uploaded text/PDF and grade via AI against the stored key
    quiz = session.get(Quiz, quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    course = session.get(Course, quiz.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    qs = session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order_index)).all()

    data = file.file.read()
    text = ""
    if file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf")):
        try:
            import fitz  # type: ignore
            with fitz.open(stream=data, filetype="pdf") as doc:
                text = "\n".join(page.get_text() for page in doc)
        except Exception:
            text = ""
    if not text:
        text = data.decode("utf-8", errors="ignore")

    # Build strict grading prompt
    rubric = {
        "questions": [
            {
                "index": i,
                "prompt": q.prompt,
                "options": [q.option_a, q.option_b, q.option_c, q.option_d],
                "answer_index": q.answer_index,
            }
            for i, q in enumerate(qs)
        ]
    }

    # Use AI only if configured; otherwise naive zero-score
    from .ai import should_use_ai
    if not should_use_ai():
        return {"score": 0, "total": len(qs), "message": "AI disabled; cannot grade upload"}

    try:
        from openai import OpenAI  # type: ignore
        client = OpenAI()
        sys = (
            "You are a strict grader. Given MCQ questions with options and the authoritative correct index, "
            "extract the student's chosen option letters (A-D) from the provided text and grade each question exactly. "
            "Ignore any extra commentary. If ambiguous, mark incorrect. Return JSON: {answers:[0-3 per q], score:int}."
        )
        user = (
            "GRADE THESE\n\nRUBRIC (JSON):\n" + json.dumps(rubric) + "\n\nSTUDENT SUBMISSION TEXT:\n" + text[:16000]
        )
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            temperature=0,
        )
        content = resp.choices[0].message.content or "{}"
        data = _try_parse_json(content) or {}
        answers = data.get("answers", [])
        score = int(data.get("score", 0))
        # clamp and recompute score for safety
        fixed = []
        for i in range(len(qs)):
            a = answers[i] if i < len(answers) else -1
            try:
                a = int(a)
            except Exception:
                a = -1
            fixed.append(a)
        recomputed = sum(1 for i, q in enumerate(qs) if 0 <= fixed[i] < 4 and fixed[i] == q.answer_index)
        score = recomputed
        # store submission
        sub = QuizSubmission(quiz_id=quiz.id, user_id=current_user.id, score=score, total=len(qs))
        session.add(sub)
        session.commit()
        return {"score": score, "total": len(qs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI grading failed: {e}")
