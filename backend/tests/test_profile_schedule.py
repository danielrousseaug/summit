from __future__ import annotations

from fastapi.testclient import TestClient


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "pf@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "pf@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_course(client: TestClient, headers: dict[str, str]) -> int:
    content = b"A\nB\nC\nD\nE\n"
    files = {"file": ("c.txt", content, "text/plain")}
    r = client.post("/courses/upload", headers=headers, files=files, data={"title": "Sched"})
    assert r.status_code == 201
    return r.json()["id"]


def test_profile_defaults_and_update_and_schedule(client: TestClient) -> None:
    headers = auth_headers(client)
    # defaults
    r = client.get("/profile/me", headers=headers)
    assert r.status_code == 200
    prof = r.json()
    assert prof["weekly_hours"] >= 1

    # update
    r = client.put("/profile/me", headers=headers, json={"duration_weeks": 2})
    assert r.status_code == 200
    prof2 = r.json()
    assert prof2["duration_weeks"] == 2

    # schedule
    cid = make_course(client, headers)
    r = client.post(f"/profile/courses/{cid}/schedule", headers=headers)
    assert r.status_code == 200
    sched = r.json()
    assert len(sched) >= 1
    # week indices should be within duration_weeks
    assert max(it["week_index"] for it in sched) <= prof2["duration_weeks"] - 1
