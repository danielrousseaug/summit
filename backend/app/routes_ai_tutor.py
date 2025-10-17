from __future__ import annotations

from typing import List, Dict, Any, Optional
import logging
import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from .auth import get_current_user
from .db import get_session
from .models import User, Course, PDFPage
from .ai import should_use_ai

logger = logging.getLogger("summit.ai_tutor")

router = APIRouter(prefix="/courses", tags=["ai-tutor"])


class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: Optional[datetime] = None
    pageContext: Optional[int] = None


class AITutorRequest(BaseModel):
    message: str
    page_number: int
    conversation_history: Optional[List[ChatMessage]] = []


class AITutorResponse(BaseModel):
    response: str


def _extract_page_content_from_pdf(course_id: int, page_number: int, session: Session) -> str:
    """Extract content from stored PDF pages in database."""

    # Get course to verify it exists
    course = session.get(Course, course_id)
    if not course:
        return "Course content not available."

    try:
        # Get the current page content from database
        current_page = session.exec(
            select(PDFPage).where(
                (PDFPage.course_id == course_id) &
                (PDFPage.page_number == page_number)
            )
        ).first()

        if not current_page:
            logger.warning(f"No stored content for course {course_id}, page {page_number}")
            return _extract_page_content(course.raw_text or "", page_number)

        content_parts = []

        # Get previous page for context (if exists)
        if page_number > 1:
            prev_page = session.exec(
                select(PDFPage).where(
                    (PDFPage.course_id == course_id) &
                    (PDFPage.page_number == page_number - 1)
                )
            ).first()
            if prev_page:
                prev_text = prev_page.content
                if len(prev_text) > 500:  # Limit previous page content
                    prev_text = "..." + prev_text[-500:]
                content_parts.append(f"[Context from page {page_number - 1}]\n{prev_text}\n")

        # Add current page
        content_parts.append(f"[Current page {page_number}]\n{current_page.content}\n")

        # Get next page for context (if exists)
        next_page = session.exec(
            select(PDFPage).where(
                (PDFPage.course_id == course_id) &
                (PDFPage.page_number == page_number + 1)
            )
        ).first()
        if next_page:
            next_text = next_page.content
            if len(next_text) > 500:  # Limit next page content
                next_text = next_text[:500] + "..."
            content_parts.append(f"[Context from page {page_number + 1}]\n{next_text}")

        page_content = "\n".join(content_parts)

        # Limit total content length for API efficiency
        if len(page_content) > 6000:
            page_content = page_content[:6000] + "..."

        return page_content

    except Exception as e:
        logger.warning(f"Failed to extract PDF content from database: {e}")
        # Fallback to text-based extraction
        return _extract_page_content(course.raw_text or "", page_number)


def _extract_page_content(course_text: str, page_number: int, context_pages: int = 1) -> str:
    """Extract content around the specified page from course text.
    This is a fallback when PDF extraction is not available."""

    # Split text into approximate pages (this is a rough estimation)
    lines = course_text.split('\n')
    lines_per_page = max(50, len(lines) // 100)  # Rough estimation

    start_line = max(0, (page_number - 1 - context_pages) * lines_per_page)
    end_line = min(len(lines), (page_number + context_pages) * lines_per_page)

    page_content = '\n'.join(lines[start_line:end_line])

    # Limit content length for API efficiency
    if len(page_content) > 4000:
        page_content = page_content[:4000] + "..."

    return page_content


def _generate_ai_response_stream(message: str, page_content: str, page_number: int,
                                 conversation_history: List[ChatMessage]):
    """Generate streaming AI tutor response using OpenAI API."""

    if not should_use_ai():
        yield "data: I'm sorry, the AI tutoring feature is currently unavailable. Please try again later.\n\n"
        return

    try:
        import openai
        client = openai.OpenAI()

        # Build conversation context
        system_prompt = f"""You are a helpful AI tutor assisting a student with their course material.

The student is currently reading page {page_number} of their course material. Here's the content from around that page:

---
{page_content}
---

Your role is to:
1. Answer questions about the content clearly and helpfully
2. Provide explanations and context when needed
3. Suggest study strategies and tips
4. Help the student understand complex concepts
5. Keep responses concise but thorough

Always be encouraging and educational. If you're not sure about something specific to their course material, acknowledge that and focus on general principles that might help."""

        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        for msg in conversation_history[-6:]:  # Last 6 messages for context
            messages.append({
                "role": msg.role,
                "content": msg.content
            })

        # Add current message
        messages.append({"role": "user", "content": message})

        stream = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=800,
            temperature=0.7,
            stream=True
        )

        for chunk in stream:
            if chunk.choices[0].delta.content:
                # Server-sent events format
                yield f"data: {chunk.choices[0].delta.content}\n\n"

        # Send done signal
        yield "data: [DONE]\n\n"

    except ImportError:
        logger.error("OpenAI library not available")
        yield "data: AI tutoring requires the OpenAI library. Please contact support.\n\n"
    except Exception as e:
        logger.error("AI tutor error: %s", e)
        yield f"data: I'm sorry, I'm having trouble processing your question right now. Please try again in a moment.\n\n"


def _generate_ai_response(message: str, page_content: str, page_number: int,
                          conversation_history: List[ChatMessage]) -> str:
    """Generate non-streaming AI tutor response using OpenAI API."""

    if not should_use_ai():
        return "I'm sorry, the AI tutoring feature is currently unavailable. Please try again later."

    try:
        import openai
        client = openai.OpenAI()

        # Build conversation context
        system_prompt = f"""You are a helpful AI tutor assisting a student with their course material.

The student is currently reading page {page_number} of their course material. Here's the content from around that page:

---
{page_content}
---

Your role is to:
1. Answer questions about the content clearly and helpfully
2. Provide explanations and context when needed
3. Suggest study strategies and tips
4. Help the student understand complex concepts
5. Keep responses concise but thorough (2-4 sentences usually)

Always be encouraging and educational. If you're not sure about something specific to their course material, acknowledge that and focus on general principles that might help."""

        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history
        for msg in conversation_history[-6:]:  # Last 6 messages for context
            messages.append({
                "role": msg.role,
                "content": msg.content
            })

        # Add current message
        messages.append({"role": "user", "content": message})

        response = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=messages,
            max_tokens=800,
            temperature=0.7
        )

        return response.choices[0].message.content or "I couldn't generate a response. Please try again."

    except ImportError:
        logger.error("OpenAI library not available")
        return "AI tutoring requires the OpenAI library. Please contact support."
    except Exception as e:
        logger.error("AI tutor error: %s", e)
        return "I'm sorry, I'm having trouble processing your question right now. Please try again in a moment."


@router.post("/{course_id}/ai-tutor", response_model=AITutorResponse)
async def ai_tutor_chat(
    course_id: int,
    request: AITutorRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
) -> AITutorResponse:
    """AI tutor chat endpoint that provides contextual help based on the current PDF page."""

    # Get the course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    # Verify user owns the course
    if course.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Extract relevant page content from stored PDF pages
    page_content = _extract_page_content_from_pdf(course_id, request.page_number, session)

    logger.info(
        "AI tutor request: user_id=%s, course_id=%s, page=%s, message_length=%s",
        current_user.id, course_id, request.page_number, len(request.message)
    )

    # Generate AI response
    response_text = _generate_ai_response(
        message=request.message,
        page_content=page_content,
        page_number=request.page_number,
        conversation_history=request.conversation_history or []
    )

    return AITutorResponse(response=response_text)


@router.post("/{course_id}/ai-tutor/stream")
async def ai_tutor_chat_stream(
    course_id: int,
    request: AITutorRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """AI tutor streaming chat endpoint that provides contextual help based on the current PDF page."""

    # Get the course
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    # Verify user owns the course
    if course.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Extract relevant page content from stored PDF pages
    page_content = _extract_page_content_from_pdf(course_id, request.page_number, session)

    logger.info(
        "AI tutor stream request: user_id=%s, course_id=%s, page=%s, message_length=%s",
        current_user.id, course_id, request.page_number, len(request.message)
    )

    # Return streaming response
    return StreamingResponse(
        _generate_ai_response_stream(
            message=request.message,
            page_content=page_content,
            page_number=request.page_number,
            conversation_history=request.conversation_history or []
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )