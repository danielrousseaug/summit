from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from sqlmodel import Session, select

from .db import get_session
from .models import User

# Simple settings (read from env with defaults)
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_EXPIRES_MINUTES", str(60 * 24)))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
http_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(subject: str, expires_minutes: int = ACCESS_TOKEN_EXPIRES_MINUTES) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=expires_minutes)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer),
    session: Session = Depends(get_session),
    token_q: Optional[str] = Query(default=None, alias="token"),
    access_token_q: Optional[str] = Query(default=None, alias="access_token"),
) -> User:
    # Support Authorization header or fallback to token/access_token query param (for embeddable resources like PDFs)
    token = creds.credentials if creds is not None else (token_q or access_token_q)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = session.exec(select(User).where(User.email == sub)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
