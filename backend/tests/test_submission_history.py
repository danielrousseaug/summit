from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "sh@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "sh@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_course(client: TestClient, headers: dict[str, str]) -> int:
    content = b"Intro\nPart One\nPart Two\nPart Three\n"
    files = {"file": ("c.txt", content, "text/plain")}
    r = client.post("/courses/upload", headers=headers, files=files, data={"title": "Hist Course"})
    assert r.status_code == 201
    return r.json()["id"]


def test_quiz_submission_history(client: TestClient) -> None:
    headers = auth_headers(client)
    cid = make_course(client, headers)
    # generate quiz and submit
    r = client.post(f"/courses/{cid}/quizzes/generate", headers=headers)
    assert r.status_code == 201
    qid = r.json()["id"]
    r = client.get(f"/courses/quizzes/{qid}", headers=headers)
    detail = r.json()
    answers = [0] * len(detail["questions"])
    r = client.post(f"/courses/quizzes/{qid}/submit", headers=headers, json=answers)
    assert r.status_code == 200
    # history
    r = client.get(f"/courses/quizzes/{qid}/submissions", headers=headers)
    assert r.status_code == 200
    subs = r.json()
    assert isinstance(subs, list) and len(subs) >= 1
    assert set(["id", "created_at", "score", "total"]).issubset(subs[0].keys())


def test_assignment_submission_history(client: TestClient) -> None:
    headers = auth_headers(client)
    cid = make_course(client, headers)
    # generate assignment and submit
    r = client.post(f"/courses/{cid}/assignments/generate", headers=headers)
    assert r.status_code == 201
    aid = r.json()["id"]
    r = client.get(f"/courses/assignments/{aid}", headers=headers)
    detail = r.json()
    answers = ["test" for _ in detail["questions"]]
    r = client.post(f"/courses/assignments/{aid}/submit", headers=headers, json=answers)
    assert r.status_code == 200
    # history
    r = client.get(f"/courses/assignments/{aid}/submissions", headers=headers)
    assert r.status_code == 200
    subs = r.json()
    assert isinstance(subs, list) and len(subs) >= 1
    assert set(["id", "created_at", "score", "total"]).issubset(subs[0].keys())
