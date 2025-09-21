from __future__ import annotations

from datetime import date, timedelta
import math
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, delete

from .auth import get_current_user
from .db import get_session
from .models import (
    Course,
    ScheduleItem,
    ScheduleItemRead,
    SyllabusItem,
    User,
    UserProfile,
    UserProfileRead,
    UserProfileUpdate,
)

router = APIRouter(prefix="/profile", tags=["profile"]) 


@router.get("/me", response_model=UserProfileRead)
def get_profile(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> UserProfileRead:
    prof = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    if not prof:
        prof = UserProfile(user_id=current_user.id)
        session.add(prof)
        session.commit()
        session.refresh(prof)
    return UserProfileRead(weekly_hours=prof.weekly_hours, duration_weeks=prof.duration_weeks, depth=prof.depth)


@router.put("/me", response_model=UserProfileRead)
def update_profile(payload: UserProfileUpdate, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> UserProfileRead:
    prof = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    if not prof:
        prof = UserProfile(user_id=current_user.id)
    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(prof, k, v)
    session.add(prof)
    session.commit()
    session.refresh(prof)
    return UserProfileRead(weekly_hours=prof.weekly_hours, duration_weeks=prof.duration_weeks, depth=prof.depth)


@router.post("/courses/{course_id}/schedule", response_model=List[ScheduleItemRead])
def generate_schedule(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> List[ScheduleItemRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id).order_by(SyllabusItem.order_index)).all()
    if not items:
        return []

    # Clear existing schedule
    session.exec(delete(ScheduleItem).where(ScheduleItem.course_id == course_id))

    prof = session.exec(select(UserProfile).where(UserProfile.user_id == current_user.id)).first()
    if not prof:
        prof = UserProfile(user_id=current_user.id)
        session.add(prof)
        session.commit()
        session.refresh(prof)

    # naive: distribute items across duration_weeks using ceiling to avoid overflow weeks
    per_week = max(1, math.ceil(len(items) / max(1, prof.duration_weeks)))
    schedule_reads: list[ScheduleItemRead] = []
    today = date.today()
    week = 0
    count_in_week = 0
    for it in items:
        if count_in_week >= per_week:
            week += 1
            count_in_week = 0
        due = today + timedelta(days=7 * week + 6)  # due at end of week
        sch = ScheduleItem(course_id=course_id, syllabus_item_id=it.id, week_index=week, due_date=due)
        session.add(sch)
        schedule_reads.append(ScheduleItemRead(syllabus_item_id=it.id, title=it.title, week_index=week, due_date=due))
        count_in_week += 1

    session.commit()
    return schedule_reads


@router.get("/courses/{course_id}/schedule", response_model=List[ScheduleItemRead])
def list_schedule(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> List[ScheduleItemRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    sched = session.exec(select(ScheduleItem).where(ScheduleItem.course_id == course_id).order_by(ScheduleItem.week_index, ScheduleItem.id)).all()
    reads: list[ScheduleItemRead] = []
    for si in sched:
        it = session.get(SyllabusItem, si.syllabus_item_id)
        title = it.title if it else "Lesson"
        reads.append(ScheduleItemRead(syllabus_item_id=si.syllabus_item_id, title=title, week_index=si.week_index, due_date=si.due_date))
    return reads
