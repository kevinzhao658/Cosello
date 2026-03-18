import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_, and_
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from database import get_db
from models import User, Friendship, CommunityMember, Community, PurchaseOrder, Review
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
    avg_seller_rating: float = 5.0
    avg_buyer_rating: float = 5.0


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
    purchases_count = (
        db.query(sa_func.count(PurchaseOrder.id))
        .filter(PurchaseOrder.buyer_id == current_user.id)
        .scalar()
    )
    # Compute separate buyer/seller ratings
    reviews = db.query(Review).filter(Review.reviewee_id == current_user.id).all()
    seller_ratings = [r.rating for r in reviews if r.reviewer_role == "buyer"]
    buyer_ratings = [r.rating for r in reviews if r.reviewer_role == "seller"]
    avg_seller_rating = round(sum(seller_ratings) / len(seller_ratings), 1) if seller_ratings else 5.0
    avg_buyer_rating = round(sum(buyer_ratings) / len(buyer_ratings), 1) if buyer_ratings else 5.0
    return {
        "total_listings": total_listings,
        "purchases": purchases_count or 0,
        "friends_count": friends_count or 0,
        "avg_seller_rating": avg_seller_rating,
        "avg_buyer_rating": avg_buyer_rating,
    }


@router.get("/profile/{user_id}")
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    my_friend_ids = _get_friend_ids(current_user.id, db)
    my_community_ids = _get_community_ids(current_user.id, db)
    their_community_ids = _get_community_ids(user_id, db)

    # Get their communities with details
    their_communities = (
        db.query(Community)
        .filter(Community.id.in_(their_community_ids))
        .all() if their_community_ids else []
    )
    mutual_ids = my_community_ids & their_community_ids
    communities = []
    for c in their_communities:
        communities.append({
            "id": c.id,
            "name": c.name,
            "image": c.image,
            "is_mutual": c.id in mutual_ids,
            "is_public": c.is_public,
        })
    # Sort: mutual first
    communities.sort(key=lambda c: (not c["is_mutual"], c["name"]))

    # Mutual friends with details
    their_friend_ids = _get_friend_ids(user_id, db)
    mutual_friend_ids = my_friend_ids & their_friend_ids
    mutual_friends = []
    if mutual_friend_ids:
        mutual_users = db.query(User).filter(User.id.in_(mutual_friend_ids)).all()
        for u in mutual_users:
            mutual_friends.append({
                "id": u.id,
                "display_name": u.display_name,
                "profile_picture": u.profile_picture,
                "neighborhood": u.neighborhood,
            })

    # Active listings
    LISTING_EXPIRY_SECONDS = 7 * 24 * 3600
    now = time.time()
    active_listings = [
        {
            "id": l["id"],
            "title": l.get("title", ""),
            "price": l.get("price", ""),
            "imageUrl": l.get("imageUrl", ""),
            "imageUrls": l.get("imageUrls", []),
            "condition": l.get("condition", ""),
            "status": l.get("status", "active"),
        }
        for l in listings_db
        if l.get("userId") == user_id
        and now - l.get("postedAt", 0) < LISTING_EXPIRY_SECONDS
        and l.get("status") != "sold"
    ]

    # Reviews received
    reviews_received = (
        db.query(Review, User)
        .join(User, Review.reviewer_id == User.id)
        .filter(Review.reviewee_id == user_id)
        .order_by(Review.created_at.desc())
        .all()
    )
    reviews_list = [
        {
            "rating": r.rating,
            "comment": r.comment,
            "reviewer_name": u.display_name,
            "reviewer_picture": u.profile_picture,
            "reviewer_role": r.reviewer_role,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r, u in reviews_received
    ]

    # Stats
    total_listings = sum(1 for l in listings_db if l.get("userId") == user_id)
    avg_rating = None
    if reviews_list:
        avg_rating = round(sum(r["rating"] for r in reviews_list) / len(reviews_list), 1)

    # Separate buyer/seller ratings
    # reviewer_role == "buyer" means a buyer reviewed this user as a seller
    # reviewer_role == "seller" means a seller reviewed this user as a buyer
    seller_reviews = [r for r in reviews_list if r["reviewer_role"] == "buyer"]
    buyer_reviews = [r for r in reviews_list if r["reviewer_role"] == "seller"]
    avg_seller_rating = round(sum(r["rating"] for r in seller_reviews) / len(seller_reviews), 1) if seller_reviews else 5.0
    avg_buyer_rating = round(sum(r["rating"] for r in buyer_reviews) / len(buyer_reviews), 1) if buyer_reviews else 5.0

    return {
        "id": target.id,
        "display_name": target.display_name,
        "neighborhood": target.neighborhood,
        "profile_picture": target.profile_picture,
        "is_friend": user_id in my_friend_ids,
        "communities": communities,
        "mutual_friends": mutual_friends,
        "active_listings": active_listings,
        "reviews": reviews_list,
        "stats": {
            "total_listings": total_listings,
            "review_count": len(reviews_list),
            "avg_rating": avg_rating,
            "avg_seller_rating": avg_seller_rating,
            "seller_review_count": len(seller_reviews),
            "avg_buyer_rating": avg_buyer_rating,
            "buyer_review_count": len(buyer_reviews),
        },
        "member_since": target.created_at.isoformat() if target.created_at else None,
    }
