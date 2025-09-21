from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class NoteBase(SQLModel):
    """Fields shared by create, read, and update operations."""
    title: str
    content: str


class Note(NoteBase, table=True):
    """SQLModel table for persisted notes."""
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(SQLModel):
    email: str
    password: str


class UserRead(SQLModel):
    id: int
    email: str
    created_at: datetime


class NoteCreate(NoteBase):
    """Payload for creating a new note."""
    pass


class NoteRead(NoteBase):
    """Response model for reading a note."""
    id: int
    created_at: datetime
    updated_at: datetime


class NoteUpdate(SQLModel):
    """Payload for updating an existing note."""
    title: Optional[str] = None
    content: Optional[str] = None


# --- Course models ---

class Course(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    title: str
    source_filename: Optional[str] = None
    pdf_path: Optional[str] = None
    num_pages: Optional[int] = None
    topics: Optional[str] = None
    raw_text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="uploading")
    status_message: Optional[str] = None
    progress_percent: int = Field(default=0)


class CourseRead(SQLModel):
    id: int
    title: str
    source_filename: Optional[str] = None
    num_pages: Optional[int] = None
    topics: Optional[str] = None
    created_at: datetime
    status: str
    status_message: Optional[str] = None
    progress_percent: int


class Reading(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: Optional[int] = Field(default=None)
    order_index: int
    title: str
    start_page: int
    end_page: int


class ReadingRead(SQLModel):
    id: int
    syllabus_item_id: Optional[int] = None
    order_index: int
    title: str
    start_page: int
    end_page: int
