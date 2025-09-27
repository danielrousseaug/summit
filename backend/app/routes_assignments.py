from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from .auth import get_current_user
from .db import get_session
import os
from .ai import generate_assignments_from_titles, should_use_ai
from .models import (
    Assignment,
    AssignmentDetailRead,
    AssignmentQuestion,
    AssignmentRead,
    AssignmentSubmission,
    AssignmentSubmissionRead,
    Course,
    SyllabusItem,
    User,
)

router = APIRouter(prefix="/courses", tags=["assignments"])


@router.post("/{course_id}/assignments/generate", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
def generate_assignment(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AssignmentRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Course has no syllabus items")

    assn = Assignment(course_id=course_id)
    session.add(assn)
    session.commit()
    session.refresh(assn)

    # Generate prompts (AI if enabled)
    use_ai = should_use_ai()
    titles = [it.title for it in items]
    questions = generate_assignments_from_titles(titles, max_q=3, use_ai=use_ai)
    for idx, q in enumerate(questions):
        session.add(AssignmentQuestion(
            assignment_id=assn.id,
            order_index=idx,
            prompt=q["prompt"],
            expected_keyword=q["expected_keyword"],
        ))
    session.commit()

    return AssignmentRead(id=assn.id, course_id=assn.course_id, created_at=assn.created_at, num_questions=min(3, len(items)))


@router.get("/{course_id}/assignments", response_model=List[AssignmentRead])
def list_assignments(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> List[AssignmentRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    assns = session.exec(select(Assignment).where(Assignment.course_id == course_id).order_by(Assignment.created_at.desc())).all()
    out: List[AssignmentRead] = []
    for a in assns:
        num = len(session.exec(select(AssignmentQuestion).where(AssignmentQuestion.assignment_id == a.id)).all())
        out.append(AssignmentRead(id=a.id, course_id=a.course_id, created_at=a.created_at, num_questions=num))
    return out


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetailRead)
def get_assignment(assignment_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> AssignmentDetailRead:
    a = session.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    course = session.get(Course, a.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    qs = session.exec(select(AssignmentQuestion).where(AssignmentQuestion.assignment_id == a.id).order_by(AssignmentQuestion.order_index)).all()
    questions = [{"id": q.id, "order_index": q.order_index, "prompt": q.prompt} for q in qs]
    return AssignmentDetailRead(id=a.id, course_id=a.course_id, created_at=a.created_at, questions=questions)


@router.post("/assignments/{assignment_id}/submit")
def submit_assignment(assignment_id: int, answers: List[str], current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> dict:
    a = session.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    course = session.get(Course, a.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Assignment not found")

    qs = session.exec(select(AssignmentQuestion).where(AssignmentQuestion.assignment_id == a.id).order_by(AssignmentQuestion.order_index)).all()
    if len(answers) != len(qs):
        raise HTTPException(status_code=400, detail="Invalid number of answers")

    score = 0
    for idx, q in enumerate(qs):
        if q.expected_keyword and (q.expected_keyword in (answers[idx] or "").lower()):
            score += 1

    sub = AssignmentSubmission(assignment_id=a.id, user_id=current_user.id, score=score, total=len(qs))
    session.add(sub)
    session.commit()
    return {"score": score, "total": len(qs)}


@router.get("/assignments/{assignment_id}/submissions", response_model=List[AssignmentSubmissionRead])
def list_assignment_submissions(
    assignment_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[AssignmentSubmissionRead]:
    a = session.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found")
    course = session.get(Course, a.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    subs = session.exec(select(AssignmentSubmission).where(AssignmentSubmission.assignment_id == a.id).order_by(AssignmentSubmission.created_at.desc())).all()
    return [AssignmentSubmissionRead(id=s.id, created_at=s.created_at, score=s.score, total=s.total) for s in subs]
