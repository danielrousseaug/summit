from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "u@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "u@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_upload_and_get_course(client: TestClient) -> None:
    headers = auth_headers(client)
    content = b"Chapter 1: Intro to Sets\nSets, subsets, unions.\n\nChapter 2: Functions\nDefinitions and examples.\n"
    files = {
        "file": ("notes.txt", content, "text/plain"),
    }
    data = {
        "title": "Algebra Basics",
    }
    r = client.post("/courses/upload", headers=headers, files=files, data=data)
    assert r.status_code == 201, r.text
    course = r.json()
    assert course["title"] == "Algebra Basics"
    assert len(course["syllabus"]) >= 1

    cid = course["id"]
    r = client.get(f"/courses/{cid}", headers=headers)
    assert r.status_code == 200
    got = r.json()
    assert got["id"] == cid
    assert len(got["syllabus"]) == len(course["syllabus"])