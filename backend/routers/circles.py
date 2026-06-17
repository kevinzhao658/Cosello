"""Circle-related read endpoints (school autocomplete; My Account toggles land
in Phase 5)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from services.circles import search_schools

router = APIRouter(prefix="/api", tags=["circles"])


@router.get("/schools/search")
def schools_search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [
        {"id": s.id, "name": s.name, "state": s.state}
        for s in search_schools(db, q)
    ]
