# Summit Build Checklist

This is a living checklist tracking MVP progress.

## Scope (MVP)
- FastAPI backend: health + notes CRUD (in-memory or SQLite)
- Next.js frontend: list/add notes, wired to backend
- Tests for backend endpoints

## Tasks
- [x] Scaffold repo with backend/frontend and checklist
- [x] Backend: health + notes CRUD + CORS
- [x] Backend tests (pytest)
- [x] Frontend scaffold (Next.js, TS, App Router)
- [x] Notes UI (list/add)
- [x] Docs: run instructions

## Decisions
- Backend: FastAPI, uvicorn, SQLite via SQLModel
- Frontend: Next.js 15, TypeScript, app router, Tailwind

## Notes
- Keep things simple and well-tested.
