from __future__ import annotations

from fastapi.testclient import TestClient


def setup_course(client: TestClient) -> tuple[dict[str, str], int, list[int]]:
    client.post("/auth/register", json={"email": "pr@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "pr@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    content = b"One\nTwo\nThree\n"
    files = {"file": ("c.txt", content, "text/plain")}
    data = {"title": "Progress Course"}
    r = client.post("/courses/upload", headers=headers, files=files, data=data)
    cid = r.json()["id"]

    # fetch course to get syllabus ids
    r = client.get(f"/courses/{cid}", headers=headers)
    syllabus = r.json()["syllabus"]
    ids = [it["id"] for it in syllabus]
    return headers, cid, ids


def test_progress_toggle_and_summary(client: TestClient) -> None:
    headers, cid, ids = setup_course(client)

    r = client.get(f"/courses/{cid}/progress", headers=headers)
    assert r.status_code == 200
    summary = r.json()
    assert summary["total_items"] == len(ids)
    assert summary["completed_count"] == 0

    # Toggle first two
    r = client.post(f"/courses/{cid}/progress/{ids[0]}/toggle", headers=headers)
    assert r.status_code == 200
    r = client.post(f"/courses/{cid}/progress/{ids[1]}/toggle", headers=headers)
    assert r.status_code == 200

    r = client.get(f"/courses/{cid}/progress", headers=headers)
    summary = r.json()
    assert summary["completed_count"] == 2
    assert set(summary["completed_item_ids"]) == {ids[0], ids[1]}

    # Toggle one off
    r = client.post(f"/courses/{cid}/progress/{ids[0]}/toggle", headers=headers)
    r = client.get(f"/courses/{cid}/progress", headers=headers)
    summary = r.json()
    assert summary["completed_count"] == 1
