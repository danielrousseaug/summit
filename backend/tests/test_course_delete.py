from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "del@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "del@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_course_delete_cascade(client: TestClient) -> None:
    headers = auth_headers(client)
    content = b"One\nTwo\nThree\n"
    files = {"file": ("c.txt", content, "text/plain")}
    r = client.post("/courses/upload", headers=headers, files=files, data={"title": "ToDelete"})
    assert r.status_code == 201
    cid = r.json()["id"]

    # create dependent data
    client.post(f"/profile/courses/{cid}/schedule", headers=headers)
    client.post(f"/courses/{cid}/quizzes/generate", headers=headers)
    client.post(f"/courses/{cid}/assignments/generate", headers=headers)

    # delete
    r = client.delete(f"/courses/{cid}", headers=headers)
    assert r.status_code == 204

    # ensure gone
    r = client.get(f"/courses/{cid}", headers=headers)
    assert r.status_code == 404
