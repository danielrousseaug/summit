from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
import os
from sqlmodel import Session, select, delete

from .auth import get_current_user
from .db import get_session
from .ai import generate_syllabus, should_use_ai, summarize_section, generate_intelligent_syllabus
import logging

logger = logging.getLogger("summit.courses")
from .models import (
    Course,
    CourseRead,
    CourseReadWithSyllabus,
    Reading,
    ReadingRead,
    ReadingProgress,
    SyllabusItem,
    SyllabusItemRead,
    User,
    Quiz,
    QuizQuestion,
    QuizSubmission,
    Assignment,
    AssignmentQuestion,
    AssignmentSubmission,
    ScheduleItem,
    SyllabusCompletion,
    PDFPage,
)

router = APIRouter(prefix="/courses", tags=["courses"])


def _extract_text_from_upload(file: UploadFile) -> str:
    # Support text/plain and application/pdf; fallback to utf-8 decode
    data = file.file.read()
    if file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf")):
        try:
            import fitz  # PyMuPDF

            text_parts: list[str] = []
            with fitz.open(stream=data, filetype="pdf") as doc:  # type: ignore[arg-type]
                for page in doc:
                    text_parts.append(page.get_text())
            return "\n".join(text_parts)
        except Exception:
            # fall back to bytes decode
            return data.decode("utf-8", errors="ignore")
    if file.content_type == "text/plain":
        return data.decode("utf-8", errors="ignore")
    return data.decode("utf-8", errors="ignore")


def _naive_syllabus_from_text(text: str, max_items: int = 8) -> list[tuple[str, str]]:
    # Split by lines, choose non-empty lines as potential titles
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return [("Introduction", "Overview of provided material.")]
    items: list[tuple[str, str]] = []
    step = max(1, len(lines) // max_items)
    for idx, i in enumerate(range(0, len(lines), step)):
        if idx >= max_items:
            break
        title = lines[i][:80]
        # Summary is next few lines joined
        summary = " ".join(lines[i + 1 : i + 1 + 3])[:200] or "Summary for this section."
        items.append((title or f"Module {idx+1}", summary))
    return items




@router.get("/", response_model=List[CourseRead])
def list_courses(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[CourseRead]:
    courses = session.exec(select(Course).where(Course.user_id == current_user.id).order_by(Course.created_at.desc())).all()
    return courses


@router.get("/{course_id}/status")
def get_course_status(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    return {
        "id": course.id,
        "title": course.title,
        "status": course.status,
        "status_message": course.status_message,
        "progress_percent": course.progress_percent
    }


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_course(
    file: UploadFile = File(...),
    title: str = Form(...),
    topics: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CourseReadWithSyllabus:
    # Extract text from upload
    raw_text = _extract_text_from_upload(file)
    if not raw_text.strip():
        # allow pdf-only uploads
        if not (file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf"))):
            raise HTTPException(status_code=400, detail="Empty or unreadable file")

    # Handle PDF storage if applicable
    pdf_path = None
    num_pages = None
    if file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf")):
        storage_dir = os.getenv("PDF_STORAGE_DIR", "./storage/pdfs")
        os.makedirs(storage_dir, exist_ok=True)
        safe_name = f"u{current_user.id}_{title.replace(' ', '_')}_{file.filename}"
        pdf_path = os.path.join(storage_dir, safe_name)
        # Reset file position
        file.file.seek(0)
        data = file.file.read()
        with open(pdf_path, "wb") as f:
            f.write(data)
        try:
            import fitz  # type: ignore
            with fitz.open(pdf_path) as doc:
                num_pages = doc.page_count
        except Exception:
            num_pages = None

    # Create course with initial status
    course = Course(
        user_id=current_user.id,
        title=title,
        source_filename=file.filename,
        pdf_path=pdf_path,
        num_pages=num_pages or None,
        topics=topics,
        raw_text=raw_text,
        status="uploading",
        status_message=f"Uploaded {file.filename}" if file.filename else "Uploaded file",
        progress_percent=10
    )
    session.add(course)
    session.commit()
    session.refresh(course)

    # Helper function to update status
    def update_status(status: str, message: str, percent: int):
        course.status = status
        course.status_message = message
        course.progress_percent = percent
        session.add(course)
        session.commit()

    # Extract and store PDF page content for quick access
    if pdf_path and num_pages:
        update_status("extracting_pages", f"Extracting content from {num_pages} pages", 20)
        try:
            import fitz  # type: ignore
            with fitz.open(pdf_path) as doc:
                for page_num in range(doc.page_count):
                    page_content = doc[page_num].get_text()
                    pdf_page = PDFPage(
                        course_id=course.id,
                        page_number=page_num + 1,  # 1-indexed for user convenience
                        content=page_content
                    )
                    session.add(pdf_page)
                session.commit()
                logger.info("Extracted and stored %d PDF pages for course %d", doc.page_count, course.id)
        except Exception as e:
            logger.warning("Failed to extract PDF pages: %s", e, exc_info=True)

    # Build syllabus using NEW intelligent AI-driven approach
    use_ai = should_use_ai()
    logger.info(
        "upload_course: user_id=%s, title=%r, content_type=%r, pdf_path=%r, num_pages=%r, use_ai=%s",
        current_user.id,
        title,
        file.content_type,
        pdf_path,
        num_pages,
        use_ai,
    )

    # For PDFs, use the new intelligent syllabus generation
    if pdf_path and num_pages:
        logger.info("upload_course: using intelligent AI syllabus generation for %d pages", num_pages)

        update_status("extracting_toc", "Extracting table of contents", 30)

        # Create debug log path
        from datetime import datetime
        debug_log_dir = os.getenv("DEBUG_LOG_DIR", "./storage/syllabus_logs")
        os.makedirs(debug_log_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_title = "".join(c if c.isalnum() or c in (' ', '_') else '_' for c in title)[:50]
        debug_log_path = os.path.join(debug_log_dir, f"{timestamp}_{safe_title}.log")

        update_status("extracting_headers", "Analyzing document structure", 40)

        update_status("ai_processing", "Generating syllabus with AI", 50)

        # Returns list of dicts with: {title, summary, start_page, end_page}
        syllabus_data = await generate_intelligent_syllabus(pdf_path, num_pages, use_ai=use_ai, debug_log_path=debug_log_path)

        logger.info(f"Syllabus generation debug log saved to: {debug_log_path}")

        created_items: list[SyllabusItem] = []
        readings_created: list[Reading] = []

        for idx, item_data in enumerate(syllabus_data):
            # Create syllabus item
            si = SyllabusItem(
                course_id=course.id,
                order_index=idx,
                title=item_data["title"],
                summary=item_data["summary"]
            )
            session.add(si)
            created_items.append(si)

        session.commit()  # Commit to get syllabus item IDs

        update_status("creating_readings", f"Creating {len(syllabus_data)} reading sections", 80)

        # Now create readings with the page ranges from AI
        for idx, item_data in enumerate(syllabus_data):
            si = created_items[idx]
            r = Reading(
                course_id=course.id,
                syllabus_item_id=si.id,
                order_index=si.order_index,
                title=si.title,
                start_page=item_data["start_page"],
                end_page=item_data["end_page"]
            )
            session.add(r)
            readings_created.append(r)

        session.commit()

        update_status("complete", f"Course ready with {len(created_items)} chapters", 100)

    # For text files, use old text-based generation (fallback)
    else:
        update_status("ai_processing", "Generating syllabus from text", 50)
        logger.info("upload_course: generating syllabus from text (len=%d), use_ai=%s", len(raw_text), use_ai)
        items = generate_syllabus(raw_text, max_items=12, use_ai=use_ai, topics=topics or None)
        created_items: list[SyllabusItem] = []
        for idx, (it_title, it_summary) in enumerate(items):
            si = SyllabusItem(course_id=course.id, order_index=idx, title=it_title, summary=it_summary)
            session.add(si)
            created_items.append(si)
        session.commit()

        update_status("creating_readings", f"Creating {len(items)} reading sections", 80)

        # Simple equal page split for text files
        readings_created: list[Reading] = []
        if num_pages and num_pages > 0 and created_items:
            pages_per = max(1, num_pages // max(1, len(created_items)))
            start = 1
            for idx, si in enumerate(created_items):
                end = num_pages if idx == len(created_items) - 1 else min(num_pages, start + pages_per - 1)
                r = Reading(course_id=course.id, syllabus_item_id=si.id, order_index=si.order_index, title=si.title, start_page=start, end_page=end)
                session.add(r)
                readings_created.append(r)
                start = end + 1
            session.commit()

        update_status("complete", f"Course ready with {len(created_items)} chapters", 100)

    # Read back with ids
    data = [SyllabusItemRead(id=it.id, order_index=it.order_index, title=it.title, summary=it.summary) for it in created_items]
    return CourseReadWithSyllabus(
        id=course.id,
        title=course.title,
        source_filename=course.source_filename,
        num_pages=course.num_pages,
        topics=course.topics,
        created_at=course.created_at,
        status=course.status,
        status_message=course.status_message,
        progress_percent=course.progress_percent,
        syllabus=data
    )


@router.get("/{course_id}/readings", response_model=list[ReadingRead])
def list_readings(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> list[ReadingRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    readings = session.exec(select(Reading).where(Reading.course_id == course_id).order_by(Reading.order_index)).all()
    return [ReadingRead(id=r.id, syllabus_item_id=r.syllabus_item_id, order_index=r.order_index, title=r.title, start_page=r.start_page, end_page=r.end_page) for r in readings]


@router.get("/{course_id}/pdf")
def get_pdf(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id or not course.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not found")
    from fastapi.responses import FileResponse
    # Serve inline so browsers can render in-embed viewers instead of force download
    resp = FileResponse(course.pdf_path, media_type="application/pdf")
    resp.headers["Content-Disposition"] = f"inline; filename=\"{os.path.basename(course.pdf_path)}\""
    return resp


@router.get("/readings/{reading_id}/progress")
def get_reading_progress(reading_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    reading = session.get(Reading, reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    course = session.get(Course, reading.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reading not found")
    prog = session.exec(select(ReadingProgress).where((ReadingProgress.reading_id == reading_id) & (ReadingProgress.user_id == current_user.id))).first()
    last_page = prog.last_page if prog else reading.start_page
    return {"last_page": last_page, "start_page": reading.start_page, "end_page": reading.end_page}


@router.post("/readings/{reading_id}/progress")
def set_reading_progress(reading_id: int, payload: dict, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    reading = session.get(Reading, reading_id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    course = session.get(Course, reading.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reading not found")
    try:
        last_page = int(payload.get("last_page"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid last_page")
    # clamp within range
    if last_page < reading.start_page:
        last_page = reading.start_page
    if last_page > reading.end_page:
        last_page = reading.end_page
    prog = session.exec(select(ReadingProgress).where((ReadingProgress.reading_id == reading_id) & (ReadingProgress.user_id == current_user.id))).first()
    if prog:
        prog.last_page = last_page
        session.add(prog)
    else:
        session.add(ReadingProgress(reading_id=reading_id, user_id=current_user.id, last_page=last_page))
    session.commit()
    return {"ok": True, "last_page": last_page}


@router.get("/{course_id}", response_model=CourseReadWithSyllabus)
async def get_course(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CourseReadWithSyllabus:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")
    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course.id).order_by(SyllabusItem.order_index)).all()
    items_read = [SyllabusItemRead(id=it.id, order_index=it.order_index, title=it.title, summary=it.summary) for it in items]
    return CourseReadWithSyllabus(
        id=course.id,
        title=course.title,
        source_filename=course.source_filename,
        num_pages=course.num_pages,
        topics=course.topics,
        created_at=course.created_at,
        status=course.status,
        status_message=course.status_message,
        progress_percent=course.progress_percent,
        syllabus=items_read
    )


@router.put("/{course_id}", response_model=CourseRead)
async def update_course(course_id: int, payload: dict, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> CourseRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    # Only support updating the title for now
    if "title" in payload:
        course.title = payload["title"]
        session.add(course)
        session.commit()
        session.refresh(course)

    return CourseRead(
        id=course.id,
        title=course.title,
        source_filename=course.source_filename,
        num_pages=course.num_pages,
        topics=course.topics,
        created_at=course.created_at,
        status=course.status,
        status_message=course.status_message,
        progress_percent=course.progress_percent
    )


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> None:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    # Delete dependent rows (no FKs with cascade configured in MVP)
    session.exec(delete(SyllabusCompletion).where(SyllabusCompletion.course_id == course_id))
    session.exec(delete(ScheduleItem).where(ScheduleItem.course_id == course_id))

    # Delete readings and reading progress
    reading_ids = [rid for rid in session.exec(select(Reading.id).where(Reading.course_id == course_id)).all()]
    if reading_ids:
        session.exec(delete(ReadingProgress).where(ReadingProgress.reading_id.in_(reading_ids)))
    session.exec(delete(Reading).where(Reading.course_id == course_id))

    # Delete PDF pages
    session.exec(delete(PDFPage).where(PDFPage.course_id == course_id))

    # Quizzes and related
    quiz_ids = [qid for qid in session.exec(select(Quiz.id).where(Quiz.course_id == course_id)).all()]
    if quiz_ids:
        session.exec(delete(QuizSubmission).where(QuizSubmission.quiz_id.in_(quiz_ids)))
        session.exec(delete(QuizQuestion).where(QuizQuestion.quiz_id.in_(quiz_ids)))
        session.exec(delete(Quiz).where(Quiz.id.in_(quiz_ids)))

    # Assignments and related
    assn_ids = [aid for aid in session.exec(select(Assignment.id).where(Assignment.course_id == course_id)).all()]
    if assn_ids:
        session.exec(delete(AssignmentSubmission).where(AssignmentSubmission.assignment_id.in_(assn_ids)))
        session.exec(delete(AssignmentQuestion).where(AssignmentQuestion.assignment_id.in_(assn_ids)))
        session.exec(delete(Assignment).where(Assignment.id.in_(assn_ids)))

    # Syllabus items
    session.exec(delete(SyllabusItem).where(SyllabusItem.course_id == course_id))

    # Finally the course
    session.exec(delete(Course).where(Course.id == course_id))
    session.commit()
    return None
