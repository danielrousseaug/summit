from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from .auth import get_current_user
from .db import get_session
import logging
from .ai import generate_flashcards_from_content, should_use_ai

logger = logging.getLogger("summit.flashcards")
from .models import (
    Course,
    Flashcard,
    FlashcardDetailRead,
    FlashcardItem,
    FlashcardItemRead,
    FlashcardRead,
    SyllabusItem,
    Reading,
    User,
    PDFPage,
)

router = APIRouter(prefix="/courses", tags=["flashcards"])


class FlashcardGenerateRequest(BaseModel):
    syllabus_item_id: Optional[int] = None


@router.post("/{course_id}/flashcards/generate", response_model=FlashcardRead, status_code=status.HTTP_201_CREATED)
def generate_flashcard_set(
    course_id: int,
    request: FlashcardGenerateRequest = FlashcardGenerateRequest(),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FlashcardRead:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    items = session.exec(select(SyllabusItem).where(SyllabusItem.course_id == course_id).order_by(SyllabusItem.order_index)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Course has no syllabus items")

    target_item = None
    syllabus_item_id = request.syllabus_item_id

    if syllabus_item_id:
        # Generate flashcards for specific syllabus item
        target_item = session.get(SyllabusItem, syllabus_item_id)
        if not target_item or target_item.course_id != course_id:
            raise HTTPException(status_code=404, detail="Syllabus item not found")

        # Check if flashcard set already exists for this item
        existing_flashcard = session.exec(
            select(Flashcard).where(Flashcard.course_id == course_id, Flashcard.syllabus_item_id == syllabus_item_id)
        ).first()
        if existing_flashcard:
            raise HTTPException(status_code=400, detail="Flashcard set already exists for this syllabus item")
    else:
        # Find the first syllabus item that doesn't have flashcards yet (legacy behavior)
        existing_flashcards = session.exec(
            select(Flashcard.syllabus_item_id).where(Flashcard.course_id == course_id, Flashcard.syllabus_item_id.isnot(None))
        ).all()
        existing_ids = set(existing_flashcards)

        for item in items:
            if item.id not in existing_ids:
                target_item = item
                break

        if not target_item:
            raise HTTPException(status_code=400, detail="All syllabus items already have flashcard sets")

    flashcard = Flashcard(course_id=course_id, syllabus_item_id=target_item.id)
    session.add(flashcard)
    session.commit()
    session.refresh(flashcard)

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

    # Generate flashcards using content
    use_ai = should_use_ai()
    if section_content:
        cards = generate_flashcards_from_content(
            target_item.title,
            section_content,
            num_cards=12,
            use_ai=use_ai
        )
    else:
        # Fallback to title-based generation
        cards = generate_flashcards_from_content(
            target_item.title,
            target_item.summary or target_item.title,
            num_cards=12,
            use_ai=use_ai
        )

    num_cards = len(cards)
    for idx, card in enumerate(cards):
        front = card["front"]
        back = card["back"]
        card_type = card.get("card_type", "qa")

        fc = FlashcardItem(
            flashcard_id=flashcard.id,
            order_index=idx,
            front=front,
            back=back,
            card_type=card_type,
        )
        session.add(fc)
    session.commit()

    return FlashcardRead(
        id=flashcard.id,
        course_id=flashcard.course_id,
        syllabus_item_id=target_item.id,
        syllabus_item_title=target_item.title,
        created_at=flashcard.created_at,
        num_cards=num_cards
    )


@router.get("/{course_id}/flashcards", response_model=List[FlashcardRead])
def list_flashcards(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[FlashcardRead]:
    course = session.get(Course, course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    flashcards = session.exec(
        select(Flashcard).where(Flashcard.course_id == course_id).order_by(Flashcard.created_at.desc())
    ).all()

    reads: List[FlashcardRead] = []
    for fc in flashcards:
        card_count = len(session.exec(select(FlashcardItem).where(FlashcardItem.flashcard_id == fc.id)).all())
        syllabus_item = None
        syllabus_item_title = None
        if fc.syllabus_item_id:
            syllabus_item = session.get(SyllabusItem, fc.syllabus_item_id)
            if syllabus_item:
                syllabus_item_title = syllabus_item.title
        reads.append(FlashcardRead(
            id=fc.id,
            course_id=fc.course_id,
            syllabus_item_id=fc.syllabus_item_id,
            syllabus_item_title=syllabus_item_title,
            created_at=fc.created_at,
            num_cards=card_count
        ))
    return reads


@router.get("/flashcards/{flashcard_id}", response_model=FlashcardDetailRead)
def get_flashcard_set(
    flashcard_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FlashcardDetailRead:
    flashcard = session.get(Flashcard, flashcard_id)
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    course = session.get(Course, flashcard.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    cards = session.exec(
        select(FlashcardItem).where(FlashcardItem.flashcard_id == flashcard.id).order_by(FlashcardItem.order_index)
    ).all()

    card_reads = [
        FlashcardItemRead(
            id=card.id,
            order_index=card.order_index,
            front=card.front,
            back=card.back,
            card_type=card.card_type,
        )
        for card in cards
    ]

    syllabus_item_title = None
    if flashcard.syllabus_item_id:
        syllabus_item = session.get(SyllabusItem, flashcard.syllabus_item_id)
        if syllabus_item:
            syllabus_item_title = syllabus_item.title

    return FlashcardDetailRead(
        id=flashcard.id,
        course_id=flashcard.course_id,
        syllabus_item_id=flashcard.syllabus_item_id,
        syllabus_item_title=syllabus_item_title,
        created_at=flashcard.created_at,
        cards=card_reads
    )


@router.delete("/flashcards/{flashcard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flashcard_set(
    flashcard_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    flashcard = session.get(Flashcard, flashcard_id)
    if not flashcard:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    course = session.get(Course, flashcard.course_id)
    if not course or course.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Flashcard set not found")

    # Delete all flashcard items first
    cards = session.exec(select(FlashcardItem).where(FlashcardItem.flashcard_id == flashcard.id)).all()
    for card in cards:
        session.delete(card)

    # Delete the flashcard set
    session.delete(flashcard)
    session.commit()

    return None
