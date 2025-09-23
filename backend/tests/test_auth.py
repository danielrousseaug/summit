from __future__ import annotations

from fastapi.testclient import TestClient


def test_register_login_me_flow(client: TestClient) -> None:
    # Register
    r = client.post("/auth/register", json={"email": "a@example.com", "password": "secret123"})
    assert r.status_code == 201, r.text
    user = r.json()
    assert user["email"] == "a@example.com"

    # Login
    r = client.post("/auth/login", json={"email": "a@example.com", "password": "secret123"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert token

    # Me
    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == "a@example.com"