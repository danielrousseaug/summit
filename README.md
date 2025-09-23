# Summit MVP

A minimal FastAPI + Next.js app for notes.

## Stack
- Backend: FastAPI, SQLModel (SQLite), Pytest
- Frontend: Next.js (App Router, TS), Tailwind

## Getting started

### 1. Backend
```bash
# from repo root
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
pytest
uvicorn app.main:app --reload --port 8000 --app-dir backend
```

### 2. Frontend
```bash
# from repo root
cp frontend/.env.local.example frontend/.env.local
npm --prefix frontend install
npm --prefix frontend run dev
```
By default the frontend calls `http://localhost:8000`.

### 3. Docker (optional)
```bash
docker compose up --build
# backend: http://localhost:8000/health
# frontend: http://localhost:3000
```

## API
- `GET /health` → `{ "status": "ok" }`
- `GET /notes` → list notes
- `POST /notes` → create note `{ title, content }`
- `GET /notes/{id}` → read
- `PUT /notes/{id}` → update `{ title?, content? }`
- `DELETE /notes/{id}` → delete

### Auth
- `POST /auth/register` `{ email, password }`
- `POST /auth/login` `{ email, password }` → `{ access_token }`
- `GET /auth/me` (Bearer token)

### Courses
- `GET /courses/` (Bearer) → list courses
- `POST /courses/upload` (multipart: `file` (.txt/.pdf), `title`) (Bearer) → course with syllabus
- `GET /courses/{id}` (Bearer) → course with syllabus

### Quizzes
- `POST /courses/{course_id}/quizzes/generate` (Bearer) → create a naive quiz from syllabus
- `GET /courses/{course_id}/quizzes` (Bearer) → list quizzes for a course
- `GET /courses/quizzes/{quiz_id}` (Bearer) → quiz with questions
- `POST /courses/quizzes/{quiz_id}/submit` (Bearer, body: `[number]`) → `{ score, total, correct_indices }`

### Assignments (short-answer, naive)
- `POST /courses/{course_id}/assignments/generate` (Bearer) → create 1-3 short-answer prompts
- `GET /courses/{course_id}/assignments` (Bearer) → list assignments
- `GET /courses/assignments/{assignment_id}` (Bearer) → assignment with prompts
- `POST /courses/assignments/{assignment_id}/submit` (Bearer, body: `[string]`) → `{ score, total }`

### Progress
- `GET /courses/{course_id}/progress` (Bearer) → `{ total_items, completed_count, completed_item_ids }`
- `POST /courses/{course_id}/progress/{syllabus_item_id}/toggle` (Bearer) → returns updated summary

## Next steps
- Basic editing UI for notes
- Empty state illustrations & UX polish
- CI: lint/test on push
- Docker compose for full stack
