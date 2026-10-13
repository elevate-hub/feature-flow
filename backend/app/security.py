from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from pwdlib import PasswordHash

from app.config import settings


JWT_ALGORITHM = "HS256"
password_hash = PasswordHash.recommended()


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def _signing_key() -> str:
    secret = settings.JWT_SECRET_KEY
    if secret is None or len(secret) < 32:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )
    return secret


def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
) -> str:
    expires_in = expires_delta or timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    if expires_in.total_seconds() <= 0:
        raise ValueError("Access token expiration must be positive")

    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_in,
    }
    return jwt.encode(payload, _signing_key(), algorithm=JWT_ALGORITHM)
