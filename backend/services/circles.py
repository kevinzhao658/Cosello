"""Circle membership, school seed, and building-derivation helpers.

A "circle" is a typed community (kind in {building, school, neighborhood,
interest}). Building circles are keyed by a normalized street address; school
circles are created from a school_seed row. Mutual-friends consent is a
user-level flag (services here do not touch the friend graph).
"""
import re
import secrets

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from models import Community, CommunityMember, Friendship, SchoolSeed, User

# Circle kinds that are surfaced to users (both in My Account and on listing
# cards).  Building circles are created at registration but are invisible/
# unconsented since the 2026-06-19 pivot, so they are intentionally absent.
DISPLAYED_CIRCLE_KINDS: tuple[str, ...] = ("neighborhood", "school")

# Stopwords to drop when computing institution acronyms.
_ACRONYM_STOPWORDS = frozenset({"of", "and", "the", "at", "for", "in", "a", "an"})
# Matches a word-boundary token of one or more alphabetic characters.
_ALPHA_WORD_RE = re.compile(r"[a-zA-Z]+")

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


def compute_acronym(name: str) -> str | None:
    """Compute the standard uppercase acronym for a school name.

    Algorithm:
    1. Normalize separators — hyphens, en/em dashes, and slashes are replaced
       with spaces so that "California-Los Angeles" becomes two tokens
       ("California", "Los Angeles") rather than one.
    2. Tokenize on whitespace.
    3. Drop stopwords and pure-punctuation/digit-only tokens.
    4. Take the first alphabetic character of each remaining token, join,
       upper-case.
    5. Return None when fewer than 2 significant tokens contribute a letter.

    Examples:
      "New York University"                     -> "NYU"
      "University of California-Los Angeles"    -> "UCLA"
      "University of California, Los Angeles"   -> "UCLA"
      "Massachusetts Institute of Technology"   -> "MIT"
      "University of North Carolina-Chapel Hill"-> "UNCCH"
    """
    # Step 1: normalize word-joining separators to spaces so hyphenated
    # campus suffixes (e.g. "-Los Angeles", "-Chapel Hill") split correctly.
    normalized = (
        name
        .replace("—", " ")  # em dash
        .replace("–", " ")  # en dash
        .replace("-", " ")
        .replace("/", " ")
    )
    letters: list[str] = []
    for token in normalized.split():
        # Grab the first run of alpha chars in this token (strips punctuation
        # such as trailing commas or parentheses that may be attached to a word).
        m = _ALPHA_WORD_RE.search(token)
        if m is None:
            continue  # pure punctuation / numeric token
        word = m.group(0)
        if word.lower() in _ACRONYM_STOPWORDS:
            continue
        letters.append(word[0].upper())
    if len(letters) < 2:
        return None
    return "".join(letters)


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
    """Case-insensitive search over the school seed table.

    Supports both name substring matching and acronym matching so that e.g.
    "NYU" resolves to "New York University".

    Ranking order (lowest rank wins):
      0 — name prefix match
      1 — exact acronym match
      2 — acronym prefix match
      3 — name substring (mid-string)

    Rows with no match on any criterion are excluded. Within each rank bucket
    results are sorted alphabetically by name.
    """
    q = (query or "").strip()
    if not q:
        return []
    ql = q.lower()

    # Build acronym candidate: uppercase letters/digits only, 2+ chars required.
    qa = re.sub(r"[^A-Z0-9]", "", q.upper())
    use_acronym = len(qa) >= 2

    # Name-based predicates.
    name_prefix_pred = func.lower(SchoolSeed.name).like(ql + "%")
    name_substr_pred = SchoolSeed.name.ilike(f"%{q}%")

    if use_acronym:
        acronym_exact_pred = SchoolSeed.acronym == qa
        acronym_prefix_pred = SchoolSeed.acronym.like(qa + "%")

        filter_pred = or_(
            name_substr_pred,
            acronym_exact_pred,
            acronym_prefix_pred,
        )

        rank = case(
            (name_prefix_pred, 0),
            (acronym_exact_pred, 1),
            (acronym_prefix_pred, 2),
            else_=3,
        )
    else:
        filter_pred = name_substr_pred
        rank = case(
            (name_prefix_pred, 0),
            else_=3,
        )

    return (
        db.query(SchoolSeed)
        .filter(filter_pred)
        .order_by(rank, SchoolSeed.name)
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


def remove_user_school(db: Session, user: User, community_id: int) -> None:
    """Drop the user's membership in a school circle.

    Leaves the Community row (other users may still be members).
    """
    db.query(CommunityMember).filter(
        CommunityMember.user_id == user.id,
        CommunityMember.community_id == community_id,
    ).delete()
    db.commit()


def get_user_circles_summary(db: Session, user: User) -> dict:
    """Return the circles summary shape for My Account (GET /api/circles/me).

    Returns a neighborhood row (community_id, label=neighborhood name, share)
    instead of building — building is no longer a displayed circle
    (spec rev 2026-06-19).
    """
    rows = (
        db.query(Community, CommunityMember)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == user.id,
            Community.kind.in_(DISPLAYED_CIRCLE_KINDS),
        )
        .all()
    )
    neighborhood = None
    schools: list[dict] = []
    for community, membership in rows:
        if community.kind == "neighborhood" and neighborhood is None:
            neighborhood = {
                "community_id": community.id,
                "label": community.name,
                "share": bool(membership.share_with_mutuals),
            }
        elif community.kind == "school":
            schools.append({
                "community_id": community.id,
                "name": community.name,
                "share": bool(membership.share_with_mutuals),
            })
    return {
        "neighborhood": neighborhood,
        "schools": schools,
        "mutualFriends": {"share": bool(user.share_mutual_friends)},
    }


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


def _connection_degree_from_sets(
    *,
    seller_id: str,
    viewer_friends: set[str],
    seller_friends: set[str],
    edges_from_viewer_friends: dict[str, set[str]],
    viewer_id: str,
) -> int | None:
    """Pure degree computation from pre-loaded graph slices (lowest wins).

    edges_from_viewer_friends: {friend_id: that friend's accepted-friend set},
    used only for the 3rd-degree check.
    """
    if seller_id == viewer_id:
        return None
    if seller_id in viewer_friends:
        return 1
    if viewer_friends & seller_friends:
        return 2
    for a in viewer_friends:
        if edges_from_viewer_friends.get(a, set()) & seller_friends:
            return 3
    return None


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


# ---------------------------------------------------------------------------
# Internal helpers shared by the single-call and batch paths.
# ---------------------------------------------------------------------------

def _load_friend_ids(db: Session, uid: str) -> set[str]:
    """Return all accepted friend IDs for `uid` (bidirectional)."""
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


def _assemble_circles(
    revealed_communities: list[Community],
    viewer_circle_ids: set[int],
    seller_friend_ids: set[str],
    viewer_friend_ids: set[str],
    viewer_id: str,
    share_mutual_friends: bool,
) -> dict:
    """Build the circles response dict from pre-fetched data.

    Both the single-call and batch paths call this so the output shape is
    guaranteed consistent.

    Args:
        revealed_communities: Communities the seller has opted to share
            (share_with_mutuals=True, kind in neighborhood/school).
        viewer_circle_ids: Set of community IDs the viewer belongs to.
        seller_friend_ids: Accepted friend IDs of the seller (bidirectional).
        viewer_friend_ids: Accepted friend IDs of the viewer (bidirectional).
        viewer_id: The viewer's user ID (used for directFriend check).
        share_mutual_friends: Whether the seller has enabled mutual-friend sharing.
    """
    neighborhood: dict = {"shared": False, "label": ""}
    school: dict = {"shared": False, "label": ""}

    for community in revealed_communities:
        if community.id not in viewer_circle_ids:
            continue
        if community.kind == "neighborhood" and not neighborhood["shared"]:
            neighborhood["shared"] = True
            neighborhood["label"] = community.name
        elif community.kind == "school" and not school["shared"]:
            school["shared"] = True
            school["label"] = community.name

    mf = 0
    direct = False
    if share_mutual_friends:
        mf = len(viewer_friend_ids & seller_friend_ids)
        # directFriend: viewer.id appears in seller's friend set (bidirectional
        # load means this is true iff an accepted Friendship row links them).
        direct = viewer_id in seller_friend_ids

    return {
        "neighborhood": neighborhood,
        "school": school,
        "mutualFriends": {"count": mf, "directFriend": direct},
    }


# ---------------------------------------------------------------------------
# Public API — single-call and batch enrichment.
# ---------------------------------------------------------------------------

#: Canonical empty circles shape returned when there is no seller or when the
#: seller has no overlap with the viewer.  Callers must NOT mutate this object.
EMPTY_CIRCLES: dict = {
    "neighborhood": {"shared": False, "label": ""},
    "school": {"shared": False, "label": ""},
    "mutualFriends": {"count": 0, "directFriend": False},
}


def seller_circles_for_viewer(
    db: Session,
    seller_id: str,
    viewer: User,
    *,
    viewer_circle_ids: set[int] | None = None,
    seller: User | None = None,
) -> dict:
    """The seller's revealed circles relative to a viewer.

    A circle is "shared" only when the seller opted in (share_with_mutuals) AND
    the viewer is in the same circle. Mutual friends is gated by the seller's
    user-level share_mutual_friends flag.

    Args:
        viewer_circle_ids: Pre-computed set of the viewer's community IDs.
            When provided, avoids a DB query. Always pass this in feed loops.
        seller: Pre-fetched seller User row (Task B optimisation). When
            provided, skips the ``db.query(User)`` lookup — saves one query
            per listing. Pass ``poster_map.get(seller_id)`` in ``get_listings``.
    """
    if viewer_circle_ids is None:
        viewer_circle_ids = {
            m.community_id
            for m in db.query(CommunityMember.community_id)
            .filter(CommunityMember.user_id == viewer.id)
            .all()
        }

    revealed = (
        db.query(Community)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == seller_id,
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind.in_(DISPLAYED_CIRCLE_KINDS),
        )
        .order_by(Community.id)
        .all()
    )

    if seller is None:
        seller = db.query(User).filter(User.id == seller_id).first()

    share_mf = seller is not None and bool(seller.share_mutual_friends)
    seller_friends: set[str] = set()
    viewer_friends: set[str] = set()
    if share_mf:
        seller_friends = _load_friend_ids(db, seller_id)
        viewer_friends = _load_friend_ids(db, viewer.id)

    return _assemble_circles(
        revealed_communities=revealed,
        viewer_circle_ids=viewer_circle_ids,
        seller_friend_ids=seller_friends,
        viewer_friend_ids=viewer_friends,
        viewer_id=viewer.id,
        share_mutual_friends=share_mf,
    )


def seller_circles_for_viewer_batch(
    db: Session,
    seller_ids: list[str],
    viewer: User,
    *,
    viewer_circle_ids: set[int],
    seller_map: dict[str, User] | None = None,
) -> dict[str, dict]:
    """Compute circles enrichment for a batch of sellers in O(1) DB queries.

    Replaces per-listing ``seller_circles_for_viewer`` calls in the feed
    endpoint, reducing query cost from ~4-5N to a small constant (2-4 queries).

    Query breakdown:
        1. Seller revealed communities — one JOIN over ``seller_ids``.
        2. Sellers not in ``seller_map`` that may share mutual friends — one
           ``User`` query only for IDs absent from ``seller_map`` (zero cost
           when ``seller_map`` covers all sellers).
        3. Viewer's accepted friends — one ``Friendship`` query (skipped when
           no seller has ``share_mutual_friends=True``).
        4. Sharing sellers' accepted friends — one ``Friendship`` query over
           the sharing-seller ID set (skipped when none share).

    Args:
        seller_ids: Distinct seller user IDs whose circles to compute.
        viewer: The authenticated viewer.
        viewer_circle_ids: Community IDs the viewer belongs to (already loaded
            in the caller; passed in to avoid a repeat query).
        seller_map: Optional ``{seller_id: User}`` dict (e.g. ``poster_map``
            from ``get_listings``). Sellers present here skip the User lookup.
            Sellers absent from the map are looked up as a group.

    Returns:
        ``{seller_id: circles_dict}`` — one entry per input seller_id.
    """
    if not seller_ids:
        return {}

    # --- 1. Revealed communities for all sellers in one query ---
    revealed_rows = (
        db.query(Community, CommunityMember.user_id)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id.in_(seller_ids),
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind.in_(DISPLAYED_CIRCLE_KINDS),
        )
        .order_by(Community.id)
        .all()
    )
    revealed_by_seller: dict[str, list[Community]] = {sid: [] for sid in seller_ids}
    for community, uid in revealed_rows:
        if uid in revealed_by_seller:
            revealed_by_seller[uid].append(community)

    # --- 2. Resolve which sellers share mutual friends ---
    # Start from seller_map for sellers we already have in memory.
    sharing_seller_ids: set[str] = set()
    if seller_map is not None:
        for sid in seller_ids:
            u = seller_map.get(sid)
            if u is not None and bool(u.share_mutual_friends):
                sharing_seller_ids.add(sid)
        # For IDs not in seller_map, fall back to a DB query.
        missing_ids = [sid for sid in seller_ids if sid not in seller_map]
        if missing_ids:
            for u in db.query(User).filter(User.id.in_(missing_ids)).all():
                if bool(u.share_mutual_friends):
                    sharing_seller_ids.add(u.id)
    else:
        seller_users = db.query(User).filter(User.id.in_(seller_ids)).all()
        for u in seller_users:
            if bool(u.share_mutual_friends):
                sharing_seller_ids.add(u.id)

    # --- 3. Viewer's accepted friends (one query, only if any seller shares) ---
    viewer_friends: set[str] = set()
    if sharing_seller_ids:
        viewer_friends = _load_friend_ids(db, viewer.id)

    # --- 4. Sharing sellers' accepted friends (one query over all sharing IDs) ---
    seller_friends_map: dict[str, set[str]] = {sid: set() for sid in sharing_seller_ids}
    if sharing_seller_ids:
        friend_rows = (
            db.query(Friendship)
            .filter(
                Friendship.status == "accepted",
                (Friendship.user_id.in_(sharing_seller_ids))
                | (Friendship.friend_id.in_(sharing_seller_ids)),
            )
            .all()
        )
        for r in friend_rows:
            if r.user_id in seller_friends_map:
                seller_friends_map[r.user_id].add(r.friend_id)
            if r.friend_id in seller_friends_map:
                seller_friends_map[r.friend_id].add(r.user_id)

    # --- Assemble per-seller output ---
    result: dict[str, dict] = {}
    for sid in seller_ids:
        is_sharing = sid in sharing_seller_ids
        result[sid] = _assemble_circles(
            revealed_communities=revealed_by_seller.get(sid, []),
            viewer_circle_ids=viewer_circle_ids,
            seller_friend_ids=seller_friends_map.get(sid, set()),
            viewer_friend_ids=viewer_friends,
            viewer_id=viewer.id,
            share_mutual_friends=is_sharing,
        )
    return result
