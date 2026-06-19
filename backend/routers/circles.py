"""Circle-related read endpoints (school autocomplete; My Account toggles land
in Phase 5)."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_optional_user
from database import get_db
from models import User
from services.circles import search_schools

router = APIRouter(prefix="/api", tags=["circles"])


@router.get("/schools/search")
def schools_search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """School seed autocomplete. Uses get_optional_user (not get_current_user)
    so mid-registration callers with a valid Supabase session but no profile
    row yet can still search schools during the registration wizard."""
    return [
        {"id": s.id, "name": s.name, "state": s.state}
        for s in search_schools(db, q)
    ]
