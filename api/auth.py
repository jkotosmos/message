import os
import time
import secrets
import jwt
from typing import Dict, Optional

JWT_SECRET = os.environ.get("JWT_SECRET", secrets.token_urlsafe(32))
JWT_ISSUER = os.environ.get("JWT_ISSUER", "neontalk")
ACCESS_TTL_SECONDS = int(os.environ.get("ACCESS_TTL_SECONDS", "900"))  # 15m
REFRESH_TTL_SECONDS = int(os.environ.get("REFRESH_TTL_SECONDS", "1209600"))  # 14d


def issue_access_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + ACCESS_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def verify_access_token(token: str) -> Optional[Dict]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"require": ["exp", "iat", "sub"]})
        return data
    except Exception:
        return None


def issue_refresh_token() -> str:
    return secrets.token_urlsafe(32)

