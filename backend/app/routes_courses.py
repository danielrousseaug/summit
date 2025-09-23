from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
import os
from sqlmodel import Session, select, delete

from .auth import get_current_user
from .db import get_session
from .ai import generate_syllabus, should_use_ai, summarize_section, extract_toc_from_text
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


@router.post("/upload", response_model=CourseReadWithSyllabus, status_code=status.HTTP_201_CREATED)
async def upload_course(
    file: UploadFile = File(...),
    title: str = Form(...),
    topics: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CourseReadWithSyllabus:
    data = file.file.read()
    raw_text = data.decode("utf-8", errors="ignore") if file.content_type != "application/pdf" else ""
    if not raw_text.strip():
        # allow pdf-only uploads
        if not (file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf"))):
            raise HTTPException(status_code=400, detail="Empty or unreadable file")

    # Persist PDF to disk if provided
    pdf_path = None
    num_pages = None
    if file.content_type == "application/pdf" or (file.filename and file.filename.lower().endswith(".pdf")):
        storage_dir = os.getenv("PDF_STORAGE_DIR", "./storage/pdfs")
        os.makedirs(storage_dir, exist_ok=True)
        safe_name = f"u{current_user.id}_{title.replace(' ', '_')}_{file.filename}"
        pdf_path = os.path.join(storage_dir, safe_name)
        with open(pdf_path, "wb") as f:
            f.write(data)
        try:
            import fitz  # type: ignore
            with fitz.open(pdf_path) as doc:
                num_pages = doc.page_count
        except Exception:
            num_pages = None

    course = Course(user_id=current_user.id, title=title, source_filename=file.filename, pdf_path=pdf_path, num_pages=num_pages or None, topics=topics, raw_text=raw_text)
    session.add(course)
    session.commit()
    session.refresh(course)

    # Build syllabus (AI if enabled). For PDFs, prefer deriving titles from page samples.
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
    items = []
    if not raw_text and pdf_path and num_pages:
        # Extract a simple TOC-like list by sampling the first line of every N pages
        try:
            import fitz  # type: ignore
            with fitz.open(pdf_path) as doc:
                # Try TOC extraction by sending first ~30 pages of text
                pages_text = []
                for i in range(0, min(doc.page_count, 30)):
                    pages_text.append(doc[i].get_text())
                toc_candidates = extract_toc_from_text("\n".join(pages_text), max_items=12, use_ai=use_ai)
                logger.info("upload_course: TOC candidates count=%d", len(toc_candidates) if toc_candidates else 0)
                if toc_candidates:
                    for obj in toc_candidates[:8]:
                        title = str(obj.get("title", ""))[:120] or "Section"
                        # We could map page numbers later; for summary, use early page text chunk
                        idx = max(0, (obj.get("page") or 1) - 1)
                        sample_text = doc[idx].get_text() if 0 <= idx < doc.page_count else pages_text[0]
                        summary = summarize_section(title, sample_text[:2000], use_ai=use_ai)
                        items.append((title, summary))
                # If AI TOC not available, fall back to sampling evenly
                if not items:
                    logger.info("upload_course: AI TOC unavailable; falling back to page sampling")
                    step = max(1, doc.page_count // 8)
                    for i in range(0, doc.page_count, step):
                        page = doc[i]
                        text = page.get_text().strip()
                        first_line = text.splitlines()[0] if text else f"Section {i+1}"
                        title = first_line[:120]
                        summary = summarize_section(title, text[:2000], use_ai=use_ai)
                        items.append((title or f"Section {i+1}", summary))
                items = items[:8]
        except Exception:
            logger.warning("upload_course: PDF processing failed; will try text-based syllabus", exc_info=True)
            items = []
    if not items:
        logger.info("upload_course: generating syllabus from text (len=%d), use_ai=%s", len(raw_text), use_ai)
        items = generate_syllabus(raw_text, max_items=8, use_ai=use_ai, topics=topics or None)
    created_items: list[SyllabusItem] = []
    for idx, (it_title, it_summary) in enumerate(items):
        si = SyllabusItem(course_id=course.id, order_index=idx, title=it_title, summary=it_summary)
        session.add(si)
        created_items.append(si)
    session.commit()

    # Derive reading ranges across PDF pages if available (simple equal split)
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

    # Read back with ids
    data = [SyllabusItemRead(id=it.id, order_index=it.order_index, title=it.title, summary=it.summary) for it in created_items]
    return CourseReadWithSyllabus(id=course.id, title=course.title, source_filename=course.source_filename, num_pages=course.num_pages, topics=course.topics, created_at=course.created_at, syllabus=data)


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
    return CourseReadWithSyllabus(id=course.id, title=course.title, source_filename=course.source_filename, created_at=course.created_at, syllabus=items_read)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(course_id: int, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> None:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    # Delete dependent rows (no FKs with cascade configured in MVP)
    session.exec(delete(SyllabusCompletion).where(SyllabusCompletion.course_id == course_id))
    session.exec(delete(ScheduleItem).where(ScheduleItem.course_id == course_id))

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
