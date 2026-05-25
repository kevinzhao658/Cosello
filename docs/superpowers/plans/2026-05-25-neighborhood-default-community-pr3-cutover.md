# Neighborhood Default-Community PR 3 — Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the `"neighborhood"` pseudo-tag scaffolding from the backend, delete the `/mine-with-neighborhood` endpoint, narrow the frontend types it forced wide, and replace the sell wizard's auto-tag badge with a seller-driven community picker (cap of 3, neighborhood pre-selected, deselectable).

**Architecture:** No schema changes. No new endpoints (one deletion). Sell wizard continues to send `communities=<csv>` over multipart; backend now validates IDs as int, member-checked, and ≤3 (no public auto-attach override). Old listings keep their literal `"neighborhood"` strings — the BE just stops interpreting them, so they fall out of the neighborhood-community filter chip and drop one ranking tier. Frontend split logic moves to the client: `/mine` returns a flat `CommunityOut[]`, App.tsx partitions by `is_public`.

**Tech Stack:** FastAPI (Python 3.14) + SQLAlchemy on Supabase Postgres; React 18 + TypeScript + Vite + Tailwind v4 (Brutalist Trade palette); pytest for backend, `tsc --noEmit` + Vite build for frontend.

**Branch:** `chore/neighborhood-default-community-cutover` (already cut from `dev` at `988f25d`).

---

## File map

**Backend (modify):**
- `backend/main.py` — strip pseudo-tag at ~10 sites (listing creation parse + auto-attach + private rejection; visibility inference; ranking tier; filter parsing; chip rendering ×2; visibility helper; seed endpoint). Add cap-of-3 + member-check validation in listing creation.
- `backend/routers/communities.py` — delete the `/mine-with-neighborhood` route (lines 234-263).
- `backend/tests/test_neighborhood_community.py` — assert `/mine-with-neighborhood` returns 404; add fresh tests for new listing-creation validation.

**Frontend (modify):**
- `frontend/src/App.tsx` — switch `fetchFilterCommunities` URL + adapt response shape (split client-side via `is_public`); narrow `selectedMarketCommunities` to `number[]`; narrow `handleToggleMarketCommunity` to take `number`; pass `privateCommunities` into `SellWizard`.
- `frontend/src/components/MarketplaceSidebar.tsx` — narrow local `Community.id` and `selectedMarketCommunities`/`onToggleCommunity` types; drop `String(community.id)` coercions.
- `frontend/src/features/sell-wizard/SellWizard.tsx` — accept `privateCommunities` prop; add `selectedCommunityIds: number[]` state (pre-selected from user's neighborhood community); pass to PickupStep; build CSV from it for both single + bulk submission; remove the "Auto-tagged to" info badge.
- `frontend/src/features/sell-wizard/steps/PickupStep.tsx` — rewrite headline to "Where are you selling?"; add chip-toggle community picker with cap of 3, counter, empty state.

---

## Task 1: Backend — strip pseudo-tag in listing creation + add validation

**Files:**
- Modify: `backend/main.py:1088-1127` (parse + validate block in `create_listing`)
- Modify: `backend/main.py:136` (seed endpoint listing creation)
- Test: `backend/tests/test_listing_create.py` (new file)

The current block auto-overrides public listings with `["neighborhood"] + all_user_memberships`. After this task, public listings honor exactly the seller's picks (validated). Cap of 3 enforced for both public and private.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_listing_create.py`:

```python
"""Tests for listing-creation community validation after PR 3 cutover.

The PR 3 spec replaces the public-listing auto-attach with seller-picked
community IDs. These tests assert the new validation surface:
  - Public listings honor exactly what the seller submits (no override)
  - >3 communities rejected with 400
  - Non-member community ID rejected with 400
  - Non-int community values silently dropped (legacy "neighborhood" → no-op)
  - Private listings still require ≥1 private community + all member
"""
import io
import json
import pytest
from sqlalchemy import text

from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from services.neighborhood import set_user_neighborhood, get_neighborhood_community


def _img_bytes() -> bytes:
    # 1x1 transparent PNG — smallest valid image bytes for the listing pipeline.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def _make_listing_form(*, communities: str = "", visibility: str = "public",
                       pickup: str = "Lower East Side, NYC") -> dict:
    return {
        "data": (None, json.dumps({
            "brand": "TestBrand", "name": "TestItem",
            "description": "Test description.", "priceCents": 1000,
            "condition": "Good", "tags": [],
            "category": "other", "categoryAttributes": {},
        })),
        "communities": (None, communities),
        "visibility": (None, visibility),
        "pickup_location": (None, pickup),
        "images": ("test.png", _img_bytes(), "image/png"),
    }


def test_public_listing_honors_exact_seller_picks(authed_client, test_user, db_session, mock_storage):
    """Public listing's communities array == seller-submitted IDs (no auto-attach)."""
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    chelsea = get_neighborhood_community(db_session, "Chelsea")

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=str(chelsea.id), visibility="public"),
    )
    assert resp.status_code == 201, resp.text
    listing_id = resp.json()["id"]

    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == [chelsea.id]


def test_more_than_three_communities_rejected(authed_client, test_user, db_session, mock_storage):
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    # Build 4 community IDs the user IS a member of (system neighborhood + 3 more).
    # Pick from MANHATTAN_NEIGHBORHOODS via get_neighborhood_community.
    names = ["Chelsea", "SoHo", "Tribeca", "Chinatown"]
    ids: list[int] = []
    for nm in names:
        c = get_neighborhood_community(db_session, nm)
        # Join them so the membership check passes — we want to isolate the cap-of-3 error.
        from models import CommunityMember
        if not db_session.query(CommunityMember).filter_by(user_id=test_user.id, community_id=c.id).first():
            db_session.add(CommunityMember(user_id=test_user.id, community_id=c.id, role="member"))
        ids.append(c.id)
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=",".join(str(i) for i in ids), visibility="public"),
    )
    assert resp.status_code == 400
    assert "At most 3 communities" in resp.json()["detail"]


def test_non_member_community_rejected(authed_client, test_user, db_session, mock_storage):
    """Even if community id is valid, user must be a member."""
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()
    # SoHo exists but user is NOT a member.
    soho = get_neighborhood_community(db_session, "SoHo")

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities=str(soho.id), visibility="public"),
    )
    assert resp.status_code == 400
    assert "not a member" in resp.json()["detail"]


def test_legacy_neighborhood_string_silently_dropped(authed_client, test_user, db_session, mock_storage):
    """An old client sending 'neighborhood' as a value gets no community attached
    (no error, no crash). Listing posts cleanly with empty communities."""
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="neighborhood", visibility="public"),
    )
    assert resp.status_code == 201
    listing_id = resp.json()["id"]
    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == []


def test_public_listing_zero_communities_allowed(authed_client, test_user, db_session, mock_storage):
    set_user_neighborhood(db_session, test_user, "Chelsea")
    db_session.commit()

    resp = authed_client.post(
        "/api/listings",
        files=_make_listing_form(communities="", visibility="public"),
    )
    assert resp.status_code == 201
    listing_id = resp.json()["id"]
    row = db_session.execute(
        text("SELECT communities FROM listings WHERE id = :id"),
        {"id": listing_id},
    ).first()
    assert json.loads(row[0]) == []
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
cd backend && pytest tests/test_listing_create.py -v
```

Expected: all 5 tests FAIL.
- `test_public_listing_honors_exact_seller_picks` fails because the current code overrides `community_ids` with the full membership graph (assertion will see >1 entry).
- `test_more_than_three_communities_rejected` fails because cap-of-3 isn't enforced today (the request would succeed with 201).
- `test_non_member_community_rejected` fails for public listings (the current code skips the member check on the public path).
- `test_legacy_neighborhood_string_silently_dropped` fails because today the string is preserved (returns `["neighborhood"]`, not `[]`).
- `test_public_listing_zero_communities_allowed` fails for the same reason — current code returns `["neighborhood", ...memberships]`, not `[]`.

- [ ] **Step 3: Rewrite the parse + validate block in `backend/main.py`**

Replace lines 1088-1127 of `backend/main.py` (the block that begins `# Parse community IDs the listing is posted to`) with:

```python
    # Parse community IDs the listing is posted to.
    # Post-PR-3: only integer IDs are recognized. Legacy "neighborhood" strings
    # from older clients are silently dropped (they map to no community).
    community_ids: list[int] = []
    if communities:
        for part in communities.split(","):
            part = part.strip()
            if not part:
                continue
            try:
                community_ids.append(int(part))
            except ValueError:
                pass  # silently drop non-int values (incl. legacy "neighborhood")

    # Hard cap of 3 — enforced for both public and private listings.
    if len(community_ids) > 3:
        raise HTTPException(
            status_code=400,
            detail="At most 3 communities per listing",
        )

    # Validate each id: exists + user is a member.
    for cid in community_ids:
        comm = db.query(Community).filter(Community.id == cid).first()
        if not comm:
            raise HTTPException(status_code=400, detail=f"Community {cid} not found")
        is_member = (
            db.query(CommunityMember)
            .filter(
                CommunityMember.community_id == cid,
                CommunityMember.user_id == current_user.id,
            )
            .first()
        )
        if not is_member:
            raise HTTPException(
                status_code=400,
                detail=f"You are not a member of community {cid}",
            )

    # Private-listing extra rules: must have ≥1 community and all must be private.
    if visibility != "public":
        if len(community_ids) == 0:
            raise HTTPException(
                status_code=400,
                detail="Private listing must have at least one community",
            )
        for cid in community_ids:
            comm = db.query(Community).filter(Community.id == cid).first()
            if comm.is_public:
                raise HTTPException(
                    status_code=400,
                    detail=f"Community {cid} is not private",
                )
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
cd backend && pytest tests/test_listing_create.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full backend test suite to catch regressions**

```bash
cd backend && pytest -v 2>&1 | tail -20
```

Expected: all tests PASS. If a pre-existing test relied on public-listing auto-attach (likely — there may be tests asserting `["neighborhood", ...]` is appended), update them to match the new contract.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_listing_create.py
git commit -m "$(cat <<'EOF'
feat(listings): seller-picked communities + cap of 3 in listing creation

Replaces the public-listing auto-attach (which discarded the seller's
input and appended ["neighborhood"] + every membership) with strict
honoring of the seller's submitted IDs. Adds cap-of-3 + member
validation that now applies uniformly to public and private listings.
Legacy "neighborhood" string values from old clients are silently
dropped (no crash, no special-case).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend — strip pseudo-tag from remaining main.py sites

**Files:**
- Modify: `backend/main.py:136` (seed endpoint listing creation)
- Modify: `backend/main.py:1285-1296` (`_infer_visibility`)
- Modify: `backend/main.py:1312-1329` (`_tier`)
- Modify: `backend/main.py:1331-1354` (community filter parsing)
- Modify: `backend/main.py:1440-1460` (chip rendering — authenticated path)
- Modify: `backend/main.py:1495-1510` (`_is_visible` helper)
- Modify: `backend/main.py:1573-1590` (chip rendering — unauthenticated path)

- [ ] **Step 1: Replace the seed endpoint listing-creation line**

In `backend/main.py:136`, replace:

```python
            communities=json.dumps(["neighborhood"]),
```

with:

```python
            communities=json.dumps(
                [get_neighborhood_community(db, current_user.neighborhood).id]
                if current_user.neighborhood
                else []
            ),
```

Also ensure `get_neighborhood_community` is imported at the top of `main.py`. Check existing imports around line 30-50:

```bash
grep -n "from services.neighborhood\|get_neighborhood_community" /Users/kevinzhao/Documents/CodingProject/Cosello/backend/main.py | head -3
```

If not imported, add:

```python
from services.neighborhood import get_neighborhood_community
```

- [ ] **Step 2: Strip `_infer_visibility` pseudo-tag check**

Replace `backend/main.py:1292-1296`:

```python
        for c in lc:
            nc = _ncid(c)
            if nc == "neighborhood" or (isinstance(nc, int) and nc in all_public_ids):
                return "public"
        return "private"
```

with:

```python
        for c in lc:
            nc = _ncid(c)
            if isinstance(nc, int) and nc in all_public_ids:
                return "public"
        return "private"
```

- [ ] **Step 3: Strip `_tier` pseudo-tag check**

Replace `backend/main.py:1321-1329`:

```python
        for c in listing.get("communities", []):
            nc = _ncid(c)
            if nc == "neighborhood":
                poster = poster_map.get(listing.get("userId"))
                if poster and my_neighborhood and poster.neighborhood == my_neighborhood:
                    return 2
            elif isinstance(nc, int) and nc in my_community_ids:
                return 2
        return 3
```

with:

```python
        for c in listing.get("communities", []):
            nc = _ncid(c)
            if isinstance(nc, int) and nc in my_community_ids:
                return 2
        return 3
```

- [ ] **Step 4: Strip the community filter parsing**

Replace `backend/main.py:1338-1354` (inside `if community and community != "All":`). Find the loop that iterates `parts` and contains `if part == "neighborhood":`. Replace the block:

```python
            for part in parts:
                if part == "neighborhood":
                    if "neighborhood" in lc and neighborhood:
                        poster = poster_map.get(listing.get("userId"))
                        if poster and poster.neighborhood == neighborhood:
                            filtered.append(listing)
                            break
                else:
                    try:
                        cid = int(part)
                    except ValueError:
                        continue
                    if cid not in norm_cids:
                        continue
                    if cid in my_community_ids or cid in all_public_ids:
                        filtered.append(listing)
                        break
```

with:

```python
            for part in parts:
                try:
                    cid = int(part)
                except ValueError:
                    continue
                if cid not in norm_cids:
                    continue
                if cid in my_community_ids or cid in all_public_ids:
                    filtered.append(listing)
                    break
```

- [ ] **Step 5: Strip chip rendering — authenticated path**

Replace `backend/main.py:1445-1455`. Find the `for cid in l.get("communities", []):` block in the authenticated rendering path that contains `if cid == "neighborhood":`. Replace:

```python
        for cid in l.get("communities", []):
            if cid == "neighborhood":
                poster = poster_map.get(l.get("userId"))
                hood_name = poster.neighborhood if poster and poster.neighborhood else l.get("location", "Neighborhood")
                is_same_hood = bool(poster and my_neighborhood and poster.neighborhood == my_neighborhood)
                hood_entry = {"name": hood_name, "is_public": True, "is_mutual": is_same_hood, "is_neighborhood": True}
                all_comms.append(hood_entry)
                if is_same_hood:
                    mutual.append(hood_entry)
            elif isinstance(cid, int) and cid in community_info_map:
```

with:

```python
        for cid in l.get("communities", []):
            if isinstance(cid, int) and cid in community_info_map:
```

(The rest of the `elif`'s body becomes the `if`'s body — no other change inside.)

- [ ] **Step 6: Strip `_is_visible` pseudo-tag check**

Replace `backend/main.py:1503-1506`:

```python
        return any(
            isinstance(_ncid(c), int) and _ncid(c) in all_public_ids
            for c in lc
        ) or "neighborhood" in lc
```

with:

```python
        return any(
            isinstance(_ncid(c), int) and _ncid(c) in all_public_ids
            for c in lc
        )
```

- [ ] **Step 7: Strip chip rendering — unauthenticated path**

Replace `backend/main.py:1578-1586`:

```python
        for cid in l.get("communities", []):
            if cid == "neighborhood":
                poster = pub_poster_map.get(l.get("userId"))
                hood_name = poster.neighborhood if poster and poster.neighborhood else l.get("location", "Neighborhood")
                all_comms.append({"name": hood_name, "is_public": True, "is_mutual": False, "is_neighborhood": True})
            elif isinstance(cid, int) and cid in pub_info:
                # Only show public communities on unauthenticated endpoint
                if pub_info[cid].get("is_public", True):
                    all_comms.append({**pub_info[cid], "is_mutual": False})
```

with:

```python
        for cid in l.get("communities", []):
            if isinstance(cid, int) and cid in pub_info:
                # Only show public communities on unauthenticated endpoint
                if pub_info[cid].get("is_public", True):
                    all_comms.append({**pub_info[cid], "is_mutual": False})
```

- [ ] **Step 8: Confirm no `"neighborhood"` string literals remain in main.py**

```bash
grep -n '"neighborhood"' /Users/kevinzhao/Documents/CodingProject/Cosello/backend/main.py
```

Expected: returns ONLY references that aren't pseudo-tag related (e.g., the `request.neighborhood` body field, dict keys like `{"neighborhood": ...}`). The string `"neighborhood"` should NOT appear as a value comparison anywhere.

- [ ] **Step 9: Run the full test suite**

```bash
cd backend && pytest -v 2>&1 | tail -20
```

Expected: all PASS. If any test asserted a `"neighborhood"` chip rendering or filter behavior on old listings, update it to match the new behavior (old listings now produce no chip, don't match the legacy filter branch).

- [ ] **Step 10: Commit**

```bash
git add backend/main.py
git commit -m "$(cat <<'EOF'
chore(main): strip legacy "neighborhood" pseudo-tag from main.py

Removes ~7 special-case sites: visibility inference, ranking tier,
community filter parsing, chip rendering (auth + unauth paths), the
_is_visible helper, and the seed-test endpoint. Old listings whose
JSON still carries ["neighborhood"] continue to surface in the public
marketplace; they just no longer render a neighborhood chip, match
the neighborhood filter, or rank as tier-2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Backend — delete `/mine-with-neighborhood` endpoint

**Files:**
- Modify: `backend/routers/communities.py:234-263` (delete the route)
- Test: `backend/tests/test_neighborhood_community.py` (assert 404)

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_neighborhood_community.py`:

```python
def test_mine_with_neighborhood_endpoint_deleted(authed_client):
    """PR 3 cutover: the /mine-with-neighborhood endpoint is gone.
    Clients must use /mine and split client-side."""
    resp = authed_client.get("/api/communities/mine-with-neighborhood")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
cd backend && pytest tests/test_neighborhood_community.py::test_mine_with_neighborhood_endpoint_deleted -v
```

Expected: FAIL — endpoint currently returns 200 with a payload.

- [ ] **Step 3: Delete the route handler**

In `backend/routers/communities.py`, find the block starting with `@router.get("/mine-with-neighborhood")` (~line 234) and delete the entire handler (decorator + function body — about 30 lines). Stop deleting at the next `@router.` decorator or top-level definition.

After deletion, verify no other `mine-with-neighborhood` references remain:

```bash
grep -n "mine-with-neighborhood" /Users/kevinzhao/Documents/CodingProject/Cosello/backend/
```

Expected: no output.

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd backend && pytest tests/test_neighborhood_community.py::test_mine_with_neighborhood_endpoint_deleted -v
```

Expected: PASS (FastAPI returns 404 for the missing route).

- [ ] **Step 5: Run the full neighborhood test suite to confirm no regression**

```bash
cd backend && pytest tests/test_neighborhood_community.py -v
```

Expected: all 13 tests PASS (12 existing + the new 404 assertion).

- [ ] **Step 6: Commit**

```bash
git add backend/routers/communities.py backend/tests/test_neighborhood_community.py
git commit -m "$(cat <<'EOF'
feat(communities): delete /mine-with-neighborhood endpoint

Last consumer (App.tsx fetchFilterCommunities) switches to /mine in
Task 4 — at which point this endpoint has zero callers. The defensive
filter we added in PR #15 to drop the synthetic pseudo-id entry also
becomes dead code and is removed in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — switch `fetchFilterCommunities` to `/mine` + split client-side

**Files:**
- Modify: `frontend/src/App.tsx:621-638` (`fetchFilterCommunities`)

The deleted endpoint returned `{ public, private }` directly. `/mine` returns a flat `CommunityOut[]`. We partition by `is_public` on the client.

- [ ] **Step 1: Replace `fetchFilterCommunities`**

Replace `frontend/src/App.tsx:621-638` (the whole function body):

```ts
  const fetchFilterCommunities = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/communities/mine");
      if (res.ok) {
        const all: { id: number; name: string; neighborhood?: string; is_public: boolean }[] =
          await res.json();
        setPublicCommunities(all.filter((c) => c.is_public));
        setPrivateCommunities(all.filter((c) => !c.is_public));
      }
    } catch (err) {
      console.error("Failed to fetch communities:", err);
    }
  };
```

(Drops the inline `data.public || []` access + the `(c: { id: string | number }) => c.id !== "neighborhood"` defensive filter.)

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean (zero errors). The `id` type narrows naturally from the explicit array type.

- [ ] **Step 3: Vite build**

```bash
cd frontend && npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
fix(app): fetch /api/communities/mine and split client-side by is_public

The /mine-with-neighborhood endpoint is gone (Task 3). /mine returns
a flat CommunityOut[] which App.tsx partitions into publicCommunities
and privateCommunities. Drops the PR #15 defensive filter for the
legacy "neighborhood" pseudo-id (no longer emitted).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — narrow type of selectedMarketCommunities + sidebar Community.id

**Files:**
- Modify: `frontend/src/App.tsx:117` (state type)
- Modify: `frontend/src/App.tsx:158-162` (`handleToggleMarketCommunity`)
- Modify: `frontend/src/App.tsx:1734` (filter passthrough — already `string[]` equiv, will need cast or update)
- Modify: `frontend/src/components/MarketplaceSidebar.tsx:14` (`Community.id`)
- Modify: `frontend/src/components/MarketplaceSidebar.tsx:28-29` (prop types)
- Modify: `frontend/src/components/MarketplaceSidebar.tsx:150, 204` (drop `String(community.id)` coercions)

- [ ] **Step 1: Narrow the App.tsx state type**

In `frontend/src/App.tsx:117`, replace:

```ts
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<string[]>([]);
```

with:

```ts
  const [selectedMarketCommunities, setSelectedMarketCommunities] = useState<number[]>([]);
```

- [ ] **Step 2: Narrow `handleToggleMarketCommunity`**

In `frontend/src/App.tsx:158-162`, replace:

```ts
  const handleToggleMarketCommunity = useCallback((cid: string) => {
    setSelectedMarketCommunities((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  }, []);
```

with:

```ts
  const handleToggleMarketCommunity = useCallback((cid: number) => {
    setSelectedMarketCommunities((prev) =>
      prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]
    );
  }, []);
```

- [ ] **Step 3: Adjust the params.set call (no code change, but verify)**

`App.tsx:680-681`:

```ts
      if (selectedMarketCommunities.length > 0) {
        params.set("community", selectedMarketCommunities.join(","));
      }
```

This still works — `Array<number>.join(",")` produces `"1,2,3"` exactly like the previous `string[]` join. No change.

- [ ] **Step 4: Adjust filter passthrough**

In `frontend/src/App.tsx:1734`, the line:

```ts
                        if (selectedMarketCommunities.length > 0) filters.communities = selectedMarketCommunities;
```

The destination `filters.communities` type may be inferred or declared elsewhere. Run typecheck after the next step to see if any change is needed; if `filters.communities` is typed as `string[]`, change it to `number[]` at its declaration. Search:

```bash
grep -n "filters.communities\|communities:" /Users/kevinzhao/Documents/CodingProject/Cosello/frontend/src/App.tsx | head -10
```

If the declaration shows `communities?: string[]`, update it to `communities?: number[]`.

- [ ] **Step 5: Narrow `Community.id` in MarketplaceSidebar**

In `frontend/src/components/MarketplaceSidebar.tsx:13-18`, replace:

```ts
interface Community {
  id: string | number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}
```

with:

```ts
interface Community {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}
```

- [ ] **Step 6: Narrow sidebar prop types**

In `frontend/src/components/MarketplaceSidebar.tsx:28-29`, replace:

```ts
  selectedMarketCommunities: string[];
  onToggleCommunity: (cid: string) => void;
```

with:

```ts
  selectedMarketCommunities: number[];
  onToggleCommunity: (cid: number) => void;
```

- [ ] **Step 7: Drop `String(community.id)` coercions in the sidebar**

In `frontend/src/components/MarketplaceSidebar.tsx:150`, replace:

```ts
                const cid = String(community.id);
                const isSelected = selectedMarketCommunities.includes(cid);
```

with:

```ts
                const cid = community.id;
                const isSelected = selectedMarketCommunities.includes(cid);
```

And the same swap at `MarketplaceSidebar.tsx:204`:

```ts
                        const cid = String(community.id);
```

→

```ts
                        const cid = community.id;
```

- [ ] **Step 8: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If there's an error in `App.tsx:1734` because `filters.communities` is typed as `string[]`, fix that declaration site to `number[]`. If `useDebouncedValue` or any other consumer types `selectedMarketCommunities`, fix those.

- [ ] **Step 9: Vite build**

```bash
cd frontend && npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/MarketplaceSidebar.tsx
git commit -m "$(cat <<'EOF'
refactor(types): narrow selectedMarketCommunities + sidebar Community.id to number

After PR 3's backend cutover, community IDs are guaranteed to be
integers — the legacy "neighborhood" pseudo-string is gone. Narrow
the FE state types accordingly and drop the String(community.id)
coercions that were defensive against the wide union type.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend — SellWizard adds `selectedCommunityIds` state + remove auto-tag badge

**Files:**
- Modify: `frontend/src/App.tsx:1377` (pass `privateCommunities` prop)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:48` (props interface)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:72` (default value destructure)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:84-89` (replace `userNeighborhoodCommunityId` with `selectedCommunityIds` state)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:525-530, 619-626` (formData send: join `selectedCommunityIds`)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:983-998` (drop the `neighborhoodCommunityName` derivation passed to `SingleListingForm`)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:1188-1197` (delete the "Auto-tagged to" badge in `SingleListingForm`)

- [ ] **Step 1: Pass `privateCommunities` from App.tsx into SellWizard**

In `frontend/src/App.tsx:1374-1377`, find:

```tsx
                    photosOnly={newListingMode === "manual"}
                    publicCommunities={publicCommunities}
                    onSwitchToBuy={() => { setTradeMode("buy"); setPage("home"); }}
```

Add the new prop:

```tsx
                    photosOnly={newListingMode === "manual"}
                    publicCommunities={publicCommunities}
                    privateCommunities={privateCommunities}
                    onSwitchToBuy={() => { setTradeMode("buy"); setPage("home"); }}
```

- [ ] **Step 2: Add `privateCommunities` to SellWizard's props interface**

In `frontend/src/features/sell-wizard/SellWizard.tsx:48` (inside `interface SellWizardProps`), the current line is:

```ts
  publicCommunities?: { id: number; name: string; neighborhood?: string; is_public?: boolean }[];
```

Add immediately after it:

```ts
  privateCommunities?: { id: number; name: string; neighborhood?: string; is_public?: boolean }[];
```

- [ ] **Step 3: Destructure `privateCommunities` with default**

In `frontend/src/features/sell-wizard/SellWizard.tsx:72`, the current destructure includes:

```ts
  publicCommunities = [],
```

Add immediately after:

```ts
  privateCommunities = [],
```

- [ ] **Step 4: Replace `userNeighborhoodCommunityId` with `selectedCommunityIds` state**

In `frontend/src/features/sell-wizard/SellWizard.tsx:84-89`, replace:

```ts
  // Resolve the user's neighborhood community from the publicCommunities list.
  // This id is pre-attached to every listing submission as a non-removable
  // community (mirrors the backend auto-attach in PR 1).
  const userNeighborhoodCommunityId = publicCommunities.find(
    (c) => c.neighborhood === user?.neighborhood
  )?.id ?? null;
```

with:

```ts
  // PR 3: seller picks up to 3 communities per listing. We pre-select the
  // user's neighborhood community as a default; the seller can deselect it.
  // The picker lives in PickupStep — see Task 7.
  const availableCommunities = useMemo(
    () => [...publicCommunities, ...privateCommunities],
    [publicCommunities, privateCommunities],
  );
  const userNeighborhoodCommunityId = useMemo(
    () => publicCommunities.find((c) => c.neighborhood === user?.neighborhood)?.id ?? null,
    [publicCommunities, user?.neighborhood],
  );
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<number[]>([]);
  // Initial pre-selection: when the user's neighborhood community resolves,
  // seed the picker with it (only if the seller hasn't touched the picker yet).
  const initializedFromNeighborhoodRef = useRef(false);
  useEffect(() => {
    if (initializedFromNeighborhoodRef.current) return;
    if (userNeighborhoodCommunityId !== null) {
      setSelectedCommunityIds([userNeighborhoodCommunityId]);
      initializedFromNeighborhoodRef.current = true;
    }
  }, [userNeighborhoodCommunityId]);
```

Make sure the imports at the top of SellWizard.tsx include `useMemo`, `useState`, `useRef`, `useEffect` from React. Check:

```bash
grep -n "^import.*react\b\|from \"react\"" /Users/kevinzhao/Documents/CodingProject/Cosello/frontend/src/features/sell-wizard/SellWizard.tsx | head -2
```

If any are missing, add to the existing React import.

- [ ] **Step 5: Rewrite the single-listing submit's communities field**

In `frontend/src/features/sell-wizard/SellWizard.tsx:524-530`, replace:

```ts
      formData.append("data", JSON.stringify(postData));
      // Include the user's neighborhood community id so it is explicitly
      // attached. The backend also auto-attaches it (PR 1 defense-in-depth).
      formData.append(
        "communities",
        userNeighborhoodCommunityId !== null ? String(userNeighborhoodCommunityId) : "",
      );
```

with:

```ts
      formData.append("data", JSON.stringify(postData));
      // Seller's community picks from the PickupStep picker (PR 3). Capped to
      // 3 client-side; backend re-validates cap + membership.
      formData.append("communities", selectedCommunityIds.join(","));
```

- [ ] **Step 6: Rewrite the bulk-listing submit's communities field**

In `frontend/src/features/sell-wizard/SellWizard.tsx:619-626`, replace:

```ts
          formData.append("data", JSON.stringify(productData));
          // Include the user's neighborhood community id (same as single-post).
          formData.append(
            "communities",
            userNeighborhoodCommunityId !== null ? String(userNeighborhoodCommunityId) : "",
          );
```

with:

```ts
          formData.append("data", JSON.stringify(productData));
          // Bulk items share one community selection from PickupStep.
          formData.append("communities", selectedCommunityIds.join(","));
```

- [ ] **Step 7: Update the `useCallback` dep array around line 546**

In `frontend/src/features/sell-wizard/SellWizard.tsx`, the callback that wraps single-listing submission has dependency:

```ts
}, [productDetails, uploadedImages, isAuthenticated, segmentation, postPickupLocation, userNeighborhoodCommunityId, actions, onPosted, onRequestSignIn]);
```

Replace `userNeighborhoodCommunityId` with `selectedCommunityIds`:

```ts
}, [productDetails, uploadedImages, isAuthenticated, segmentation, postPickupLocation, selectedCommunityIds, actions, onPosted, onRequestSignIn]);
```

If there's a similar dep array for the bulk-submit callback, update it the same way.

- [ ] **Step 8: Remove the auto-tag badge derivation**

In `frontend/src/features/sell-wizard/SellWizard.tsx` around line 985-998, find the `neighborhoodCommunityName` derivation passed into `SingleListingForm`:

```ts
            publicCommunities.find((c) => c.neighborhood === user?.neighborhood)?.name ?? null
```

Search for the surrounding context — the value is passed as a prop. Delete the entire prop assignment line. If `neighborhoodCommunityName` is a parameter on `SingleListingForm`, also remove it from the destructure + interface (next step covers this).

- [ ] **Step 9: Remove the "Auto-tagged to" badge JSX**

In `frontend/src/features/sell-wizard/SellWizard.tsx:1189-1197`, delete the entire block:

```tsx
      {neighborhoodCommunityName && (
        <div className="flex items-center gap-2 py-2 px-3 rounded-md bg-primary-soft border border-primary/20 text-xs text-body">
          <MapPin className="size-3.5 text-primary shrink-0" />
          <span>
            Auto-tagged to <strong className="text-ink">{neighborhoodCommunityName}</strong>
            <span className="text-muted ml-1">(default — your neighborhood)</span>
          </span>
        </div>
      )}
```

Also remove `neighborhoodCommunityName` from the `SingleListingForm` props interface and destructure. Then remove the now-unused `MapPin` import if nothing else uses it (run typecheck to find dangling imports).

- [ ] **Step 10: Typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: both PASS. Fix any unused-import errors flagged by tsc.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "$(cat <<'EOF'
feat(sell-wizard): selectedCommunityIds state replaces auto-tag

The wizard now tracks selectedCommunityIds: number[] at its root,
shared across single and bulk submission paths. The picker UI lands
in PickupStep (Task 7); this commit wires the data flow. Removes the
"Auto-tagged to {neighborhood}" info badge added in PR #15 — the
upcoming interactive picker supersedes it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend — PickupStep gets the community picker

**Files:**
- Modify: `frontend/src/features/sell-wizard/steps/PickupStep.tsx` (rewrite)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx` (pass new PickupStep props)

The headline rewrites to "Where are you selling?". Below the pickup input, a chip-toggle row picks up to 3 communities. Neighborhood pre-selected. Counter below. Empty state when user has zero memberships.

- [ ] **Step 1: Rewrite `PickupStep.tsx` with the picker**

Replace the entire contents of `frontend/src/features/sell-wizard/steps/PickupStep.tsx`:

```tsx
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Loader2 } from "lucide-react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface CommunityOption {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface PickupStepProps {
  bulkPickupLocation: string;
  bulkItemsCount: number;
  isPostingBulk: boolean;
  isAuthenticated: boolean;
  onChange: (value: string) => void;
  onPost: () => void;
  // PR 3 — community picker:
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
}

const MAX_COMMUNITIES = 3;

export function PickupStep({
  bulkPickupLocation,
  bulkItemsCount,
  isPostingBulk,
  isAuthenticated,
  onChange,
  onPost,
  availableCommunities,
  selectedCommunityIds,
  onToggleCommunity,
  userNeighborhood,
}: PickupStepProps) {
  const atCap = selectedCommunityIds.length >= MAX_COMMUNITIES;
  const hasAny = availableCommunities.length > 0;

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <h2 className="text-xl font-extrabold text-ink leading-tight tracking-tight">
        Where are you selling?
      </h2>

      <div>
        <label htmlFor="bulk-pickup-location" className="text-xs text-muted uppercase tracking-wider">
          Pickup location
        </label>
        <Input
          id="bulk-pickup-location"
          value={bulkPickupLocation}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Lower East Side, NYC"
          maxLength={200}
          className="mt-1"
        />
        <p className="text-[10px] text-muted-soft mt-1.5 leading-relaxed">
          Your address will not be shared until pickup is confirmed.
        </p>
      </div>

      <div>
        <label className="text-xs text-muted uppercase tracking-wider">Communities</label>
        {hasAny ? (
          <>
            <p className="text-[10px] text-muted-soft mt-1.5 mb-2 leading-relaxed">
              Up to {MAX_COMMUNITIES} community chips will surface on your listing.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableCommunities.map((c) => {
                const on = selectedCommunityIds.includes(c.id);
                const isMyNbhd = !!userNeighborhood && c.neighborhood === userNeighborhood;
                const disabled = !on && atCap;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onToggleCommunity(c.id)}
                    disabled={disabled}
                    aria-pressed={on}
                    className={[
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                      on
                        ? "bg-primary text-on-primary border-primary hover:bg-primary-hover"
                        : "bg-canvas text-ink border-hairline hover:bg-surface-soft",
                      disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer",
                      FOCUS_RING,
                    ].join(" ")}
                  >
                    {c.is_public === false && <span aria-hidden>🔒</span>}
                    <span>{c.name}</span>
                    {isMyNbhd && (
                      <span className="text-[9px] uppercase tracking-wider opacity-70 font-bold">
                        my nbhd
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p
              className={[
                "text-[10px] mt-2 tabular-nums",
                atCap ? "text-primary font-semibold" : "text-muted",
              ].join(" ")}
            >
              {selectedCommunityIds.length} of {MAX_COMMUNITIES} selected
              {atCap && " · tap an active chip to swap"}
            </p>
          </>
        ) : (
          <div className="mt-1.5 px-3 py-3 rounded-md border border-dashed border-hairline bg-surface-soft text-xs text-muted leading-relaxed">
            No communities yet — this listing will post to the public marketplace.
            <br />
            Join a community (or set your neighborhood) to tag future listings.
          </div>
        )}
      </div>

      <Button
        onClick={onPost}
        disabled={isPostingBulk}
        className={`w-full disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
      >
        {isPostingBulk ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isAuthenticated ? (
          `Post all (${bulkItemsCount})`
        ) : (
          "Sign in to Post"
        )}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the new props from SellWizard into PickupStep**

In `frontend/src/features/sell-wizard/SellWizard.tsx`, find where `<PickupStep ... />` is rendered. Add the four new props from Task 6's state:

```bash
grep -n "<PickupStep" /Users/kevinzhao/Documents/CodingProject/Cosello/frontend/src/features/sell-wizard/SellWizard.tsx
```

At that JSX site, add:

```tsx
        availableCommunities={availableCommunities}
        selectedCommunityIds={selectedCommunityIds}
        onToggleCommunity={(id) => {
          setSelectedCommunityIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
          );
        }}
        userNeighborhood={user?.neighborhood ?? null}
```

Place these alongside the existing props (`bulkPickupLocation={...}`, etc.).

- [ ] **Step 3: Typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: both PASS.

- [ ] **Step 4: Smoke-test the picker (dev server)**

Start the dev server (`npm run dev -- --host` from `frontend/`). On phone or laptop:

1. Sign in.
2. Tap Sell → walk to the Pickup step (last step).
3. Confirm headline reads "Where are you selling?".
4. Confirm your neighborhood community is pre-selected (green chip with "MY NBHD" annotation).
5. Tap two more chips. Counter reads "3 of 3 selected · tap an active chip to swap". Remaining chips grey out.
6. Tap an active chip to deselect — greyed chips become tappable again.
7. Post the listing. Reload marketplace and verify the listing shows the 3 chips.

If the user has zero memberships, confirm the empty-state notice renders instead of the chip row.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/sell-wizard/steps/PickupStep.tsx frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "$(cat <<'EOF'
feat(sell-wizard): community chip picker in PickupStep

Headline rewrites to "Where are you selling?" — covers pickup + the
new picker. Chip toggles, cap of 3, neighborhood pre-selected with
"MY NBHD" annotation, private communities show a 🔒 prefix. Counter
shows "N of 3 selected", shifts to primary when at cap. Empty state
renders when the user has no memberships.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all 7 commits land, run the full check from the repo root:

- [ ] **Backend tests**

```bash
cd backend && pytest -v 2>&1 | tail -10
```

Expected: all PASS, including the new `test_listing_create.py` tests and the `test_mine_with_neighborhood_endpoint_deleted` assertion.

- [ ] **Frontend typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: clean.

- [ ] **Grep audit — confirm zero pseudo-tag references remain**

```bash
grep -rn '"neighborhood"' backend/main.py backend/routers/communities.py frontend/src/App.tsx frontend/src/features/sell-wizard/ frontend/src/components/MarketplaceSidebar.tsx | grep -v "neighborhood.*=" | grep -v "from.*neighborhood" | head -10
```

Expected: empty (all `"neighborhood"` literal string comparisons are gone; dict keys + import paths still legitimately use the word). If any legitimate match shows, eyeball it.

- [ ] **Open PR**

```bash
git push -u origin chore/neighborhood-default-community-cutover
gh pr create --base dev --head chore/neighborhood-default-community-cutover \
  --title "feat(communities): PR 3 cutover — seller-driven community picker + pseudo-tag strip" \
  --body "$(cat <<'EOF'
## Summary

Completes the neighborhood-as-default-community feature shipped in PR #15. Removes the legacy `"neighborhood"` pseudo-tag scaffolding (~10 sites in `main.py` + the `/mine-with-neighborhood` endpoint) and replaces the sell wizard's static auto-tag badge with an interactive community picker (cap of 3, neighborhood pre-selected, deselectable).

Spec: `docs/superpowers/specs/2026-05-25-neighborhood-default-community-pr3-cutover-design.md`

## Behavior changes

- **Public listings no longer auto-attach the seller's full membership graph.** They now carry only what the seller picked in the picker (0–3). Previous behavior was an unintentional broadcast across every community the seller belonged to.
- **Old listings with `["neighborhood"]` in their communities JSON** keep their data but stop matching the neighborhood-community filter chip and drop one ranking tier. Accepted tradeoff — no backfill migration.
- **`/api/communities/mine-with-neighborhood` is gone.** Frontend now uses `/api/communities/mine` and splits client-side via `is_public`.

## Test plan

- [x] Backend `pytest -v` clean (new `test_listing_create.py` + `test_neighborhood_community.py::test_mine_with_neighborhood_endpoint_deleted`)
- [x] Frontend `npx tsc --noEmit` clean
- [x] Frontend `npm run build` clean
- [ ] Smoke: sell wizard picker pre-selects neighborhood; cap of 3 enforced; bulk shares one selection
- [ ] Smoke: marketplace filter chip narrows results correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
