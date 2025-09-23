from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

# SQLite database in the project directory for simplicity
SQLITE_URL = "sqlite:///./notes.db"

# check_same_thread=False allows using the same connection across threads (needed for TestClient)
engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})


def create_db_and_tables() -> None:
    """Create database tables if they don't exist."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency that yields a database session."""
    with Session(engine) as session:
        yield session
