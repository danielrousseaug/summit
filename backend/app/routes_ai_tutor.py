from __future__ import annotations

from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from pydantic import BaseModel

from .auth import get_current_user
from .db import get_session
from .models import User, Course
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


def _extract_page_content(course_text: str, page_number: int, context_pages: int = 1) -> str:
    """Extract content around the specified page from course text.
    This is a simplified implementation - in production you might want
    to use proper PDF page extraction."""

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


def _generate_ai_response(message: str, page_content: str, page_number: int,
                         conversation_history: List[ChatMessage]) -> str:
    """Generate AI tutor response using OpenAI API."""

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

        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=500,
            temperature=0.7
        )

        return response.choices[0].message.content or "I apologize, but I couldn't generate a response. Please try asking in a different way."

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

    # Extract relevant page content
    page_content = _extract_page_content(course.raw_text, request.page_number)

    logger.info(
        "AI tutor request: user_id=%s, course_id=%s, page=%s, message_length=%s",
        current_user.id, course_id, request.page_number, len(request.message)
    )

    # Generate AI response
    ai_response = _generate_ai_response(
        message=request.message,
        page_content=page_content,
        page_number=request.page_number,
        conversation_history=request.conversation_history or []
    )

    return AITutorResponse(response=ai_response)