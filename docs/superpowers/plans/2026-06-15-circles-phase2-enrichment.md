# Circles — Phase 2: Enrichment, Ranking, Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend serve the *circle trust signal* — a listing's circles derived from the **seller's** memberships, intersected with the **viewer**, gated by consent — and repoint ranking and order-pickup off the legacy `Listing.communities` so the seller-picks model can retire.

**Architecture:** Phase 1 added typed circle memberships + consent. Phase 2 adds a read-side primitive `seller_circles_for_viewer(...)` in `services/circles.py` and surfaces it on the feed/listing responses as a new additive `circles` field (the existing `allCommunities` stays untouched so the current UI keeps working until Phase 4 swaps it). New listings stop writing `Listing.communities` entirely; because the existing visibility/tier helpers short-circuit on empty communities (`_is_visible`/`_infer_visibility` treat no-communities as public), new listings are naturally public with no visibility rewrite. Ranking's community-overlap is repointed to seller↔viewer membership overlap (relevance is invisible, so it is **not** consent-gated). Order pickup stops reading the `"neighborhood"` sentinel and uses the seller's `neighborhood`.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres, pytest (`backend/tests/conftest.py`; DB tests skip without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`).

**Depends on:** Phase 1 (`services/circles.py`, `community_members.share_with_mutuals`, `users.share_mutual_friends`, `communities.kind`).

---

## File Structure (Phase 2)

- Modify: `backend/services/circles.py` — add `count_mutual_friends`, `seller_circles_for_viewer`.
- Modify: `backend/main.py` — add the `circles` field in the listing enrichment loop (`get_listings`, ~1642-1668) and mirror in `get_public_listings` (logged-out: no viewer → all circles empty).
- Modify: `backend/services/ranking.py` — repoint `_community_overlap` (~361-379) to seller↔viewer membership overlap; `_listing_communities` becomes unused (remove).
- Modify: `backend/routers/orders.py` — replace the three `"neighborhood" in communities` checks (~208, 602, 734-757) with seller-neighborhood logic.
- Modify: `backend/main.py` — `POST /api/listings` stops reading/writing the `communities` form field (~1104, 1144-1197, 1422).
- Test: `backend/tests/test_circles.py` (extend), `backend/tests/test_circles_enrichment.py` (new), `backend/tests/test_circles_orders.py` (new).

---

## Task 1: Read-side primitives — `count_mutual_friends` + `seller_circles_for_viewer`

**Files:**
- Modify: `backend/services/circles.py`
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_circles.py
from models import Friendship
from services.circles import count_mutual_friends, seller_circles_for_viewer, set_circle_consent, set_user_building


def _friend(db, a_id, b_id):
    db.add(Friendship(user_id=a_id, friend_id=b_id, status="accepted"))
    db.commit()


def test_count_mutual_friends_counts_accepted_overlap(db_session, make_user):
    seller = make_user(display_name="Seller")
    viewer = make_user(display_name="Viewer")
    shared = make_user(display_name="Shared")
    _friend(db_session, seller.id, shared.id)
    _friend(db_session, viewer.id, shared.id)
    assert count_mutual_friends(db_session, seller.id, viewer.id) == 1
    db_session.query(Friendship).filter(Friendship.user_id.in_([seller.id, viewer.id])).delete(synchronize_session=False)
    db_session.commit()


def test_seller_circles_for_viewer_respects_consent_and_match(db_session, make_user):
    seller = make_user(display_name="Seller")
    viewer = make_user(display_name="Viewer")
    # both in the same building, but seller has NOT opted in yet
    b = set_user_building(db_session, seller, "500 W 30th St")
    set_user_building(db_session, viewer, "500 W 30th St")
    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    assert res["building"]["shared"] is False         # consent off
    set_circle_consent(db_session, seller.id, b.id, True)
    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    assert res["building"]["shared"] is True           # consent on + same building
    assert res["building"]["label"] == "Same building"
    assert res["mutualFriends"]["count"] == 0
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_circles.py -k "mutual_friends or seller_circles" -v`
Expected: FAIL with `ImportError: cannot import name 'count_mutual_friends'`.

- [ ] **Step 3: Implement the primitives**

```python
# append to backend/services/circles.py
from models import Friendship


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
    if seller is not None and seller.share_mutual_friends:
        mf = count_mutual_friends(db, seller_id, viewer.id)

    return {"building": building, "school": school, "mutualFriends": {"count": mf}}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_circles.py -k "mutual_friends or seller_circles" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles.py
git commit -m "feat(circles): seller_circles_for_viewer + mutual-friend count primitives"
```

---

## Task 2: Add the `circles` field to feed enrichment

**Files:**
- Modify: `backend/main.py` (enrichment loop in `get_listings`, ~1642-1668; precompute viewer ids near ~1486-1489)
- Test: `backend/tests/test_circles_enrichment.py`

- [ ] **Step 1: Write a failing integration test**

```python
# backend/tests/test_circles_enrichment.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, Listing
from services.circles import set_user_building, set_circle_consent


def test_feed_listing_exposes_circles_for_mutual_viewer(
    db_session, make_user, client, override_auth_user
):
    seller = make_user(display_name="Seller", neighborhood="Chelsea")
    viewer = make_user(display_name="Viewer", neighborhood="Chelsea")
    b = set_user_building(db_session, seller, "12 Jane St")
    set_user_building(db_session, viewer, "12 Jane St")
    set_circle_consent(db_session, seller.id, b.id, True)
    listing = Listing(
        user_id=seller.id, title="Lamp", description="nice", price=20,
        category="home", brand="Unknown", name="Lamp",
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)

    override_auth_user(viewer)
    resp = client.get("/api/listings")
    assert resp.status_code == 200
    mine = next(l for l in resp.json() if l["id"] == listing.id)
    assert mine["circles"]["building"]["shared"] is True
    assert mine["circles"]["school"]["shared"] is False
    assert mine["circles"]["mutualFriends"]["count"] == 0

    # cleanup
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_enrichment.py -v`
Expected: FAIL with `KeyError: 'circles'`.

- [ ] **Step 3: Wire the primitive into the enrichment loop**

In `backend/main.py`, add the import near the other service imports at the top:

```python
from services.circles import seller_circles_for_viewer
```

In `get_listings`, the viewer's membership set is already computed as `my_community_ids` (~1486-1489). In the enrichment loop (~1643, inside `for l in results:`), after `listing_copy["allCommunities"] = all_comms`, add:

```python
        seller_id = l.get("userId")
        if seller_id:
            listing_copy["circles"] = seller_circles_for_viewer(
                db, seller_id, current_user, viewer_circle_ids=my_community_ids
            )
        else:
            listing_copy["circles"] = {
                "building": {"shared": False, "label": "Same building"},
                "school": {"shared": False, "label": ""},
                "mutualFriends": {"count": 0},
            }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_enrichment.py -v`
Expected: PASS.

- [ ] **Step 5: Mirror an empty `circles` on the public (logged-out) feed**

In `get_public_listings` (~1672+), there is no viewer, so circles are always empty. In its enrichment loop add, alongside the existing fields:

```python
        listing_copy["circles"] = {
            "building": {"shared": False, "label": "Same building"},
            "school": {"shared": False, "label": ""},
            "mutualFriends": {"count": 0},
        }
```

- [ ] **Step 6: Run the enrichment test + an existing feed test**

Run: `cd backend && python -m pytest tests/test_circles_enrichment.py tests/test_listing_create.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/tests/test_circles_enrichment.py
git commit -m "feat(circles): expose per-viewer circles on the feed"
```

---

## Task 3: Repoint ranking community-overlap to seller↔viewer circles

**Files:**
- Modify: `backend/services/ranking.py` (`_community_overlap` ~361-379; remove now-unused `_listing_communities` ~75-84)
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles.py
from services.ranking import _community_overlap
from models import Listing


def test_ranking_overlap_uses_seller_memberships(db_session, make_user):
    seller = make_user(display_name="RankSeller")
    viewer = make_user(display_name="RankViewer")
    b = set_user_building(db_session, seller, "9 Bank St")
    set_user_building(db_session, viewer, "9 Bank St")  # share the building circle
    listing = Listing(user_id=seller.id, title="Chair", description="d", price=5,
                       category="home", brand="Unknown", name="Chair")
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)
    # 1 shared circle / COMMUNITY_OVERLAP_NORM(3) ≈ 0.333
    assert _community_overlap(viewer, listing, db_session) > 0.0
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles.py::test_ranking_overlap_uses_seller_memberships -v`
Expected: FAIL (overlap is 0.0 because the old code reads `listing.communities`, which is empty).

- [ ] **Step 3: Repoint `_community_overlap`**

Replace the body of `_community_overlap` in `backend/services/ranking.py` with:

```python
def _community_overlap(user: User, listing: Listing, db: Session) -> float:
    """Normalized count of circles the viewer shares with the listing's seller.

    Relevance is invisible to users, so this is NOT consent-gated — it uses raw
    membership overlap between viewer and seller across all circle kinds.
    """
    seller_cids: set[int] = {
        row.community_id
        for row in db.query(CommunityMember.community_id)
        .filter(CommunityMember.user_id == listing.user_id)
        .all()
    }
    if not seller_cids:
        return 0.0
    my_cids: set[int] = {
        row.community_id
        for row in db.query(CommunityMember.community_id)
        .filter(CommunityMember.user_id == user.id)
        .all()
    }
    overlap = len(seller_cids & my_cids)
    if overlap == 0:
        return 0.0
    return min(1.0, overlap / COMMUNITY_OVERLAP_NORM)
```

Then delete the now-unused `_listing_communities` function (~75-84) and remove `import json` if it has no other use in the file (check with `grep -n "json" backend/services/ranking.py` first; keep it if used elsewhere).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles.py::test_ranking_overlap_uses_seller_memberships -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/ranking.py backend/tests/test_circles.py
git commit -m "feat(circles): ranking overlap uses seller<->viewer circles"
```

---

## Task 4: Repoint order pickup off the `"neighborhood"` sentinel

The old code treats a listing as a "neighborhood" (local-pickup) listing when `"neighborhood" in listing.communities`. With circles, every listing is local-pickup; the relevant fact is the **seller's** neighborhood.

**Files:**
- Modify: `backend/routers/orders.py` (~205-224, ~602-605, ~734-757)
- Test: `backend/tests/test_circles_orders.py`

- [ ] **Step 1: Write a failing test**

```python
# backend/tests/test_circles_orders.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers.orders import _listing_is_neighborhood
from models import Listing, User


def test_listing_is_neighborhood_uses_seller_neighborhood(db_session, make_user):
    seller = make_user(display_name="OSeller", neighborhood="Chelsea")
    listing = Listing(user_id=seller.id, title="Bike", description="d", price=99,
                      category="other", brand="Unknown", name="Bike")
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)
    assert _listing_is_neighborhood(db_session, listing) is True
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_orders.py -v`
Expected: FAIL with `ImportError: cannot import name '_listing_is_neighborhood'`.

- [ ] **Step 3: Add the helper and replace the three sentinel checks**

At the top of `backend/routers/orders.py` add:

```python
def _listing_is_neighborhood(db: Session, listing) -> bool:
    """A listing is a local-pickup ("neighborhood") listing when its seller has
    a neighborhood set. Replaces the legacy `"neighborhood" in communities`
    sentinel now that listings are no longer scoped to communities."""
    if listing is None:
        return False
    seller = db.query(User).filter(User.id == listing.user_id).first()
    return bool(seller and seller.neighborhood)
```

Replace the three usages:
- ~208-209: `communities = json.loads(...)` + `if "neighborhood" in communities and current_user.pickup_address:` → `if _listing_is_neighborhood(db, listing) and current_user.pickup_address:` (drop the `communities = json.loads(...)` line).
- ~602-603: `communities = json.loads(...)` + `is_neighborhood = listing and "neighborhood" in communities` → `is_neighborhood = _listing_is_neighborhood(db, listing)`.
- ~734-757: `communities = json.loads(...)` + `"is_neighborhood": "neighborhood" in communities` → `"is_neighborhood": _listing_is_neighborhood(db, listing)` (drop the local `communities` line).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_orders.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/orders.py backend/tests/test_circles_orders.py
git commit -m "feat(circles): order pickup uses seller neighborhood, not communities sentinel"
```

---

## Task 5: Retire the seller-picks `communities` field on create-listing

**Files:**
- Modify: `backend/main.py` (`POST /api/listings` signature ~1104, parsing/validation ~1144-1197, storage ~1422)
- Test: `backend/tests/test_circles_enrichment.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles_enrichment.py
def test_created_listing_has_no_communities(db_session, make_user, client, override_auth_user, mock_storage):
    seller = make_user(display_name="Creator", neighborhood="SoHo")
    override_auth_user(seller)
    resp = client.post("/api/listings", data={
        "title": "Mug", "description": "ceramic", "price": "8",
        "category": "home", "brand": "Unknown", "name": "Mug",
        "communities": "1,2,3",   # legacy field — must be ignored
    })
    assert resp.status_code in (200, 201)
    from models import Listing
    row = db_session.query(Listing).filter(Listing.user_id == seller.id, Listing.title == "Mug").first()
    assert row is not None
    assert (row.communities or "[]") in ("[]", None, "")
    db_session.query(Listing).filter(Listing.id == row.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_enrichment.py::test_created_listing_has_no_communities -v`
Expected: FAIL (the old endpoint parses `communities` and stores `json.dumps(community_ids)`).

- [ ] **Step 3: Stop reading/writing `communities` on create**

In `POST /api/listings`:
- Remove the `communities: str = Form("")` parameter from the signature (~1104).
- Delete the parsing/validation block (~1144-1197) that builds `community_ids` and enforces the private-listing rules.
- Change the storage line (~1422) from `communities=json.dumps(community_ids)` to `communities=None`.

The `communities` column stays on the model (legacy data) but is no longer written by new listings. Leave a one-line comment at the storage site: `# communities retired (Phase 2): circles derive from the seller, not the listing`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_enrichment.py::test_created_listing_has_no_communities -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_circles_enrichment.py
git commit -m "feat(circles): create-listing stops writing seller-picked communities"
```

---

## Task 6: Full run + regression sweep

- [ ] **Step 1: Run all circles tests**

Run: `cd backend && python -m pytest tests/test_circles.py tests/test_circles_enrichment.py tests/test_circles_orders.py -v`
Expected: PASS (or clean SKIP without Supabase env).

- [ ] **Step 2: Run the existing suites most likely to be affected**

Run: `cd backend && python -m pytest tests/test_listing_create.py tests/test_neighborhood_community.py tests/test_two_pass_flow.py -v`
Expected: PASS. If any test asserted on the old seller-picks `communities` behavior or private-listing scoping, update that test to the circles model (note it in the commit).

---

## Self-Review (against the spec)

- **Spec §4 display source:** the feed now emits `circles` = seller's revealed circles ∩ viewer, gated by `share_with_mutuals` (Tasks 1-2). The frontend (Phase 4) consumes this; `allCommunities` is left intact so nothing breaks before then. ✔
- **Spec §6 ranking:** repointed to seller↔viewer overlap, explicitly not consent-gated since invisible (Task 3). ✔
- **Spec §6 orders/neighborhood:** pickup logic moved off the `communities` sentinel to seller neighborhood (Task 4). ✔
- **Spec §6 retire seller-picks:** create-listing no longer writes `communities` (Task 5); column kept as legacy. ✔
- **Visibility/tiering:** intentionally untouched — new listings have empty `communities`, which the existing `_infer_visibility`/`_is_visible`/`_tier` helpers already treat as public/visible/tier-3. Documented in Architecture. ✔
- **Mutual friends:** count via `count_mutual_friends`, gated by seller `share_mutual_friends` (Task 1). ✔
- **No placeholders / type consistency:** `seller_circles_for_viewer`, `count_mutual_friends`, `_listing_is_neighborhood`, `viewer_circle_ids` kwarg, and the `circles` dict shape (`building`/`school`/`mutualFriends`) are defined once and referenced identically across tasks and into the Phase 4 frontend contract. ✔
- **Deferred to later phases:** registration capture (Phase 3), feed/byline UI consuming `circles` (Phase 4), My Account + profile (Phase 5), and removal of the legacy `allCommunities` fields once the UI no longer reads them (Phase 4 cleanup). ✔
