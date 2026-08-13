from functools import lru_cache

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client
from backend.config import settings

_security = HTTPBearer()


@lru_cache(maxsize=1)
def _client():
    """Shared client — get_user(jwt) takes the token explicitly, so no per-request
    session state is kept on it."""
    return create_client(settings.supabase_url, settings.supabase_key)


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> str:
    try:
        response = _client().auth.get_user(credentials.credentials)
        return response.user.id
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
