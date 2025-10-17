from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from contextlib import asynccontextmanager
import logging
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

import os
from .db import create_db_and_tables, get_session
from .models import Note, NoteCreate, NoteRead, NoteUpdate
from .routes_auth import router as auth_router
from .routes_courses import router as courses_router
from .routes_quizzes import router as quizzes_router
from .routes_progress import router as progress_router
from .routes_profile import router as profile_router
from .routes_assignments import router as assignments_router
from .routes_ai_tutor import router as ai_tutor_router
from .routes_flashcards import router as flashcards_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load environment variables from a .env file if present
    # Look for .env file in project root (one level up from backend dir)
    env_path = "../.env"
    print(f"DEBUG: Loading .env from: {os.path.abspath(env_path)}")
    print(f"DEBUG: .env exists: {os.path.exists(os.path.abspath(env_path))}")
    load_dotenv(env_path)
    print(f"DEBUG: AI_DEBUG_LOG = {os.getenv('AI_DEBUG_LOG')}")
    # Initialize logging for observability
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(level=log_level)
    logging.getLogger("summit").setLevel(log_level)
    # Optional AI debug file logging (prompts/responses). WARNING: may include sensitive content.
    if os.getenv("AI_DEBUG_LOG") == "1":
        log_dir = os.getenv("AI_LOG_DIR", "backend/logs")
        log_file = os.getenv("AI_LOG_FILE", os.path.join(log_dir, "ai_debug.log"))

        # Convert to absolute path if not already absolute
        if not os.path.isabs(log_dir):
            log_dir = os.path.join(os.getcwd(), log_dir)
        if not os.path.isabs(log_file):
            log_file = os.path.join(os.getcwd(), log_file)

        print(f"DEBUG: Setting up AI debug logging at: {log_file}")
        print(f"DEBUG: Current working directory: {os.getcwd()}")

        try:
            os.makedirs(log_dir, exist_ok=True)
            fh = logging.FileHandler(log_file)
            fh.setLevel(logging.DEBUG)
            fmt = logging.Formatter("%(asctime)s %(levelname)s:%(name)s:%(message)s")
            fh.setFormatter(fmt)
            # Attach to the summit namespace
            summit_logger = logging.getLogger("summit")
            summit_logger.addHandler(fh)
            # Also ensure child loggers inherit DEBUG level for detailed traces
            logging.getLogger("summit.ai").setLevel(logging.DEBUG)
            logging.getLogger("summit.courses").setLevel(logging.DEBUG)
            print(f"DEBUG: AI debug logging successfully configured")
            # Test log message
            logging.getLogger("summit.ai").debug("AI debug logging initialized successfully")
        except Exception as e:
            logging.getLogger("summit").warning("Failed to initialize AI debug file logging", exc_info=True)
            print(f"ERROR: Failed to initialize AI debug logging: {e}")
    # Initialize database tables on startup
    create_db_and_tables()
    yield


app = FastAPI(title="Summit API", version="0.1.0", lifespan=lifespan)

# Allow local Next.js dev origins
origins_env = os.getenv("CORS_ORIGINS")
origins = [o.strip() for o in origins_env.split(",") if o.strip()] if origins_env else [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(quizzes_router)
app.include_router(progress_router)
app.include_router(profile_router)
app.include_router(assignments_router)
app.include_router(ai_tutor_router)
app.include_router(flashcards_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/notes", response_model=List[NoteRead])
def list_notes(session: Session = Depends(get_session)) -> List[NoteRead]:
    notes = session.exec(select(Note).order_by(Note.created_at.desc())).all()
    return notes


@app.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, session: Session = Depends(get_session)) -> NoteRead:
    note = Note(**payload.model_dump())
    session.add(note)
    session.commit()
    session.refresh(note)
    return note


@app.get("/notes/{note_id}", response_model=NoteRead)
def get_note(note_id: int, session: Session = Depends(get_session)) -> NoteRead:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


@app.put("/notes/{note_id}", response_model=NoteRead)
def update_note(note_id: int, payload: NoteUpdate, session: Session = Depends(get_session)) -> NoteRead:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)
    note.updated_at = datetime.now(timezone.utc)

    session.add(note)
    session.commit()
    session.refresh(note)
    return note


@app.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, session: Session = Depends(get_session)) -> None:
    note = session.get(Note, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    session.delete(note)
    session.commit()
    return None
