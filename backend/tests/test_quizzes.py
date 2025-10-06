from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "q@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "q@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_course(client: TestClient, headers: dict[str, str]) -> int:
    content = b"Intro\nChapter 1\nChapter 2\nChapter 3\nChapter 4\n"
    files = {"file": ("c.txt", content, "text/plain")}
    data = {"title": "Course Q"}
    r = client.post("/courses/upload", headers=headers, files=files, data=data)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_generate_list_get_submit_quiz(client: TestClient) -> None:
    headers = auth_headers(client)
    cid = create_course(client, headers)

    # Generate
    r = client.post(f"/courses/{cid}/quizzes/generate", headers=headers)
    assert r.status_code == 201, r.text
    quiz = r.json()
    assert quiz["course_id"] == cid
    assert quiz["num_questions"] >= 1

    # List
    r = client.get(f"/courses/{cid}/quizzes", headers=headers)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) >= 1

    # Get
    qid = lst[0]["id"]
    r = client.get(f"/courses/quizzes/{qid}", headers=headers)
    assert r.status_code == 200
    detail = r.json()
    assert detail["id"] == qid
    n = len(detail["questions"]) 

    # Submit
    answers = [0] * n
    r = client.post(f"/courses/quizzes/{qid}/submit", headers=headers, json=answers)
    assert r.status_code == 200
    res = r.json()
    assert res["total"] == n
    assert isinstance(res["score"], int)
