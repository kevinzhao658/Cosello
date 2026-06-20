"""Circle-related endpoints: school autocomplete and My Account circle management."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, get_optional_user
from database import get_db
from models import CommunityMember, User
from services.circles import (
    add_user_school,
    get_user_circles_summary,
    list_user_schools,
    remove_user_school,
    search_schools,
    set_circle_consent,
    TooManySchools,
)

router = APIRouter(prefix="/api", tags=["circles"])


# ---------- Request schemas ----------

class ConsentBody(BaseModel):
    community_id: int
    share: bool


class MutualFriendsBody(BaseModel):
    share: bool


class AddSchoolBody(BaseModel):
    seed_id: int


# ---------- Endpoints ----------

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


@router.get("/circles/me")
def my_circles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's circles summary for My Account."""
    return get_user_circles_summary(db, current_user)


@router.patch("/circles/consent")
def patch_consent(
    body: ConsentBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle share_with_mutuals for any community the user belongs to.

    Returns 404 if the caller is not a member of the given community.
    Covers both the neighborhood toggle and per-school toggles.
    """
    member = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == current_user.id,
            CommunityMember.community_id == body.community_id,
        )
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Not a member of that circle")
    set_circle_consent(db, current_user.id, body.community_id, body.share)
    return {"ok": True}


@router.patch("/circles/mutual-friends")
def patch_mutual_friends(
    body: MutualFriendsBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the user's share_mutual_friends flag."""
    current_user.share_mutual_friends = body.share
    db.commit()
    return {"ok": True}


@router.post("/circles/schools")
def add_school(
    body: AddSchoolBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a school circle from a seed ID. Enforces the 2-school cap.

    Returns 400 if already at 2 schools; 404 if seed_id is unknown.
    """
    try:
        school = add_user_school(db, current_user, body.seed_id)
    except TooManySchools:
        raise HTTPException(status_code=400, detail="Maximum of 2 schools")
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown school")
    return {"community_id": school.id, "name": school.name, "share": False}


@router.delete("/circles/schools/{community_id}")
def delete_school(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove the user's membership in a school circle."""
    remove_user_school(db, current_user, community_id)
    return {"ok": True}
