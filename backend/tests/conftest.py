from __future__ import annotations

from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.main import app
from app.db import get_session


@pytest.fixture(scope="session")
def tmp_db_path(tmp_path_factory: pytest.TempPathFactory) -> Path:
    return tmp_path_factory.mktemp("data") / "test.db"


@pytest.fixture(scope="session")
def test_engine(tmp_db_path: Path):
    engine = create_engine(f"sqlite:///{tmp_db_path}", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture()
def client(test_engine) -> Iterator[TestClient]:
    def override_get_session() -> Iterator[Session]:
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
