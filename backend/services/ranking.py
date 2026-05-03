"""FYP ranker — scores listings for the personalized For-You feed.

Pure-Python over SQLAlchemy: no external API calls, no new tables, no new
columns. Score is internal only and never exposed in the API response.

Public surface:
    score_listings(user, listings, db, now) -> list[(Listing, float)]

The endpoint chooses between FYP mode and the existing tier/relevance path
upstream (in main.py); this module is invoked only when FYP mode wins.
"""
from __future__ import annotations

import json
import math
import time
from typing import Iterable

from sqlalchemy.orm import Session

from models import (
    CommunityMember,
    Listing,
    ListingInteraction,
    ListingView,
    PurchaseOrder,
    SearchQuery,
    User,
    WishlistItem,
)


# --------------------------------------------------------------------------- #
# Tunables                                                                    #
# --------------------------------------------------------------------------- #

WEIGHTS: dict[str, float] = {
    "views": 0.20,
    "wishlist": 0.15,
    "searches": 0.15,
    "purchases": 0.15,
    "sales": 0.05,
    "community": 0.15,
    "proximity": 0.05,
    "freshness": 0.10,
}

# Cold-start path uses only these signals; weights re-normalize to 1.0.
COLD_START_KEYS: tuple[str, ...] = ("community", "proximity", "freshness")

VIEW_DECAY_TAU_HOURS = 48.0
FRESHNESS_TAU_HOURS = 168.0
THIRTY_DAYS_SECONDS = 30 * 24 * 3600
SUFFICIENT_SIGNAL_THRESHOLD = 3
MAX_DWELL_MS = 60_000
MAX_RECENT_SEARCHES = 5
COMMUNITY_OVERLAP_NORM = 3.0  # 3+ shared communities saturates the bonus


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def _norm(s: str | None) -> str:
    return (s or "").strip().lower()


def _is_real_brand(brand: str | None) -> bool:
    """Filter out the 'Unknown' placeholder so it doesn't generate false matches."""
    b = _norm(brand)
    return bool(b) and b != "unknown"


def _listing_communities(listing: Listing) -> list[int]:
    """Decode Listing.communities JSON, returning only the integer community ids."""
    raw = listing.communities
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [c for c in decoded if isinstance(c, int)]


def _listing_tags(listing: Listing) -> list[str]:
    raw = listing.tags
    if not raw:
        return []
    try:
        decoded = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [t for t in decoded if isinstance(t, str)]


def _decay(delta_hours: float, tau_hours: float) -> float:
    if delta_hours < 0:
        delta_hours = 0.0
    return math.exp(-delta_hours / tau_hours)


# --------------------------------------------------------------------------- #
# Cold-start gate                                                             #
# --------------------------------------------------------------------------- #


def _has_sufficient_signal(user: User, db: Session, now: float) -> bool:
    """True iff the user has >= SUFFICIENT_SIGNAL_THRESHOLD personalized signals.

    Counts views (30d) + searches (30d) + wishlist size + purchases (any time).
    """
    cutoff = now - THIRTY_DAYS_SECONDS

    views_30d = (
        db.query(ListingView)
        .filter(ListingView.user_id == user.id, ListingView.ts >= cutoff)
        .count()
    )
    searches_30d = (
        db.query(SearchQuery)
        .filter(SearchQuery.user_id == user.id, SearchQuery.ts >= cutoff)
        .count()
    )
    wishlist_count = (
        db.query(WishlistItem).filter(WishlistItem.user_id == user.id).count()
    )
    purchase_count = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.buyer_id == user.id,
            PurchaseOrder.status.in_(("confirmed", "completed")),
        )
        .count()
    )

    total = views_30d + searches_30d + wishlist_count + purchase_count
    return total >= SUFFICIENT_SIGNAL_THRESHOLD


# --------------------------------------------------------------------------- #
# Exclusions                                                                  #
# --------------------------------------------------------------------------- #


def _apply_exclusions(
    user: User, listings: Iterable[Listing], db: Session
) -> list[Listing]:
    """Drop listings the user owns, has hidden, marked not_interested, blocked the
    seller of, or has already bought."""
    listings = list(listings)
    if not listings:
        return []

    listing_ids = [l.id for l in listings]

    # Negative interactions on these specific listings
    neg_actions = ("hide", "not_interested", "block_seller")
    blocked_listing_ids: set[str] = {
        row.listing_id
        for row in db.query(ListingInteraction.listing_id)
        .filter(
            ListingInteraction.user_id == user.id,
            ListingInteraction.action.in_(neg_actions),
            ListingInteraction.listing_id.in_(listing_ids),
        )
        .all()
    }

    # Already-purchased listings (by id, status confirmed/completed)
    purchased_listing_ids: set[str] = {
        row.listing_id
        for row in db.query(PurchaseOrder.listing_id)
        .filter(
            PurchaseOrder.buyer_id == user.id,
            PurchaseOrder.status.in_(("confirmed", "completed")),
            PurchaseOrder.listing_id.in_(listing_ids),
        )
        .all()
    }

    out: list[Listing] = []
    for l in listings:
        if l.user_id == user.id:
            continue
        if l.id in blocked_listing_ids:
            continue
        if l.id in purchased_listing_ids:
            continue
        out.append(l)
    return out


# --------------------------------------------------------------------------- #
# Per-signal scorers — each returns a [0, 1]-ish contribution                 #
# --------------------------------------------------------------------------- #


def _taste_from_wishlist(user: User, listing: Listing, db: Session) -> float:
    """Reward brand/category match against listings in the user's wishlist."""
    rows = (
        db.query(Listing.brand, Listing.category)
        .join(WishlistItem, WishlistItem.listing_id == Listing.id)
        .filter(WishlistItem.user_id == user.id)
        .all()
    )
    if not rows:
        return 0.0

    target_brand = _norm(listing.brand) if _is_real_brand(listing.brand) else ""
    target_cat = _norm(listing.category)

    brand_hit = 0.0
    cat_hit = 0.0
    for brand, category in rows:
        if target_brand and _is_real_brand(brand) and _norm(brand) == target_brand:
            brand_hit = 1.0
        if target_cat and _norm(category) == target_cat:
            cat_hit = 1.0
        if brand_hit and cat_hit:
            break

    return min(1.0, 0.7 * brand_hit + 0.3 * cat_hit)


def _taste_from_views(
    user: User, listing: Listing, db: Session, now: float
) -> float:
    """Recency-decayed brand/category match against views in last 30 days,
    weighted by min(dwell, 60s)/60s."""
    cutoff = now - THIRTY_DAYS_SECONDS
    rows = (
        db.query(Listing.brand, Listing.category, ListingView.dwell_ms, ListingView.ts)
        .join(ListingView, ListingView.listing_id == Listing.id)
        .filter(ListingView.user_id == user.id, ListingView.ts >= cutoff)
        .all()
    )
    if not rows:
        return 0.0

    target_brand = _norm(listing.brand) if _is_real_brand(listing.brand) else ""
    target_cat = _norm(listing.category)
    if not target_brand and not target_cat:
        return 0.0

    score = 0.0
    for brand, category, dwell_ms, ts in rows:
        match = 0.0
        if target_brand and _is_real_brand(brand) and _norm(brand) == target_brand:
            match = max(match, 1.0)
        if target_cat and _norm(category) == target_cat:
            match = max(match, 0.5)
        if match == 0.0:
            continue

        delta_hours = max(0.0, (now - float(ts)) / 3600.0)
        recency = _decay(delta_hours, VIEW_DECAY_TAU_HOURS)
        dwell_w = min(int(dwell_ms or 0), MAX_DWELL_MS) / MAX_DWELL_MS
        score += match * recency * dwell_w

    # Saturating squash so high view counts don't blow past 1.0
    return 1.0 - math.exp(-score)


def _taste_from_searches(
    user: User, listing: Listing, db: Session, now: float
) -> float:
    """Match last 5 (≤30d) search queries against listing title/tags/brand,
    case-insensitive substring."""
    cutoff = now - THIRTY_DAYS_SECONDS
    rows = (
        db.query(SearchQuery.query_text)
        .filter(SearchQuery.user_id == user.id, SearchQuery.ts >= cutoff)
        .order_by(SearchQuery.ts.desc())
        .limit(MAX_RECENT_SEARCHES)
        .all()
    )
    if not rows:
        return 0.0

    title = _norm(listing.title_str)
    brand = _norm(listing.brand) if _is_real_brand(listing.brand) else ""
    tags = [_norm(t) for t in _listing_tags(listing)]

    haystack_parts = [title, brand, *tags]
    haystack_parts = [p for p in haystack_parts if p]
    if not haystack_parts:
        return 0.0

    hits = 0
    for (qtext,) in rows:
        q = _norm(qtext)
        if not q:
            continue
        if any(q in part for part in haystack_parts):
            hits += 1

    if hits == 0:
        return 0.0
    return min(1.0, hits / float(MAX_RECENT_SEARCHES))


def _taste_from_purchases(user: User, listing: Listing, db: Session) -> float:
    """Brand/category match against confirmed/completed purchases."""
    rows = (
        db.query(Listing.brand, Listing.category)
        .join(PurchaseOrder, PurchaseOrder.listing_id == Listing.id)
        .filter(
            PurchaseOrder.buyer_id == user.id,
            PurchaseOrder.status.in_(("confirmed", "completed")),
        )
        .all()
    )
    if not rows:
        return 0.0

    target_brand = _norm(listing.brand) if _is_real_brand(listing.brand) else ""
    target_cat = _norm(listing.category)

    brand_hit = 0.0
    cat_hit = 0.0
    for brand, category in rows:
        if target_brand and _is_real_brand(brand) and _norm(brand) == target_brand:
            brand_hit = 1.0
        if target_cat and _norm(category) == target_cat:
            cat_hit = 1.0
        if brand_hit and cat_hit:
            break

    return min(1.0, 0.7 * brand_hit + 0.3 * cat_hit)


def _taste_from_sales(user: User, listing: Listing, db: Session) -> float:
    """Brand/category match against the user's own sold listings — captures
    'sells in this category, probably knows the space' signal."""
    rows = (
        db.query(Listing.brand, Listing.category)
        .filter(Listing.user_id == user.id, Listing.status == "sold")
        .all()
    )
    if not rows:
        return 0.0

    target_brand = _norm(listing.brand) if _is_real_brand(listing.brand) else ""
    target_cat = _norm(listing.category)

    brand_hit = 0.0
    cat_hit = 0.0
    for brand, category in rows:
        if target_brand and _is_real_brand(brand) and _norm(brand) == target_brand:
            brand_hit = 1.0
        if target_cat and _norm(category) == target_cat:
            cat_hit = 1.0
        if brand_hit and cat_hit:
            break

    return min(1.0, 0.7 * brand_hit + 0.3 * cat_hit)


def _community_overlap(user: User, listing: Listing, db: Session) -> float:
    """Count of communities the user shares with this listing, normalized."""
    listing_cids = _listing_communities(listing)
    if not listing_cids:
        return 0.0

    my_cids: set[int] = {
        row.community_id
        for row in db.query(CommunityMember.community_id)
        .filter(CommunityMember.user_id == user.id)
        .all()
    }
    if not my_cids:
        return 0.0

    overlap = sum(1 for cid in listing_cids if cid in my_cids)
    if overlap == 0:
        return 0.0
    return min(1.0, overlap / COMMUNITY_OVERLAP_NORM)


def _proximity(user: User, listing: Listing, db: Session) -> float:
    """1.0 if same neighborhood as the listing's poster, else 0.0."""
    if not user.neighborhood:
        return 0.0
    poster = db.query(User).filter(User.id == listing.user_id).first()
    if poster is None or not poster.neighborhood:
        return 0.0
    return 1.0 if poster.neighborhood == user.neighborhood else 0.0


def _freshness(listing: Listing, now: float) -> float:
    """Exp decay over a 168h (7-day) window."""
    posted_at = float(listing.posted_at or 0.0)
    if posted_at <= 0:
        return 0.0
    delta_hours = max(0.0, (now - posted_at) / 3600.0)
    return _decay(delta_hours, FRESHNESS_TAU_HOURS)


# --------------------------------------------------------------------------- #
# Top-level scorer                                                            #
# --------------------------------------------------------------------------- #


def _component_scores(
    user: User, listing: Listing, db: Session, now: float
) -> dict[str, float]:
    return {
        "views": _taste_from_views(user, listing, db, now),
        "wishlist": _taste_from_wishlist(user, listing, db),
        "searches": _taste_from_searches(user, listing, db, now),
        "purchases": _taste_from_purchases(user, listing, db),
        "sales": _taste_from_sales(user, listing, db),
        "community": _community_overlap(user, listing, db),
        "proximity": _proximity(user, listing, db),
        "freshness": _freshness(listing, now),
    }


def _resolved_weights(cold_start: bool) -> dict[str, float]:
    if not cold_start:
        return WEIGHTS
    raw = {k: WEIGHTS[k] for k in COLD_START_KEYS}
    total = sum(raw.values()) or 1.0
    return {k: v / total for k, v in raw.items()}


def score_listings(
    user: User,
    listings: Iterable[Listing],
    db: Session,
    now: float | None = None,
) -> list[tuple[Listing, float]]:
    """Score each listing for `user`. Pure function — does not mutate inputs.

    Caller is responsible for visibility/community filtering and for invoking
    `_apply_exclusions` before passing listings in.
    """
    if now is None:
        now = time.time()
    listings = list(listings)
    if not listings:
        return []

    cold_start = not _has_sufficient_signal(user, db, now)
    weights = _resolved_weights(cold_start)

    scored: list[tuple[Listing, float]] = []
    for listing in listings:
        comps = _component_scores(user, listing, db, now)
        total = 0.0
        for key, weight in weights.items():
            total += weight * comps.get(key, 0.0)
        scored.append((listing, total))
    return scored
