<div align="center">
  <img src="frontend/public/images/logos/logo-full-black.svg" alt="Summit" width="200"/>
  <h3>AI-Powered Learning Management Platform</h3>
  <p>Upload your course materials, get AI-generated syllabi, quizzes, and assignments. Track your progress as you learn.</p>
</div>

---

## Features

- **Smart Course Creation** – Upload PDFs or text files and get an AI-generated syllabus
- **Auto-Generated Quizzes** – Practice with multiple-choice quizzes created from your course content
- **AI Assignments** – Get short-answer assignments with automated grading
- **Progress Tracking** – Mark items complete and track your learning journey
- **Community Courses** – Share and discover courses from other learners

## Quick Start

### Backend
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --port 8000 --app-dir backend
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` and create an account to get started.

### Docker (Optional)
```bash
docker compose up --build
```

## Tech Stack

- **Backend**: FastAPI, SQLModel, SQLite
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **AI**: OpenAI GPT for content generation

## Demo

<!-- Add your demo video here -->

---

Built for better learning
