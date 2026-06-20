"""Tests for the FYP ranker (services.ranking).

Each signal is exercised in isolation; the integration test asserts that
?community=<id> returns identical ordering to the legacy tier-only path so
the FYP wiring does not regress non-FYP requests.
"""
from __future__ import annotations

import json
import math
import os
import random
import time

import pytest
from sqlalchemy import text

import main
from models import (
    Community,
    CommunityMember,
    Listing,
    ListingInteraction,
    ListingView,
    PurchaseOrder,
    SearchQuery,
    User,
    WishlistItem,
)
from services import ranking
from services.ranking import (
    FRESHNESS_TAU_HOURS,
    VIEW_DECAY_TAU_HOURS,
    WEIGHTS,
    _apply_exclusions,
    _community_overlap,
    _freshness,
    _has_sufficient_signal,
    _proximity,
    _resolved_weights,
    _taste_from_purchases,
    _taste_from_sales,
    _taste_from_searches,
    _taste_from_views,
    _taste_from_wishlist,
    score_listings,
)


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #
# `client` and `db_session` come from conftest.py.

# Lazy module-level Supabase Admin client. We seed auth.users via the Admin API
# (the 0002_users_trigger.sql trigger auto-creates the matching public.users
# row) so the public.users.id → auth.users.id FK is satisfied. Cached at
# module scope to avoid re-creating per call across the 50+ `_mk_user` sites.
_admin_client = None


def _get_admin():
    global _admin_client
    if _admin_client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            pytest.skip(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set "
                "(load backend/.env before running tests)"
            )
        from supabase import create_client
        _admin_client = create_client(url, key)
    return _admin_client


def _random_test_phone() -> str:
    # FCC test range, 10000-99999 suffix (90k values, wider than the former 40k
    # range) to reduce birthday-paradox collisions in large test runs while
    # still avoiding the prod-seeded test users (+15555550101-103).
    return f"+15555{random.randint(10000, 99999)}"


@pytest.fixture
def now_ts():
    return time.time()


def _mk_user(db, *, neighborhood: str | None = None) -> User:
    """Create a test user via Supabase Admin API, then patch profile fields.

    The trigger auto-creates the public.users row keyed to the new auth.users
    UUID; we then update display_name/neighborhood/zip_code via raw SQL and
    return the SQLAlchemy User instance.
    """
    admin = _get_admin()
    resp = admin.auth.admin.create_user(
        {"phone": _random_test_phone(), "phone_confirm": True}
    )
    auth_user = getattr(resp, "user", None) or resp
    user_id = auth_user.id

    db.execute(
        text("""
            UPDATE public.users
            SET display_name = :name,
                neighborhood = :hood
            WHERE id = :id
        """),
        {"name": "Test User", "hood": neighborhood, "id": user_id},
    )
    db.commit()

    user = db.query(User).filter(User.id == user_id).first()
    assert user is not None, f"public.users row missing for {user_id} — trigger drift?"
    return user


def _mk_listing(
    db,
    *,
    user_id: str,
    brand: str | None = "BrandX",
    name: str = "Item",
    category: str = "clothing",
    price_cents: int = 5000,
    posted_at: float | None = None,
    status: str = "open",
    communities: list | None = None,
    tags: list | None = None,
) -> Listing:
    listing_id = f"rnk-{int(time.time() * 1_000_000) % 1_000_000_000}-{name[:4]}"
    listing = Listing(
        id=listing_id,
        user_id=user_id,
        brand=brand,
        name=name,
        price_cents=price_cents,
        category=category,
        posted_at=posted_at if posted_at is not None else time.time(),
        communities=json.dumps(communities) if communities is not None else None,
        tags=json.dumps(tags) if tags is not None else None,
        status=status,
    )
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@pytest.fixture
def cleanup(db_session):
    """Track ids created during a test and tear them down at end-of-test."""
    state = {
        "user_ids": set(),
        "listing_ids": set(),
        "community_ids": set(),
    }
    yield state

    if state["listing_ids"]:
        db_session.query(ListingView).filter(
            ListingView.listing_id.in_(state["listing_ids"])
        ).delete(synchronize_session=False)
        db_session.query(ListingInteraction).filter(
            ListingInteraction.listing_id.in_(state["listing_ids"])
        ).delete(synchronize_session=False)
        db_session.query(WishlistItem).filter(
            WishlistItem.listing_id.in_(state["listing_ids"])
        ).delete(synchronize_session=False)
        db_session.query(PurchaseOrder).filter(
            PurchaseOrder.listing_id.in_(state["listing_ids"])
        ).delete(synchronize_session=False)
        db_session.query(Listing).filter(
            Listing.id.in_(state["listing_ids"])
        ).delete(synchronize_session=False)
    if state["user_ids"]:
        db_session.query(SearchQuery).filter(
            SearchQuery.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(ListingView).filter(
            ListingView.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(ListingInteraction).filter(
            ListingInteraction.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(WishlistItem).filter(
            WishlistItem.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(PurchaseOrder).filter(
            PurchaseOrder.buyer_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(Listing).filter(
            Listing.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        db_session.query(CommunityMember).filter(
            CommunityMember.user_id.in_(state["user_ids"])
        ).delete(synchronize_session=False)
        # Delete via Supabase Admin API instead of `query(User).delete()` —
        # the auth.users → public.users CASCADE handles removing the public
        # row, and this also reclaims the matching auth.users entry instead
        # of leaving orphan auth rows accumulating across test runs.
        db_session.commit()
        admin = _get_admin()
        for user_id in state["user_ids"]:
            try:
                admin.auth.admin.delete_user(user_id)
            except Exception:
                pass
    if state["community_ids"]:
        db_session.query(Community).filter(
            Community.id.in_(state["community_ids"])
        ).delete(synchronize_session=False)
    db_session.commit()


# --------------------------------------------------------------------------- #
# Per-signal: wishlist                                                        #
# --------------------------------------------------------------------------- #


def test_wishlist_brand_match_contributes(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    wl_listing = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate_match = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="other")
    candidate_miss = _mk_listing(db_session, user_id=seller.id, brand="Nobrand", category="other")
    cleanup["listing_ids"].update({wl_listing.id, candidate_match.id, candidate_miss.id})

    db_session.add(WishlistItem(user_id=user.id, listing_id=wl_listing.id))
    db_session.commit()

    s_match = _taste_from_wishlist(user, candidate_match, db_session)
    s_miss = _taste_from_wishlist(user, candidate_miss, db_session)
    assert s_match > s_miss
    assert s_match > 0.5  # brand-only weight is 0.7


def test_wishlist_empty_returns_zero(db_session, cleanup):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    listing = _mk_listing(db_session, user_id=seller.id, brand="Patagonia")
    cleanup["listing_ids"].add(listing.id)

    assert _taste_from_wishlist(user, listing, db_session) == 0.0


# --------------------------------------------------------------------------- #
# Per-signal: views                                                           #
# --------------------------------------------------------------------------- #


def test_views_recent_full_dwell_brand_match(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    viewed = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({viewed.id, candidate.id})

    db_session.add(ListingView(
        user_id=user.id, listing_id=viewed.id, source="feed",
        dwell_ms=60_000, ts=now_ts - 60,  # 1 minute ago, full dwell
    ))
    db_session.commit()

    s = _taste_from_views(user, candidate, db_session, now_ts)
    # Full match * recent (~1.0) * full dwell (1.0) -> 1 - exp(-~1) ≈ 0.63
    assert s > 0.4


def test_views_decay_with_age(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    viewed = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({viewed.id, candidate.id})

    # View was 4*tau hours ago — decay factor ~exp(-4) ≈ 0.018
    db_session.add(ListingView(
        user_id=user.id, listing_id=viewed.id, source="feed",
        dwell_ms=60_000, ts=now_ts - 3600 * VIEW_DECAY_TAU_HOURS * 4,
    ))
    db_session.commit()

    s = _taste_from_views(user, candidate, db_session, now_ts)
    assert s < 0.05


def test_views_outside_30d_window_excluded(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    viewed = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({viewed.id, candidate.id})

    # 31 days old — outside the window
    db_session.add(ListingView(
        user_id=user.id, listing_id=viewed.id, source="feed",
        dwell_ms=60_000, ts=now_ts - 31 * 24 * 3600,
    ))
    db_session.commit()

    assert _taste_from_views(user, candidate, db_session, now_ts) == 0.0


# --------------------------------------------------------------------------- #
# Per-signal: searches                                                        #
# --------------------------------------------------------------------------- #


def test_searches_substring_match_in_title(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", name="Down Jacket")
    cleanup["listing_ids"].add(candidate.id)

    db_session.add(SearchQuery(user_id=user.id, query_text="down jacket", ts=now_ts - 100))
    db_session.commit()

    s = _taste_from_searches(user, candidate, db_session, now_ts)
    assert s > 0.0


def test_searches_no_match_returns_zero(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", name="Down Jacket")
    cleanup["listing_ids"].add(candidate.id)

    db_session.add(SearchQuery(user_id=user.id, query_text="dishwasher", ts=now_ts - 100))
    db_session.commit()

    assert _taste_from_searches(user, candidate, db_session, now_ts) == 0.0


def test_searches_takes_only_last_5(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", name="Down Jacket")
    cleanup["listing_ids"].add(candidate.id)

    # Old non-matching searches
    for i in range(5):
        db_session.add(SearchQuery(
            user_id=user.id, query_text="dishwasher", ts=now_ts - 200 - i,
        ))
    # One older matching search that should be EVICTED by the LIMIT 5
    db_session.add(SearchQuery(
        user_id=user.id, query_text="down jacket", ts=now_ts - 1000,
    ))
    db_session.commit()

    assert _taste_from_searches(user, candidate, db_session, now_ts) == 0.0


# --------------------------------------------------------------------------- #
# Per-signal: purchases                                                       #
# --------------------------------------------------------------------------- #


def test_purchases_brand_match_contributes(db_session, cleanup):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    bought = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({bought.id, candidate.id})

    db_session.add(PurchaseOrder(
        listing_id=bought.id, buyer_id=user.id, seller_id=seller.id, status="completed",
    ))
    db_session.commit()

    s = _taste_from_purchases(user, candidate, db_session)
    assert s == pytest.approx(1.0)


def test_purchases_pending_status_ignored(db_session, cleanup):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    bought = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    candidate = _mk_listing(db_session, user_id=seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({bought.id, candidate.id})

    db_session.add(PurchaseOrder(
        listing_id=bought.id, buyer_id=user.id, seller_id=seller.id, status="pending",
    ))
    db_session.commit()

    assert _taste_from_purchases(user, candidate, db_session) == 0.0


# --------------------------------------------------------------------------- #
# Per-signal: sales                                                           #
# --------------------------------------------------------------------------- #


def test_sales_brand_match_contributes(db_session, cleanup):
    user = _mk_user(db_session)
    other_seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, other_seller.id})

    my_sold = _mk_listing(db_session, user_id=user.id, brand="Patagonia", category="clothing", status="sold")
    candidate = _mk_listing(db_session, user_id=other_seller.id, brand="Patagonia", category="clothing")
    cleanup["listing_ids"].update({my_sold.id, candidate.id})

    s = _taste_from_sales(user, candidate, db_session)
    assert s == pytest.approx(1.0)


# --------------------------------------------------------------------------- #
# Per-signal: community overlap                                               #
# --------------------------------------------------------------------------- #


def test_community_overlap_one_shared(db_session, cleanup):
    # Phase 2 (circles): overlap is computed from CommunityMember rows for both
    # the viewer and the seller — the listing's `communities` JSON is no longer
    # consulted.  Both parties must be members of the same circle for overlap > 0.
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    community = Community(name="C1", invite_code=f"inv-{int(time.time()*1000)%1_000_000}", created_by=user.id)
    db_session.add(community)
    db_session.commit()
    db_session.refresh(community)
    cleanup["community_ids"].add(community.id)

    # Both viewer and seller must be in the circle for overlap to register.
    db_session.add(CommunityMember(community_id=community.id, user_id=user.id))
    db_session.add(CommunityMember(community_id=community.id, user_id=seller.id))
    db_session.commit()

    candidate = _mk_listing(db_session, user_id=seller.id, brand="A")
    cleanup["listing_ids"].add(candidate.id)

    s = _community_overlap(user, candidate, db_session)
    # 1 shared circle out of COMMUNITY_OVERLAP_NORM (3) = 0.333...
    expected = 1.0 / 3.0
    assert s == pytest.approx(expected)


def test_community_overlap_zero_when_no_shared(db_session, cleanup):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    community = Community(name="C2", invite_code=f"inv-{int(time.time()*1000)%1_000_000}-b", created_by=user.id)
    db_session.add(community)
    db_session.commit()
    db_session.refresh(community)
    cleanup["community_ids"].add(community.id)

    candidate = _mk_listing(
        db_session, user_id=seller.id, brand="A", communities=[community.id],
    )
    cleanup["listing_ids"].add(candidate.id)

    assert _community_overlap(user, candidate, db_session) == 0.0


def test_community_overlap_building_only_is_zero(db_session, cleanup):
    """Building circles (kind='building') must NOT contribute to ranking overlap.

    Two users who share only a building circle were silently boosted in ranking
    before the 2026-06-19 pivot that hid building from the displayed kinds.
    DISPLAYED_CIRCLE_KINDS restricts overlap to neighborhood/school only.
    """
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    building = Community(
        name="123 main st new york ny 10001",
        kind="building",
        invite_code=f"inv-bld-{int(time.time()*1000)%1_000_000}",
        created_by=user.id,
        is_public=False,
    )
    db_session.add(building)
    db_session.commit()
    db_session.refresh(building)
    cleanup["community_ids"].add(building.id)

    # Both viewer and seller are members of the same building circle.
    db_session.add(CommunityMember(community_id=building.id, user_id=user.id))
    db_session.add(CommunityMember(community_id=building.id, user_id=seller.id))
    db_session.commit()

    candidate = _mk_listing(db_session, user_id=seller.id, brand="B")
    cleanup["listing_ids"].add(candidate.id)

    # Building kind is not in DISPLAYED_CIRCLE_KINDS — overlap must be zero.
    assert _community_overlap(user, candidate, db_session) == 0.0


def test_community_overlap_neighborhood_still_scores(db_session, cleanup):
    """Neighborhood circles (a displayed kind) must still produce a non-zero score
    after the building-exclusion fix, to guard against over-filtering."""
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    hood = Community(
        name="Test Neighborhood Circle",
        kind="neighborhood",
        invite_code=f"inv-hood-{int(time.time()*1000)%1_000_000}",
        created_by=user.id,
        is_public=True,
    )
    db_session.add(hood)
    db_session.commit()
    db_session.refresh(hood)
    cleanup["community_ids"].add(hood.id)

    db_session.add(CommunityMember(community_id=hood.id, user_id=user.id))
    db_session.add(CommunityMember(community_id=hood.id, user_id=seller.id))
    db_session.commit()

    candidate = _mk_listing(db_session, user_id=seller.id, brand="C")
    cleanup["listing_ids"].add(candidate.id)

    score = _community_overlap(user, candidate, db_session)
    assert score == pytest.approx(1.0 / 3.0)


# --------------------------------------------------------------------------- #
# Per-signal: proximity                                                       #
# --------------------------------------------------------------------------- #


def test_proximity_same_neighborhood_is_one(db_session, cleanup):
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="SoHo")
    cleanup["user_ids"].update({user.id, seller.id})

    candidate = _mk_listing(db_session, user_id=seller.id)
    cleanup["listing_ids"].add(candidate.id)

    assert _proximity(user, candidate, db_session) == 1.0


def test_proximity_different_neighborhood_is_zero(db_session, cleanup):
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="Williamsburg")
    cleanup["user_ids"].update({user.id, seller.id})

    candidate = _mk_listing(db_session, user_id=seller.id)
    cleanup["listing_ids"].add(candidate.id)

    assert _proximity(user, candidate, db_session) == 0.0


# --------------------------------------------------------------------------- #
# Per-signal: freshness                                                       #
# --------------------------------------------------------------------------- #


def test_freshness_brand_new_is_one(db_session, cleanup, now_ts):
    seller = _mk_user(db_session)
    cleanup["user_ids"].add(seller.id)
    listing = _mk_listing(db_session, user_id=seller.id, posted_at=now_ts - 1)
    cleanup["listing_ids"].add(listing.id)

    assert _freshness(listing, now_ts) == pytest.approx(1.0, abs=0.01)


def test_freshness_one_week_old_is_one_over_e(db_session, cleanup, now_ts):
    seller = _mk_user(db_session)
    cleanup["user_ids"].add(seller.id)
    listing = _mk_listing(
        db_session, user_id=seller.id, posted_at=now_ts - 3600 * FRESHNESS_TAU_HOURS,
    )
    cleanup["listing_ids"].add(listing.id)

    assert _freshness(listing, now_ts) == pytest.approx(math.exp(-1), abs=0.01)


# --------------------------------------------------------------------------- #
# Cold start                                                                  #
# --------------------------------------------------------------------------- #


def test_cold_start_uses_only_community_proximity_freshness(db_session, cleanup, now_ts):
    """A new user with zero events: score must equal the community + proximity +
    freshness formula with re-normalized weights, ignoring all other signals."""
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="SoHo")
    cleanup["user_ids"].update({user.id, seller.id})

    community = Community(
        name="C-cold", invite_code=f"inv-{int(time.time()*1000)%1_000_000}-c",
        created_by=user.id,
    )
    db_session.add(community)
    db_session.commit()
    db_session.refresh(community)
    cleanup["community_ids"].add(community.id)
    db_session.add(CommunityMember(community_id=community.id, user_id=user.id))
    db_session.commit()

    candidate = _mk_listing(
        db_session, user_id=seller.id, brand="Patagonia",
        communities=[community.id], posted_at=now_ts - 60,
    )
    cleanup["listing_ids"].add(candidate.id)

    assert _has_sufficient_signal(user, db_session, now_ts) is False

    cold_w = _resolved_weights(cold_start=True)
    assert set(cold_w.keys()) == {"community", "proximity", "freshness"}
    assert sum(cold_w.values()) == pytest.approx(1.0)

    expected = (
        cold_w["community"] * _community_overlap(user, candidate, db_session)
        + cold_w["proximity"] * _proximity(user, candidate, db_session)
        + cold_w["freshness"] * _freshness(candidate, now_ts)
    )

    [(_, actual)] = score_listings(user, [candidate], db_session, now_ts)
    assert actual == pytest.approx(expected)


def test_warm_start_uses_full_weights(db_session, cleanup, now_ts):
    """A user with enough signal switches to the full WEIGHTS table."""
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="SoHo")
    cleanup["user_ids"].update({user.id, seller.id})

    # Three views in the last 30d → meets threshold.
    listing_for_views = _mk_listing(db_session, user_id=seller.id, brand="Patagonia")
    cleanup["listing_ids"].add(listing_for_views.id)
    for _ in range(3):
        db_session.add(ListingView(
            user_id=user.id, listing_id=listing_for_views.id, source="feed",
            dwell_ms=10_000, ts=now_ts - 100,
        ))
    db_session.commit()

    assert _has_sufficient_signal(user, db_session, now_ts) is True
    full = _resolved_weights(cold_start=False)
    assert full == WEIGHTS


# --------------------------------------------------------------------------- #
# Exclusions                                                                  #
# --------------------------------------------------------------------------- #


def test_exclusions_drops_own_listing(db_session, cleanup):
    user = _mk_user(db_session)
    cleanup["user_ids"].add(user.id)

    own = _mk_listing(db_session, user_id=user.id, brand="A")
    cleanup["listing_ids"].add(own.id)

    kept = _apply_exclusions(user, [own], db_session)
    assert kept == []


def test_exclusions_drops_not_interested(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    listing = _mk_listing(db_session, user_id=seller.id, brand="A")
    cleanup["listing_ids"].add(listing.id)

    db_session.add(ListingInteraction(
        user_id=user.id, listing_id=listing.id, action="not_interested", ts=now_ts,
    ))
    db_session.commit()

    kept = _apply_exclusions(user, [listing], db_session)
    assert kept == []


def test_exclusions_drops_already_purchased(db_session, cleanup):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    listing = _mk_listing(db_session, user_id=seller.id, brand="A")
    cleanup["listing_ids"].add(listing.id)

    db_session.add(PurchaseOrder(
        listing_id=listing.id, buyer_id=user.id, seller_id=seller.id, status="confirmed",
    ))
    db_session.commit()

    kept = _apply_exclusions(user, [listing], db_session)
    assert kept == []


def test_exclusions_keeps_unrelated_listings(db_session, cleanup, now_ts):
    user = _mk_user(db_session)
    seller = _mk_user(db_session)
    cleanup["user_ids"].update({user.id, seller.id})

    blocked = _mk_listing(db_session, user_id=seller.id, brand="A")
    keeper = _mk_listing(db_session, user_id=seller.id, brand="A")
    cleanup["listing_ids"].update({blocked.id, keeper.id})

    db_session.add(ListingInteraction(
        user_id=user.id, listing_id=blocked.id, action="hide", ts=now_ts,
    ))
    db_session.commit()

    kept = _apply_exclusions(user, [blocked, keeper], db_session)
    kept_ids = {l.id for l in kept}
    assert kept_ids == {keeper.id}


# --------------------------------------------------------------------------- #
# Stability regression: ?community=<id> path is untouched                     #
# --------------------------------------------------------------------------- #


def _community_listing_ids(client, community_id: int) -> list[str]:
    resp = client.get(f"/api/listings?community={community_id}")
    assert resp.status_code == 200, resp.text
    return [l["id"] for l in resp.json()]


def test_community_filter_path_ordering_unchanged(
    client, db_session, cleanup, now_ts, override_auth_user
):
    """When ?community=<id> is set, FYP must NOT activate. Two back-to-back
    requests must return identical id sequences. (We cannot diff against the
    pre-FYP code from a single test run, so the assertion is determinism +
    legacy ordering: tier asc, then postedAt desc.)"""
    user = _mk_user(db_session, neighborhood="SoHo")
    seller_a = _mk_user(db_session, neighborhood="SoHo")
    seller_b = _mk_user(db_session, neighborhood="Williamsburg")
    cleanup["user_ids"].update({user.id, seller_a.id, seller_b.id})

    community = Community(
        name="StabHood", is_public=True,
        invite_code=f"stab-{int(time.time()*1000)%1_000_000}", created_by=user.id,
    )
    db_session.add(community)
    db_session.commit()
    db_session.refresh(community)
    cleanup["community_ids"].add(community.id)
    db_session.add(CommunityMember(community_id=community.id, user_id=user.id))
    db_session.commit()

    # 10 listings, all attached to the same public community, varying postedAt.
    listings = []
    for i in range(10):
        seller = seller_a if i % 2 == 0 else seller_b
        l = _mk_listing(
            db_session, user_id=seller.id, brand=f"Brand{i}", name=f"Item{i}",
            communities=[community.id], posted_at=now_ts - i * 60,
        )
        listings.append(l)
    cleanup["listing_ids"].update(l.id for l in listings)

    override_auth_user(user)

    first = _community_listing_ids(client, community.id)
    second = _community_listing_ids(client, community.id)

    # Determinism: same call twice, same order.
    assert first == second

    # Legacy ordering: postedAt desc within a single tier (all same tier=2 here,
    # since all listings are public/community-tagged for a community the user
    # belongs to). So the result must be sorted by postedAt desc.
    posted_seq = [next(l.posted_at for l in listings if l.id == lid) for lid in first]
    assert posted_seq == sorted(posted_seq, reverse=True)


def test_fyp_mode_excludes_not_interested_via_endpoint(
    client, db_session, cleanup, now_ts, override_auth_user
):
    """End-to-end: a not_interested listing must NOT appear in the default feed."""
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="SoHo")
    cleanup["user_ids"].update({user.id, seller.id})

    keeper = _mk_listing(
        db_session, user_id=seller.id, brand="A", name="Keeper",
        posted_at=now_ts - 60,
    )
    skipped = _mk_listing(
        db_session, user_id=seller.id, brand="B", name="Skipped",
        posted_at=now_ts - 30,
    )
    cleanup["listing_ids"].update({keeper.id, skipped.id})

    db_session.add(ListingInteraction(
        user_id=user.id, listing_id=skipped.id, action="not_interested", ts=now_ts,
    ))
    db_session.commit()

    override_auth_user(user)
    resp = client.get("/api/listings")
    assert resp.status_code == 200, resp.text
    ids = [l["id"] for l in resp.json()]
    assert keeper.id in ids
    assert skipped.id not in ids


def test_fyp_response_shape_has_no_score_field(
    client, db_session, cleanup, now_ts, override_auth_user
):
    """Score is internal — it must not leak into the API response."""
    user = _mk_user(db_session, neighborhood="SoHo")
    seller = _mk_user(db_session, neighborhood="SoHo")
    cleanup["user_ids"].update({user.id, seller.id})

    listing = _mk_listing(
        db_session, user_id=seller.id, brand="A", name="ShapeTest",
        posted_at=now_ts - 30,
    )
    cleanup["listing_ids"].add(listing.id)

    override_auth_user(user)
    resp = client.get("/api/listings")
    assert resp.status_code == 200, resp.text
    payload = resp.json()
    for l in payload:
        assert "score" not in l
        assert "_score" not in l
        assert "fyp_score" not in l
