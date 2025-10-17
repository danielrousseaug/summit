from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional, List

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

    # Relationship fields are omitted in MVP to simplify mapping


class UserCreate(SQLModel):
    email: str
    password: str


class UserRead(SQLModel):
    id: int
    email: str
    created_at: datetime


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

    # Progress tracking
    status: str = Field(default="uploading")  # uploading, extracting_toc, extracting_headers, ai_processing, creating_readings, complete, error
    status_message: Optional[str] = None
    progress_percent: int = Field(default=0)

    # Relationship fields are omitted in MVP to simplify mapping


class SyllabusItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    order_index: int
    title: str
    summary: str
    start_page: Optional[int] = None
    end_page: Optional[int] = None
    content: Optional[str] = None  # Full PDF content for this section

    # Relationship fields are omitted in MVP to simplify mapping


class PDFPage(SQLModel, table=True):
    """Stores extracted text content for each page of a PDF"""
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    page_number: int
    content: str

    # Relationship fields are omitted in MVP to simplify mapping


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


class SyllabusItemRead(SQLModel):
    id: int
    order_index: int
    title: str
    summary: str


class CourseReadWithSyllabus(CourseRead):
    syllabus: List[SyllabusItemRead]


class Reading(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: Optional[int] = Field(default=None, foreign_key="syllabusitem.id")
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


class ReadingProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reading_id: int = Field(foreign_key="reading.id")
    user_id: int = Field(foreign_key="user.id")
    last_page: int
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


# --- Quiz models ---

class Quiz(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: Optional[int] = Field(default=None, foreign_key="syllabusitem.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class QuizQuestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quiz.id")
    order_index: int
    prompt: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    answer_index: int  # 0..3 indicating the correct option


class QuizRead(SQLModel):
    id: int
    course_id: int
    syllabus_item_id: Optional[int] = None
    syllabus_item_title: Optional[str] = None
    created_at: datetime
    num_questions: int


class QuizQuestionRead(SQLModel):
    id: int
    order_index: int
    prompt: str
    options: List[str]


class QuizDetailRead(SQLModel):
    id: int
    course_id: int
    syllabus_item_id: Optional[int] = None
    syllabus_item_title: Optional[str] = None
    created_at: datetime
    questions: List[QuizQuestionRead]


class QuizSubmission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    quiz_id: int = Field(foreign_key="quiz.id")
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    score: int
    total: int


class QuizSubmissionRead(SQLModel):
    id: int
    created_at: datetime
    score: int
    total: int


# --- Progress tracking ---

class SyllabusCompletion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: int = Field(foreign_key="syllabusitem.id")
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProgressSummaryRead(SQLModel):
    total_items: int
    completed_count: int
    completed_item_ids: List[int]


# --- User profile & schedule ---

class UserProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    weekly_hours: int = 5
    duration_weeks: int = 4
    depth: str = "overview"


class UserProfileRead(SQLModel):
    weekly_hours: int
    duration_weeks: int
    depth: str


class UserProfileUpdate(SQLModel):
    weekly_hours: Optional[int] = None
    duration_weeks: Optional[int] = None
    depth: Optional[str] = None


class ScheduleItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: int = Field(foreign_key="syllabusitem.id")
    week_index: int
    due_date: date


class ScheduleItemRead(SQLModel):
    syllabus_item_id: int
    title: str
    week_index: int
    due_date: date


# --- Assignments ---

class Assignment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AssignmentQuestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id")
    order_index: int
    prompt: str
    expected_keyword: str


class AssignmentRead(SQLModel):
    id: int
    course_id: int
    created_at: datetime
    num_questions: int


class AssignmentDetailRead(SQLModel):
    id: int
    course_id: int
    created_at: datetime
    questions: List[dict]


class AssignmentSubmission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    assignment_id: int = Field(foreign_key="assignment.id")
    user_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    score: int
    total: int


class AssignmentSubmissionRead(SQLModel):
    id: int
    created_at: datetime
    score: int
    total: int


# --- Flashcards ---

class Flashcard(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="course.id")
    syllabus_item_id: Optional[int] = Field(default=None, foreign_key="syllabusitem.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FlashcardItem(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    flashcard_id: int = Field(foreign_key="flashcard.id")
    order_index: int
    front: str
    back: str
    card_type: str  # "qa" or "term_definition"


class FlashcardRead(SQLModel):
    id: int
    course_id: int
    syllabus_item_id: Optional[int] = None
    syllabus_item_title: Optional[str] = None
    created_at: datetime
    num_cards: int


class FlashcardItemRead(SQLModel):
    id: int
    order_index: int
    front: str
    back: str
    card_type: str


class FlashcardDetailRead(SQLModel):
    id: int
    course_id: int
    syllabus_item_id: Optional[int] = None
    syllabus_item_title: Optional[str] = None
    created_at: datetime
    cards: List[FlashcardItemRead]
