from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, delete

from .auth import get_current_user
from .db import get_session
from .models import Course, ProgressSummaryRead, SyllabusCompletion, SyllabusItem, User

router = APIRouter(prefix="/courses", tags=["progress"])


@router.get("/{course_id}/progress", response_model=ProgressSummaryRead)
def get_progress(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> ProgressSummaryRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id)).all()
    total = len(items)
    completed = session.exec(
        select(SyllabusCompletion.syllabus_item_id).where(
            (SyllabusCompletion.course_id == course_id) & (SyllabusCompletion.user_id == current_user.id)
        )
    ).all()
    completed_ids = [row for row in completed]
    return ProgressSummaryRead(total_items=total, completed_count=len(completed_ids), completed_item_ids=completed_ids)


@router.post("/{course_id}/progress/{syllabus_item_id}/toggle", response_model=ProgressSummaryRead)
def toggle_completion(
    course_id: int,
    syllabus_item_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ProgressSummaryRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    item = session.get(SyllabusItem, syllabus_item_id)
    if not item or item.course_id != course_id:
        raise HTTPException(status_code=404, detail="Syllabus item not found")

    existing = session.exec(
        select(SyllabusCompletion).where(
            (SyllabusCompletion.course_id == course_id)
            & (SyllabusCompletion.user_id == current_user.id)
            & (SyllabusCompletion.syllabus_item_id == syllabus_item_id)
        )
    ).first()
    if existing:
        session.exec(
            delete(SyllabusCompletion).where(
                (SyllabusCompletion.id == existing.id)
            )
        )
    else:
        session.add(SyllabusCompletion(user_id=current_user.id, course_id=course_id, syllabus_item_id=syllabus_item_id))
    session.commit()

    return get_progress(course_id, current_user, session)
