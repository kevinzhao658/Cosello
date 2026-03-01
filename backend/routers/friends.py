from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from database import get_db
from models import User, Friendship, CommunityMember
from auth import get_current_user
from listings_store import listings_db

router = APIRouter(prefix="/api/friends", tags=["friends"])


# ---------- Schemas ----------

class FriendOut(BaseModel):
    id: int
    display_name: Optional[str] = None
    neighborhood: Optional[str] = None
    profile_picture: Optional[str] = None
    is_friend: bool = False
    mutual_friends_count: int = 0
    shared_communities_count: int = 0


class AddFriendRequest(BaseModel):
    user_id: int


class StatsOut(BaseModel):
    total_listings: int = 0
    purchases: int = 0
    friends_count: int = 0


# ---------- Helpers ----------

def _get_friend_ids(user_id: int, db: Session) -> set[int]:
    """Get all friend IDs for a user."""
    rows = (
        db.query(Friendship)
        .filter(
            or_(
                Friendship.user_id == user_id,
                Friendship.friend_id == user_id,
            ),
            Friendship.status == "accepted",
        )
        .all()
    )
    ids = set()
    for r in rows:
        ids.add(r.friend_id if r.user_id == user_id else r.user_id)
    return ids


def _get_community_ids(user_id: int, db: Session) -> set[int]:
    """Get all community IDs a user belongs to."""
    rows = db.query(CommunityMember.community_id).filter(CommunityMember.user_id == user_id).all()
    return {r[0] for r in rows}


def _count_mutual_friends(user_id: int, other_id: int, db: Session) -> int:
    my_friends = _get_friend_ids(user_id, db)
    their_friends = _get_friend_ids(other_id, db)
    return len(my_friends & their_friends)


def _count_shared_communities(user_id: int, other_id: int, db: Session) -> int:
    my_communities = _get_community_ids(user_id, db)
    their_communities = _get_community_ids(other_id, db)
    return len(my_communities & their_communities)


def _user_to_friend_out(user: User, current_user_id: int, friend_ids: set[int], db: Session) -> dict:
    return {
        "id": user.id,
        "display_name": user.display_name,
        "neighborhood": user.neighborhood,
        "profile_picture": user.profile_picture,
        "is_friend": user.id in friend_ids,
        "mutual_friends_count": _count_mutual_friends(current_user_id, user.id, db),
        "shared_communities_count": _count_shared_communities(current_user_id, user.id, db),
    }


# ---------- Endpoints ----------

@router.get("", response_model=list[FriendOut])
async def list_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friend_ids = _get_friend_ids(current_user.id, db)
    if not friend_ids:
        return []
    users = db.query(User).filter(User.id.in_(friend_ids)).all()
    return [_user_to_friend_out(u, current_user.id, friend_ids, db) for u in users]


@router.post("/add", response_model=FriendOut)
async def add_friend(
    req: AddFriendRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    target = db.query(User).filter(User.id == req.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already friends (either direction)
    existing = (
        db.query(Friendship)
        .filter(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == req.user_id),
                and_(Friendship.user_id == req.user_id, Friendship.friend_id == current_user.id),
            )
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Already friends")

    friendship = Friendship(
        user_id=current_user.id,
        friend_id=req.user_id,
        status="accepted",
    )
    db.add(friendship)
    db.commit()

    friend_ids = _get_friend_ids(current_user.id, db)
    return _user_to_friend_out(target, current_user.id, friend_ids, db)


@router.delete("/{friend_id}")
async def remove_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    record = (
        db.query(Friendship)
        .filter(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == friend_id),
                and_(Friendship.user_id == friend_id, Friendship.friend_id == current_user.id),
            )
        )
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="Friendship not found")

    db.delete(record)
    db.commit()
    return {"removed": True}


@router.get("/search", response_model=list[FriendOut])
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not q or len(q.strip()) < 1:
        return []

    users = (
        db.query(User)
        .filter(
            User.display_name.isnot(None),
            User.display_name != "",
            User.id != current_user.id,
            User.display_name.ilike(f"%{q.strip()}%"),
        )
        .limit(20)
        .all()
    )

    friend_ids = _get_friend_ids(current_user.id, db)
    results = [_user_to_friend_out(u, current_user.id, friend_ids, db) for u in users]

    # Sort: friends first, then by mutual friends, then shared communities
    results.sort(
        key=lambda r: (
            not r["is_friend"],
            -r["mutual_friends_count"],
            -r["shared_communities_count"],
        )
    )
    return results


@router.get("/recommended", response_model=list[FriendOut])
async def recommended_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friend_ids = _get_friend_ids(current_user.id, db)
    my_community_ids = _get_community_ids(current_user.id, db)

    # Find users who share communities with current user
    candidate_ids: set[int] = set()

    if my_community_ids:
        community_members = (
            db.query(CommunityMember.user_id)
            .filter(
                CommunityMember.community_id.in_(my_community_ids),
                CommunityMember.user_id != current_user.id,
            )
            .all()
        )
        candidate_ids.update(r[0] for r in community_members)

    # Add friends-of-friends
    for fid in friend_ids:
        fof = _get_friend_ids(fid, db)
        candidate_ids.update(fof)

    # Remove self and existing friends
    candidate_ids.discard(current_user.id)
    candidate_ids -= friend_ids

    if not candidate_ids:
        return []

    users = db.query(User).filter(
        User.id.in_(candidate_ids),
        User.display_name.isnot(None),
        User.display_name != "",
    ).all()

    results = [_user_to_friend_out(u, current_user.id, friend_ids, db) for u in users]
    results.sort(
        key=lambda r: (-r["mutual_friends_count"], -r["shared_communities_count"])
    )
    return results[:20]


@router.get("/stats", response_model=StatsOut)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    friends_count = (
        db.query(sa_func.count(Friendship.id))
        .filter(
            or_(
                Friendship.user_id == current_user.id,
                Friendship.friend_id == current_user.id,
            ),
            Friendship.status == "accepted",
        )
        .scalar()
    )
    total_listings = sum(1 for l in listings_db if l.get("userId") == current_user.id)
    return {
        "total_listings": total_listings,
        "purchases": 0,
        "friends_count": friends_count or 0,
    }
