from __future__ import annotations

import random
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from .auth import get_current_user
from .db import get_session
import os
from .ai import generate_quiz_from_titles, should_use_ai
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
)
from fpdf import FPDF
import json

router = APIRouter(prefix="/courses", tags=["quizzes"])


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
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> QuizRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Course has no syllabus items")

    titles = [it.title for it in items]

    quiz = Quiz(course_id=course_id)
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    use_ai = should_use_ai()
    questions = generate_quiz_from_titles(titles, num_questions=5, use_ai=use_ai)
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

    return QuizRead(id=quiz.id, course_id=quiz.course_id, created_at=quiz.created_at, num_questions=num_questions)


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
    if reading.syllabus_item_id:
        syllabus_item = session.get(SyllabusItem, reading.syllabus_item_id)
        if syllabus_item:
            titles = [syllabus_item.title]
        else:
            titles = [reading.title]
    else:
        titles = [reading.title]

    quiz = Quiz(course_id=course.id)
    session.add(quiz)
    session.commit()
    session.refresh(quiz)

    use_ai = should_use_ai()
    questions = generate_quiz_from_titles(titles, num_questions=5, use_ai=use_ai)
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

    return QuizRead(id=quiz.id, course_id=quiz.course_id, created_at=quiz.created_at, num_questions=num_questions)


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
        reads.append(QuizRead(id=q.id, course_id=q.course_id, created_at=q.created_at, num_questions=qcount))
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
    qs = session.exec(select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order_index)).all()
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(0, 10, txt=f"Quiz #{quiz.id} - {course.title}", ln=True)
    for i, q in enumerate(qs, start=1):
        pdf.multi_cell(0, 8, txt=f"{i}. {q.prompt}")
        pdf.cell(0, 8, txt=f"   A) {q.option_a}", ln=True)
        pdf.cell(0, 8, txt=f"   B) {q.option_b}", ln=True)
        pdf.cell(0, 8, txt=f"   C) {q.option_c}", ln=True)
        pdf.cell(0, 8, txt=f"   D) {q.option_d}", ln=True)
        pdf.ln(2)
    data = pdf.output(dest='S').encode('latin1')
    return StreamingResponse(iter([data]), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=quiz_{quiz.id}.pdf"})


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
