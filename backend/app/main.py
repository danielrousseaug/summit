from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import create_db_and_tables
from .routes_auth import router as auth_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Initialize database tables on startup
    create_db_and_tables()
    yield


app = FastAPI(title="Summit API", version="0.1.0", lifespan=lifespan)

# Allow local Next.js dev origins
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
