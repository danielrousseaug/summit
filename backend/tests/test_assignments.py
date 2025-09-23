from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "as@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "as@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_course(client: TestClient, headers: dict[str, str]) -> int:
    content = b"Intro\nPart One\nPart Two\nPart Three\n"
    files = {"file": ("c.txt", content, "text/plain")}
    r = client.post("/courses/upload", headers=headers, files=files, data={"title": "Assn Course"})
    assert r.status_code == 201
    return r.json()["id"]


def test_generate_list_get_submit_assignment(client: TestClient) -> None:
    headers = auth_headers(client)
    cid = create_course(client, headers)

    r = client.post(f"/courses/{cid}/assignments/generate", headers=headers)
    assert r.status_code == 201
    assn = r.json()
    assert assn["num_questions"] >= 1

    r = client.get(f"/courses/{cid}/assignments", headers=headers)
    assert r.status_code == 200
    lst = r.json()
    assert len(lst) >= 1

    aid = lst[0]["id"]
    r = client.get(f"/courses/assignments/{aid}", headers=headers)
    assert r.status_code == 200
    detail = r.json()
    n = len(detail["questions"]) 

    answers = ["intro answer", "part", "two"][:n]
    r = client.post(f"/courses/assignments/{aid}/submit", headers=headers, json=answers)
    assert r.status_code == 200
    res = r.json()
    assert res["total"] == n
    assert isinstance(res["score"], int)
