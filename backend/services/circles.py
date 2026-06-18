"""Circle membership, school seed, and building-derivation helpers.

A "circle" is a typed community (kind in {building, school, neighborhood,
interest}). Building circles are keyed by a normalized street address; school
circles are created from a school_seed row. Mutual-friends consent is a
user-level flag (services here do not touch the friend graph).
"""
import re
import secrets

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from models import Community, CommunityMember, Friendship, SchoolSeed, User

# Unit designators we strip so "123 Main St Apt 4" == "123 Main St".
# Pattern 1: keyword-based (apt, unit, suite, floor, etc.) optionally preceded by comma/hash.
_UNIT_KEYWORD_RE = re.compile(
    r"[,]?\s*\b(apt|apartment|unit|ste|suite|fl|floor)\b\.?\s*\S*",
    re.IGNORECASE,
)
# Pattern 2: bare hash followed by alphanumeric unit (e.g. "#4B", "# 4B").
_UNIT_HASH_RE = re.compile(r"\s*#\s*\S*")
_PUNCT_RE = re.compile(r"[.,]")
_WS_RE = re.compile(r"\s+")


def normalize_address(address: str | None) -> str:
    """Return a stable lowercase key for building matching, or '' if empty."""
    if not address:
        return ""
    s = _UNIT_KEYWORD_RE.sub("", address)
    s = _UNIT_HASH_RE.sub("", s)
    s = _PUNCT_RE.sub("", s)
    s = _WS_RE.sub(" ", s)
    return s.strip().lower()


def _ensure_member(db: Session, community_id: int, user_id: str) -> CommunityMember:
    m = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
        )
        .first()
    )
    if m is None:
        m = CommunityMember(community_id=community_id, user_id=user_id, role="member")
        db.add(m)
        db.commit()
        db.refresh(m)
    return m


def set_user_building(db: Session, user: User, address: str) -> Community | None:
    """Find-or-create the building circle for `address` and add `user` to it.

    Returns None when the address normalizes to empty.
    """
    key = normalize_address(address)
    if not key:
        return None
    community = (
        db.query(Community)
        .filter(Community.kind == "building", Community.name == key)
        .first()
    )
    if community is None:
        community = Community(
            name=key,
            kind="building",
            is_public=False,
            invite_code=secrets.token_urlsafe(8),
            created_by=user.id,
        )
        db.add(community)
        db.commit()
        db.refresh(community)
    _ensure_member(db, community.id, user.id)
    return community


MAX_SCHOOLS = 2


class TooManySchools(Exception):
    """Raised when a user tries to add more than MAX_SCHOOLS school circles."""


def search_schools(db: Session, query: str, limit: int = 10) -> list[SchoolSeed]:
    """Case-insensitive substring search over the school seed table.

    Prefix matches (name starts with the query) rank ahead of mid-string matches,
    then both groups are sorted alphabetically within their rank.
    """
    q = (query or "").strip()
    if not q:
        return []
    ql = q.lower()
    prefix_rank = case((func.lower(SchoolSeed.name).like(ql + "%"), 0), else_=1)
    return (
        db.query(SchoolSeed)
        .filter(SchoolSeed.name.ilike(f"%{q}%"))
        .order_by(prefix_rank, SchoolSeed.name)
        .limit(limit)
        .all()
    )


def list_user_schools(db: Session, user_id: str) -> list[Community]:
    return (
        db.query(Community)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(CommunityMember.user_id == user_id, Community.kind == "school")
        .all()
    )


def add_user_school(db: Session, user: User, seed_id: int) -> Community:
    """Add a school circle for `user` from a seed row. Enforces MAX_SCHOOLS."""
    if len(list_user_schools(db, user.id)) >= MAX_SCHOOLS:
        raise TooManySchools(f"max {MAX_SCHOOLS} schools")
    seed = db.query(SchoolSeed).filter(SchoolSeed.id == seed_id).first()
    if seed is None:
        raise ValueError(f"unknown school_seed id {seed_id}")
    community = (
        db.query(Community)
        .filter(Community.kind == "school", Community.school_seed_id == seed_id)
        .first()
    )
    if community is None:
        community = Community(
            name=seed.name,
            kind="school",
            school_seed_id=seed.id,
            is_public=True,
            invite_code=secrets.token_urlsafe(8),
            created_by=user.id,
        )
        db.add(community)
        db.commit()
        db.refresh(community)
    _ensure_member(db, community.id, user.id)
    return community


def set_circle_consent(db: Session, user_id: str, community_id: int, share: bool) -> None:
    """Set the per-membership share_with_mutuals flag. No-op if not a member."""
    m = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
        )
        .first()
    )
    if m is None:
        return
    m.share_with_mutuals = share
    db.commit()


def count_mutual_friends(db: Session, a_id: str, b_id: str) -> int:
    """Count accepted friends shared by both users (friendships are bidirectional)."""
    def friend_ids(uid: str) -> set[str]:
        rows = (
            db.query(Friendship)
            .filter(
                Friendship.status == "accepted",
                (Friendship.user_id == uid) | (Friendship.friend_id == uid),
            )
            .all()
        )
        out: set[str] = set()
        for r in rows:
            out.add(r.friend_id if r.user_id == uid else r.user_id)
        return out

    return len(friend_ids(a_id) & friend_ids(b_id))


def are_direct_friends(db: Session, a_id: str, b_id: str) -> bool:
    """True if an accepted Friendship exists between a and b in either direction."""
    return (
        db.query(Friendship)
        .filter(
            Friendship.status == "accepted",
            (
                ((Friendship.user_id == a_id) & (Friendship.friend_id == b_id))
                | ((Friendship.user_id == b_id) & (Friendship.friend_id == a_id))
            ),
        )
        .first()
    ) is not None


def seller_circles_for_viewer(
    db: Session,
    seller_id: str,
    viewer: User,
    *,
    viewer_circle_ids: set[int] | None = None,
) -> dict:
    """The seller's revealed circles relative to a viewer.

    A circle is "shared" only when the seller opted in (share_with_mutuals) AND
    the viewer is in the same circle. Mutual friends is gated by the seller's
    user-level share_mutual_friends flag. `viewer_circle_ids` may be passed in
    to avoid re-querying the viewer's memberships in a feed loop.
    """
    if viewer_circle_ids is None:
        viewer_circle_ids = {
            m.community_id
            for m in db.query(CommunityMember.community_id)
            .filter(CommunityMember.user_id == viewer.id)
            .all()
        }

    building = {"shared": False, "label": "Same building"}
    school = {"shared": False, "label": ""}

    revealed = (
        db.query(Community)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == seller_id,
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind.in_(("building", "school")),
        )
        .all()
    )
    for community in revealed:
        if community.id not in viewer_circle_ids:
            continue
        if community.kind == "building":
            building["shared"] = True
        elif community.kind == "school" and not school["shared"]:
            school["shared"] = True
            school["label"] = community.name

    seller = db.query(User).filter(User.id == seller_id).first()
    mf = 0
    direct = False
    if seller is not None and seller.share_mutual_friends:
        mf = count_mutual_friends(db, seller_id, viewer.id)
        direct = are_direct_friends(db, seller_id, viewer.id)

    return {"building": building, "school": school, "mutualFriends": {"count": mf, "directFriend": direct}}
