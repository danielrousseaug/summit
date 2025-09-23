from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "sl@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "sl@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_course_and_schedule(client: TestClient, headers: dict[str, str]) -> int:
    content = b"L1\nL2\nL3\nL4\n"
    files = {"file": ("c.txt", content, "text/plain")}
    r = client.post("/courses/upload", headers=headers, files=files, data={"title": "Sched List"})
    cid = r.json()["id"]
    r = client.post(f"/profile/courses/{cid}/schedule", headers=headers)
    assert r.status_code == 200
    return cid


def test_schedule_listing(client: TestClient) -> None:
    headers = auth_headers(client)
    cid = create_course_and_schedule(client, headers)
    r = client.get(f"/profile/courses/{cid}/schedule", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    assert all("title" in it and "due_date" in it for it in data)
