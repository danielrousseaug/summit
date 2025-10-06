from __future__ import annotations

from fastapi.testclient import TestClient


def test_notes_crud_flow(client: TestClient) -> None:
    # Create
    create_payload = {"title": "First", "content": "Hello"}
    r = client.post("/notes", json=create_payload)
    assert r.status_code == 201
    created = r.json()
    assert created["title"] == "First"
    assert created["content"] == "Hello"
    note_id = created["id"]

    # List
    r = client.get("/notes")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list) and len(items) == 1

    # Get
    r = client.get(f"/notes/{note_id}")
    assert r.status_code == 200
    assert r.json()["id"] == note_id

    # Update
    r = client.put(f"/notes/{note_id}", json={"content": "Updated"})
    assert r.status_code == 200
    assert r.json()["content"] == "Updated"

    # Delete
    r = client.delete(f"/notes/{note_id}")
    assert r.status_code == 204

    # Verify gone
    r = client.get(f"/notes/{note_id}")
    assert r.status_code == 404
