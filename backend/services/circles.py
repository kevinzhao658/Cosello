"""Circle membership, school seed, and building-derivation helpers.

A "circle" is a typed community (kind in {building, school, neighborhood,
interest}). Building circles are keyed by a normalized street address; school
circles are created from a school_seed row. Mutual-friends consent is a
user-level flag (services here do not touch the friend graph).
"""
import re
import secrets

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from models import Community, CommunityMember, Friendship, SchoolSeed, User

# Circle kinds included in the ranking overlap signal.  Building circles are
# created at registration but are invisible/unconsented since the 2026-06-19
# pivot, so they are intentionally absent from the overlap calculation.
RANKING_OVERLAP_KINDS: tuple[str, ...] = ("neighborhood", "school")

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
      0 — exact match on the curated display name, short name, or acronym
      1 — name or short-name prefix match
      2 — acronym prefix match
      3 — substring match (mid-string, on name or short name)

    Within a rank bucket, shorter names sort first — so the canonical
    "Columbia University" (short_name "Columbia") outranks "Columbia College
    Chicago" for the query "Columbia" — then alphabetically. Rows matching no
    criterion are excluded.
    """
    q = (query or "").strip()
    if not q:
        return []
    ql = q.lower()

    # Acronym candidate: uppercase letters/digits only, 2+ chars required.
    qa = re.sub(r"[^A-Z0-9]", "", q.upper())
    use_acronym = len(qa) >= 2

    name_l = func.lower(SchoolSeed.name)
    short_l = func.lower(SchoolSeed.short_name)

    exact_name = name_l == ql
    exact_short = short_l == ql
    name_prefix = name_l.like(ql + "%")
    short_prefix = short_l.like(ql + "%")
    name_substr = SchoolSeed.name.ilike(f"%{q}%")
    short_substr = SchoolSeed.short_name.ilike(f"%{q}%")

    match_preds = [name_substr, short_substr]
    rank_whens = [
        (or_(exact_name, exact_short), 0),
        (or_(name_prefix, short_prefix), 1),
    ]
    if use_acronym:
        acronym_exact = SchoolSeed.acronym == qa
        acronym_prefix = SchoolSeed.acronym.like(qa + "%")
        match_preds += [acronym_exact, acronym_prefix]
        # An exact acronym is as strong a signal as an exact name (e.g. "NYU").
        rank_whens = [
            (or_(exact_name, exact_short, acronym_exact), 0),
            (or_(name_prefix, short_prefix), 1),
            (acronym_prefix, 2),
        ]

    rank = case(*rank_whens, else_=3)

    return (
        db.query(SchoolSeed)
        .filter(or_(*match_preds))
        .order_by(rank, func.length(SchoolSeed.name), SchoolSeed.name)
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

    Returns schools and mutualFriends only. Neighborhood is no longer a
    displayed circle (spec rev 2026-06-20 insights redesign).
    """
    rows = (
        db.query(Community, CommunityMember)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == user.id,
            Community.kind == "school",
        )
        .all()
    )
    schools = [
        {"community_id": c.id, "name": c.name, "share": bool(m.share_with_mutuals)}
        for c, m in rows
    ]
    return {
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
    reachable_seller_friends: set[str],
    viewer_id: str,
) -> int | None:
    """Pure degree computation from pre-loaded graph slices (lowest wins).

    reachable_seller_friends: subset of seller_friends that are one accepted-
    friend hop from any viewer friend (pre-computed by _bridge_reachable).
    Used only for the 3rd-degree check.
    """
    if seller_id == viewer_id:
        return None
    if seller_id in viewer_friends:
        return 1
    if viewer_friends & seller_friends:
        return 2
    if seller_friends & reachable_seller_friends:
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


def _bridge_reachable(db: Session, viewer_friends: set[str], candidate_friends: set[str]) -> set[str]:
    """Subset of candidate_friends that are one accepted-friend hop from any
    member of viewer_friends. One indexed query, bounded by both sets.

    Used for the 3rd-degree check: if any seller-friend sits in the returned
    set, the seller is reachable in 3 hops from the viewer.

    Scaling note: at large graph sizes this should be replaced with a cached
    degree table (e.g. precomputed adjacency) or a fan-out cap. At current
    Cosello graph size this single indexed query is negligible.
    """
    if not viewer_friends or not candidate_friends:
        return set()
    rows = (
        db.query(Friendship.user_id, Friendship.friend_id)
        .filter(
            Friendship.status == "accepted",
            or_(
                and_(
                    Friendship.user_id.in_(viewer_friends),
                    Friendship.friend_id.in_(candidate_friends),
                ),
                and_(
                    Friendship.friend_id.in_(viewer_friends),
                    Friendship.user_id.in_(candidate_friends),
                ),
            ),
        )
        .all()
    )
    out: set[str] = set()
    for uid, fid in rows:
        if uid in viewer_friends and fid in candidate_friends:
            out.add(fid)
        if fid in viewer_friends and uid in candidate_friends:
            out.add(uid)
    return out


def _seller_school_for_viewer(
    db: Session, seller_id: str, viewer_circle_ids: set[int]
) -> dict | None:
    """The seller's primary *visible* school as {shortName, fullName, isMine}.

    Visible = a school membership with share_with_mutuals=True. isMine = the
    viewer belongs to the same school community. Prefers a school the viewer
    shares so the matching one is the one shown."""
    rows = (
        db.query(Community, SchoolSeed.short_name)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .outerjoin(SchoolSeed, SchoolSeed.id == Community.school_seed_id)
        .filter(
            CommunityMember.user_id == seller_id,
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind == "school",
        )
        .order_by(Community.id)
        .all()
    )
    if not rows:
        return None
    chosen = None
    for community, short_name in rows:
        is_mine = community.id in viewer_circle_ids
        entry = {
            "shortName": short_name or community.name,
            "fullName": community.name,
            "isMine": is_mine,
        }
        if is_mine:
            return entry          # prefer the shared school
        if chosen is None:
            chosen = entry
    return chosen


def _assemble_circles(
    *,
    school: dict | None,
    degree: int | None,
) -> dict:
    """Build the per-viewer circles dict from pre-computed pieces.

    school: {"shortName","fullName","isMine"} or None when the seller has no
        visible school. degree: connection degree (1/2/3) or None.
    """
    return {"connection": {"degree": degree}, "school": school}


# ---------------------------------------------------------------------------
# Public API — single-call and batch enrichment.
# ---------------------------------------------------------------------------

#: Canonical empty circles shape returned when there is no seller or when the
#: seller has no overlap with the viewer.  Callers must NOT mutate this object.
EMPTY_CIRCLES: dict = {"connection": {"degree": None}, "school": None}


def public_seller_circles_batch(
    db: Session,
    seller_ids: list[str],
) -> dict[str, dict]:
    """School-only circles enrichment for the unauthenticated public feed.

    No viewer → connection.degree is always None; isMine is always False
    (there is no viewer circle set to compare against). One DB query for all
    sellers — no N+1.

    Args:
        seller_ids: Distinct seller user IDs whose school circles to load.

    Returns:
        ``{seller_id: {connection:{degree:None}, school:{...}|None}}``
    """
    if not seller_ids:
        return {}

    school_rows = (
        db.query(CommunityMember.user_id, Community, SchoolSeed.short_name)
        .join(Community, Community.id == CommunityMember.community_id)
        .outerjoin(SchoolSeed, SchoolSeed.id == Community.school_seed_id)
        .filter(
            CommunityMember.user_id.in_(seller_ids),
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind == "school",
        )
        .order_by(Community.id)
        .all()
    )
    schools_by_seller: dict[str, dict | None] = {sid: None for sid in seller_ids}
    for uid, community, short_name in school_rows:
        if uid in schools_by_seller and schools_by_seller[uid] is None:
            # Take the first (lowest-id) visible school; isMine always False.
            schools_by_seller[uid] = {
                "shortName": short_name or community.name,
                "fullName": community.name,
                "isMine": False,
            }

    return {
        sid: _assemble_circles(school=schools_by_seller[sid], degree=None)
        for sid in seller_ids
    }


def seller_circles_for_viewer(
    db: Session,
    seller_id: str,
    viewer: User,
    *,
    viewer_circle_ids: set[int] | None = None,
    seller: User | None = None,
) -> dict:
    """The seller's insight circles relative to a viewer: connection degree +
    always-on school (bold-when-mine resolved client-side via isMine)."""
    if viewer_circle_ids is None:
        viewer_circle_ids = {
            m.community_id
            for m in db.query(CommunityMember.community_id)
            .filter(CommunityMember.user_id == viewer.id)
            .all()
        }

    school = _seller_school_for_viewer(db, seller_id, viewer_circle_ids)

    if seller is None:
        seller = db.query(User).filter(User.id == seller_id).first()
    degree = None
    if seller is not None and bool(seller.share_mutual_friends):
        # Future optimisation: cache vf per viewer_id with a ~45 s TTL to avoid
        # a re-query on rapid filter toggles. Skipped here because module-level
        # caches cause stale-friendship flakes in the test suite (create/delete
        # in the same process) and friendship changes are rare in production.
        vf = _load_friend_ids(db, viewer.id)
        sf = _load_friend_ids(db, seller_id)
        reachable = _bridge_reachable(db, vf, sf)
        degree = _connection_degree_from_sets(
            seller_id=seller_id, viewer_friends=vf, seller_friends=sf,
            reachable_seller_friends=reachable, viewer_id=viewer.id,
        )

    return _assemble_circles(school=school, degree=degree)


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

    # --- Visible schools for all sellers in one query ---
    school_rows = (
        db.query(CommunityMember.user_id, Community, SchoolSeed.short_name)
        .join(Community, Community.id == CommunityMember.community_id)
        .outerjoin(SchoolSeed, SchoolSeed.id == Community.school_seed_id)
        .filter(
            CommunityMember.user_id.in_(seller_ids),
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind == "school",
        )
        .order_by(Community.id)
        .all()
    )
    schools_by_seller: dict[str, list[tuple]] = {sid: [] for sid in seller_ids}
    for uid, community, short_name in school_rows:
        if uid in schools_by_seller:
            schools_by_seller[uid].append((community, short_name))

    def pick_school(sid: str) -> dict | None:
        chosen = None
        for community, short_name in schools_by_seller.get(sid, []):
            is_mine = community.id in viewer_circle_ids
            entry = {"shortName": short_name or community.name,
                     "fullName": community.name, "isMine": is_mine}
            if is_mine:
                return entry
            if chosen is None:
                chosen = entry
        return chosen

    # --- Which sellers share mutual friends (consent) ---
    sharing: set[str] = set()
    if seller_map is not None:
        for sid in seller_ids:
            u = seller_map.get(sid)
            if u is not None and bool(u.share_mutual_friends):
                sharing.add(sid)
        missing = [sid for sid in seller_ids if sid not in seller_map]
        if missing:
            for u in db.query(User).filter(User.id.in_(missing)).all():
                if bool(u.share_mutual_friends):
                    sharing.add(u.id)
    else:
        for u in db.query(User).filter(User.id.in_(seller_ids)).all():
            if bool(u.share_mutual_friends):
                sharing.add(u.id)

    # --- Graph slices for degree (only if any seller shares) ---
    viewer_friends: set[str] = set()
    reachable: set[str] = set()
    seller_friends_map: dict[str, set[str]] = {sid: set() for sid in sharing}
    if sharing:
        viewer_friends = _load_friend_ids(db, viewer.id)
        rows = (
            db.query(Friendship)
            .filter(
                Friendship.status == "accepted",
                (Friendship.user_id.in_(sharing)) | (Friendship.friend_id.in_(sharing)),
            )
            .all()
        )
        for r in rows:
            if r.user_id in seller_friends_map:
                seller_friends_map[r.user_id].add(r.friend_id)
            if r.friend_id in seller_friends_map:
                seller_friends_map[r.friend_id].add(r.user_id)
        # Bridge query: which seller-friends are one hop from any viewer-friend?
        # Bounded by viewer_friends × all_seller_friends — replaces the old full
        # 2-hop expansion over viewer_friends.
        all_sf: set[str] = set().union(*seller_friends_map.values()) if seller_friends_map else set()
        reachable = _bridge_reachable(db, viewer_friends, all_sf)

    result: dict[str, dict] = {}
    for sid in seller_ids:
        degree = None
        if sid in sharing:
            degree = _connection_degree_from_sets(
                seller_id=sid, viewer_friends=viewer_friends,
                seller_friends=seller_friends_map.get(sid, set()),
                reachable_seller_friends=reachable, viewer_id=viewer.id,
            )
        result[sid] = _assemble_circles(school=pick_school(sid), degree=degree)
    return result
