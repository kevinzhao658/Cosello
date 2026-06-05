import logging
import os
from typing import Optional

import certifi

# python.org Python on macOS ships without a wired-up system trust store, so
# PyJWKClient's urllib-based JWKS fetch fails with CERTIFICATE_VERIFY_FAILED.
# Point urllib at certifi's CA bundle before any TLS request happens.
os.environ.setdefault("SSL_CERT_FILE", certifi.where())
os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from database import get_db
from models import User

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not set; configure in backend/.env")

# Optional: only required for projects that sign JWTs with HS256 (the legacy
# default). Projects that use asymmetric keys (RS256/ES256) verify via JWKS.
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

JWKS_URL = f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
ISSUER = f"{SUPABASE_URL.rstrip('/')}/auth/v1"
AUDIENCE = "authenticated"

# Cache the JWKS client at module load — it lazily fetches and caches keys per kid.
_jwks_client = jwt.PyJWKClient(JWKS_URL)

security = HTTPBearer(auto_error=False)


def verify_supabase_jwt(token: str) -> Optional[str]:
    """Verify a Supabase access token and return the `sub` UUID, or None on failure.

    Supports both HS256 (symmetric, signed with the project's shared JWT secret)
    and RS256/ES256 (asymmetric, verified via JWKS). The algorithm is selected
    per-token by reading the JWT header, so the same backend works regardless of
    whether the Supabase project has been migrated to asymmetric keys.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        if alg == "HS256":
            if not SUPABASE_JWT_SECRET:
                logger.error(
                    "Token uses HS256 but SUPABASE_JWT_SECRET is not configured. "
                    "Add it to backend/.env from Supabase Dashboard → Project "
                    "Settings → API → JWT Settings → JWT Secret."
                )
                return None
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience=AUDIENCE,
                issuer=ISSUER,
                leeway=60,
            )
        elif alg in ("RS256", "ES256"):
            signing_key = _jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=AUDIENCE,
                issuer=ISSUER,
                leeway=60,
            )
        else:
            logger.warning("Unsupported JWT alg %r — cannot verify token.", alg)
            return None

        sub = payload.get("sub")
        return str(sub) if sub else None
    except jwt.PyJWTError as e:
        logger.warning("JWT verification failed: %s", e)
        return None
    except jwt.exceptions.PyJWKClientError as e:
        logger.warning("JWKS lookup failed: %s", e)
        return None


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user_uuid = verify_supabase_jwt(credentials.credentials)
    if user_uuid is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = db.query(User).filter(User.id == user_uuid).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising."""
    if credentials is None:
        return None
    user_uuid = verify_supabase_jwt(credentials.credentials)
    if user_uuid is None:
        return None
    return db.query(User).filter(User.id == user_uuid).first()
