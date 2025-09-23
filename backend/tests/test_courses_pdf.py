from __future__ import annotations

from io import BytesIO

from fastapi.testclient import TestClient

try:
    import fitz  # type: ignore
except Exception:  # pragma: no cover - if not available we skip
    fitz = None  # type: ignore


def auth_headers(client: TestClient) -> dict[str, str]:
    client.post("/auth/register", json={"email": "p@example.com", "password": "pw123456"})
    r = client.post("/auth/login", json={"email": "p@example.com", "password": "pw123456"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def make_pdf_bytes(text: str) -> bytes:
    assert fitz is not None
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_upload_pdf_when_supported(client: TestClient) -> None:
    if fitz is None:
        return
    headers = auth_headers(client)
    content = make_pdf_bytes("Chapter 1\nChapter 2\n")
    files = {"file": ("syllabus.pdf", content, "application/pdf")}
    data = {"title": "PDF Course"}
    r = client.post("/courses/upload", headers=headers, files=files, data=data)
    assert r.status_code == 201, r.text
    course = r.json()
    assert course["title"] == "PDF Course"
    assert len(course["syllabus"]) >= 1
