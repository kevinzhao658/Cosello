"""Test that verify_supabase_jwt tolerates clock skew on the iat claim.

Root cause: Supabase mints tokens with iat = true UTC time. If the validator
host's clock runs slightly behind the issuer, PyJWT raises
ImmatureSignatureError: The token is not yet valid (iat) → 401 right after
OTP sign-in. The fix is leeway=60 on both jwt.decode() calls.

This test exercises the HS256 path (symmetric key) because the RS256/ES256
path requires a live JWKS fetch and cannot be unit-tested without network
access or a full key-pair fixture.  The leeway kwarg is shared infrastructure:
fixing it on HS256 fixes RS256/ES256 too.
"""
import sys
import time
from pathlib import Path

import jwt
import pytest

# Ensure backend root is on sys.path so `import auth` resolves.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import auth  # noqa: E402 — must come after sys.path patch


# A 32-char secret to avoid PyJWT's short-key-warning on HS256.
_TEST_SECRET = "cosello-test-secret-32chars-xyzz"


def _mint_hs256_token(secret: str, iat_offset: int = 0) -> str:
    """Mint a minimal HS256 JWT with aud/iss matching auth module constants.

    iat_offset > 0 simulates an issuer clock that is ahead of this host
    (the clock-skew scenario that causes ImmatureSignatureError).
    """
    now = int(time.time())
    payload = {
        "sub": "user-123",
        "aud": auth.AUDIENCE,
        "iss": auth.ISSUER,
        "iat": now + iat_offset,
        "exp": now + 3600,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def test_jwt_leeway_tolerates_5s_future_iat(monkeypatch):
    """verify_supabase_jwt must accept a token whose iat is 5 s in the future.

    Without leeway=60 this returns None (ImmatureSignatureError swallowed to
    None), causing a 401 for users right after OTP sign-in.
    """
    monkeypatch.setattr(auth, "SUPABASE_JWT_SECRET", _TEST_SECRET)

    token = _mint_hs256_token(_TEST_SECRET, iat_offset=5)
    result = auth.verify_supabase_jwt(token)

    assert result == "user-123", (
        f"Expected 'user-123' but got {result!r}. "
        "verify_supabase_jwt rejected the token — leeway not applied."
    )
