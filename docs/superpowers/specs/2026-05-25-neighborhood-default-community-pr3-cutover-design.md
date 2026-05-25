# Neighborhood-Default-Community — PR 3 Cutover Design

**Date:** 2026-05-25
**Branch:** `chore/neighborhood-default-community-cutover`
**Predecessors:** PR #15 (`chore/neighborhood-default-community`) merged 2026-05-24

## Goal

Complete the cutover from the legacy `"neighborhood"` pseudo-tag scaffolding to fully real community memberships, AND add a seller-driven community picker to the sell wizard so the seller (not the system) chooses which identity signals to project on each listing.

## Motivation

PR #15 introduced real Cosello-system-owned community rows for each of the 43 Manhattan neighborhoods and auto-joined users into the community matching their `users.neighborhood` field. To keep #15 reviewable, it left the old `"neighborhood"` string pseudo-tag in place as a deprecation-period shim — listings created during that window still carry `["neighborhood"]` in `Listing.communities`, and `main.py` still has ~7 special-case branches for that string. PR 3 removes that shim entirely.

Beyond the cutover, PR 3 also introduces a *product-level* shift: instead of the system auto-tagging public listings with the seller's full membership graph, the seller explicitly picks (up to 3) communities per listing. This aligns with the CLAUDE.md thesis — communities are *identity signals projected on listings*, not market containers — and gives sellers explicit agency over which signals they attach.

## Architecture

No new tables. No new endpoints (one deletion). Communities-on-listings continues to be `Listing.communities` (a JSON array of community IDs). The wizard's existing auto-tag becomes a *pre-selected default* in a new interactive picker step inside `PickupStep`. Old listings retain whatever JSON they had — the BE just stops interpreting `"neighborhood"` as a special value, so old listings quietly stop matching the neighborhood-community filter chip (acceptable per scope decision below).

## Scope

**In scope (one PR):**
1. Backend strip — delete `/api/communities/mine-with-neighborhood`; remove ~7 pseudo-tag sites from `main.py`; add server-side validation (IDs must be int, user must be member, ≤3 per listing).
2. Frontend picker — chip-toggle UI in `PickupStep`, multi-select with hard cap of 3, neighborhood pre-selected and deselectable, shared across bulk items.
3. Type narrowing + dead-code removal — `selectedMarketCommunities: string[]` → `number[]` in `App.tsx`; sidebar `Community.id: string | number` → `number`; remove the `mine-with-neighborhood` defensive filter in `App.tsx:fetchFilterCommunities`; switch fetch URL to `/api/communities/mine`.

**Out of scope (explicitly deferred):**
- DB migration to rewrite legacy `["neighborhood"]` in old listings. Old listings keep their literal strings; the BE just ignores them. Tradeoff: old listings won't match the neighborhood filter post-cutover.
- Re-pick prompt for users with `neighborhood = NULL`. Defensive path; the PR #15 backfill check found zero such users. Will be added if/when a NULL user is observed.
- Marketplace listing-card UI changes (chip stacking on cards already works since `Listing.communities` has always been an array).
- The pre-existing mobile hamburger nav bug (Radix DropdownMenu items not rendering on iOS Safari). Tracked in `project_queued_brainstorms.md`.

## Backend changes

### 1. Delete `/api/communities/mine-with-neighborhood`

**File:** `backend/routers/communities.py:234-263`

Remove the entire route handler. The FE switches to `/api/communities/mine`, which already returns `{ public: Community[], private: Community[] }` minus the synthetic pseudo-id entry that the deleted endpoint inserted.

### 2. Strip `"neighborhood"` pseudo-tag from `main.py`

Seven sites need surgery:

**(a) Listing-creation parse** (`main.py:1088-1099`)

```python
# BEFORE
if part == "neighborhood":
    community_ids.append("neighborhood")
elif part:
    try:
        community_ids.append(int(part))
    except ValueError:
        pass

# AFTER
if part:
    try:
        community_ids.append(int(part))
    except ValueError:
        pass  # silently drop non-int values
```

**(b) Public-listing auto-attach** (`main.py:1101-1113`) — **biggest behavior change**

Currently, when `visibility == "public"`, the code DISCARDS the seller's input and replaces `community_ids` with `["neighborhood"] + all_user_memberships`. After PR 3, public listings honor the seller's picked IDs.

```python
# BEFORE
if visibility == "public":
    community_ids = []
    if current_user.neighborhood:
        community_ids.append("neighborhood")
    memberships = db.query(CommunityMember).filter(
        CommunityMember.user_id == current_user.id
    ).all()
    for m in memberships:
        comm = db.query(Community).filter(Community.id == m.community_id).first()
        if comm:
            community_ids.append(comm.id)

# AFTER
if visibility == "public":
    # Honor the seller's picks. Validate each ID below.
    pass  # community_ids already populated from the parse step
```

**(c) Cap + membership validation** — applies to BOTH public and private listings

```python
if len(community_ids) > 3:
    raise HTTPException(status_code=400, detail="At most 3 communities per listing")

for cid in community_ids:
    comm = db.query(Community).filter(Community.id == cid).first()
    if not comm:
        raise HTTPException(status_code=400, detail=f"Community {cid} not found")
    is_member = db.query(CommunityMember).filter(
        CommunityMember.community_id == cid,
        CommunityMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=400, detail=f"You are not a member of community {cid}")
```

**(d) Private-visibility extra rules** (`main.py:1114-1127`)

Drop the `if cid == "neighborhood"` rejection branch (parser already drops the string). Keep "must have at least one community" + "all must be private" rules.

**(e) Visibility inference** (`main.py:1285-1296`)

```python
# BEFORE
if nc == "neighborhood" or (isinstance(nc, int) and nc in all_public_ids):
    return "public"

# AFTER
if isinstance(nc, int) and nc in all_public_ids:
    return "public"
```

Listings whose communities array contains only legacy `"neighborhood"` strings will fall through to the "no recognized communities → default public" branch.

**(f) Tier ranking** (`main.py:1312-1329`)

```python
# BEFORE
for c in listing.get("communities", []):
    nc = _ncid(c)
    if nc == "neighborhood":
        poster = poster_map.get(listing.get("userId"))
        if poster and my_neighborhood and poster.neighborhood == my_neighborhood:
            return 2
    elif isinstance(nc, int) and nc in my_community_ids:
        return 2

# AFTER
for c in listing.get("communities", []):
    nc = _ncid(c)
    if isinstance(nc, int) and nc in my_community_ids:
        return 2
```

Old listings drop from tier-2 to tier-3 (other public). Accepted tradeoff.

**(g) Community filter parsing** (`main.py:1331-1354`)

Drop the `if part == "neighborhood"` filter branch. The frontend will only send numeric IDs.

**(h) Seed test endpoint** (`main.py:136`)

```python
# BEFORE
communities=json.dumps(["neighborhood"]),

# AFTER
communities=json.dumps(
    [get_neighborhood_community(db, current_user.neighborhood).id]
    if current_user.neighborhood else []
),
```

### 3. Validation behavior summary

| Visibility | Min communities | Max communities | Membership required | Each community must be |
|---|---|---|---|---|
| Public  | 0 | 3 | Yes (for any picked) | Anything (public or private) |
| Private | 1 | 3 | Yes | Private only |

## Frontend changes

### 1. New community picker in `PickupStep`

**File:** `frontend/src/features/sell-wizard/steps/PickupStep.tsx`

UI: chip-toggle row beneath the pickup input. Step headline rewritten to **"Where are you selling?"** (single prompt, no subtitle — covers both pickup location and community projection).

Per chip:
- Community name as the chip label.
- If the chip is the user's neighborhood community, a small `MY NBHD` annotation appears alongside the name.
- If the chip is a private community, a 🔒 prefix appears.
- Active state: solid `bg-primary` fill, `text-on-primary` label.
- Inactive state: `bg-canvas` with `border-hairline`.
- Disabled state: `opacity-35`, `pointer-events-none`. Triggered when 3 chips already selected AND this chip is NOT in the selection.

Below the chip row, a tiny counter:
- "1 of 3 selected"
- At cap: "3 of 3 selected · tap an active chip to swap" (text color shifts to `text-primary`).

Empty case (user has zero memberships): the chip row is replaced by a static notice:
> "No communities yet — this listing will post to the public marketplace.
> Join a community (or set your neighborhood) to tag future listings."

### 2. Wizard data flow

**File:** `frontend/src/features/sell-wizard/SellWizard.tsx`

- Add a new prop `privateCommunities: Community[]` (parallel to existing `publicCommunities`).
- Add wizard-level state: `selectedCommunityIds: number[]` (lives at the wizard root so it's shared across all bulk items).
- On wizard mount, derive the pre-selection: if `publicCommunities[i].neighborhood === user.neighborhood`, set `selectedCommunityIds = [that_community.id]`.
- Pass `selectedCommunityIds`, `setSelectedCommunityIds`, and a merged `availableCommunities = [...publicCommunities, ...privateCommunities]` down to `PickupStep`.
- On submit, `formData.append("communities", selectedCommunityIds.join(","))` for BOTH single and bulk endpoints.

### 3. Remove the legacy auto-tag UI

**File:** `frontend/src/features/sell-wizard/SellWizard.tsx`

Delete the "Auto-tagged to {neighborhood}" badge from `SingleListingForm` (added in PR #15). The interactive picker replaces it.

### 4. Marketplace filter chip-state type narrowing

**File:** `frontend/src/App.tsx`

- `useState<string[]>([])` for `selectedMarketCommunities` → `useState<number[]>([])`. Line 117.
- Update the toggle handler to take `number` not `string`. Line ~117 region + wherever the toggle is wired in the sidebar.
- Update `params.set("community", selectedMarketCommunities.join(","))` — same call signature, `Array<number>.join(",")` still produces a comma-separated string.

**File:** `frontend/src/components/MarketplaceSidebar.tsx:14`

- Narrow local `Community = { id: string | number; ... }` to `id: number`.

### 5. Defensive-code removal + response-shape adaptation

**File:** `frontend/src/App.tsx`, `fetchFilterCommunities` (lines 621-638)

- Switch URL: `/api/communities/mine-with-neighborhood` → `/api/communities/mine`.
- **Response shape adapts.** `/mine` returns a flat `CommunityOut[]`, not the `{ public, private }` split that `/mine-with-neighborhood` returned. App.tsx splits client-side:

  ```ts
  const all: CommunityOut[] = await res.json();
  setPublicCommunities(all.filter(c => c.is_public));
  setPrivateCommunities(all.filter(c => !c.is_public));
  ```

- Delete the inline filter `.filter((c: { id: string | number }) => c.id !== "neighborhood")` — no longer needed since `/mine` never had the pseudo-id entry.
- Remove the surrounding `typeof data.public = …` workaround.

**Note:** `/api/communities/mine` is also consumed by `MyAccountPage:601` (as a flat list, unchanged). Both consumers now read the same flat-list shape — no contract drift.

### 6. App.tsx → SellWizard prop wiring

**File:** `frontend/src/App.tsx:1377`

```tsx
<SellWizard
  ref={sellWizardRef}
  categorySchemas={categorySchemas}
  isActive={true}
  mode={newListingMode}
  photosOnly={newListingMode === "manual"}
  publicCommunities={publicCommunities}
  privateCommunities={privateCommunities}  // NEW
  ...
/>
```

## User-facing behavior changes

1. **Sell wizard's final step is now a community picker, not just pickup.** Step headline: "Where are you selling?". Pickup input remains. Below it, the chip picker.
2. **Public listings no longer carry the seller's full membership graph.** They carry only what the seller picked (0–3). This is the most significant behavior change in the PR. Sellers who were used to "every community I'm in is on every listing" will see only their picks.
3. **Old listings stop matching the neighborhood filter chip.** They still show in the public marketplace, just without identity tags. They drop one tier in ranking (tier-2 → tier-3). Listings posted after this PR work normally.
4. **Listings can now be public with zero communities.** Previously the auto-attach always added at least one community. Now sellers can deselect everything for an "anonymous" public listing.

## Testing strategy

### Backend
- `test_listing_creation.py` (new or extend): assert public listings carry exactly the seller's picked IDs (no auto-attach); cap-of-3 enforced; non-member community ID rejected with 400; private listings still require ≥1 private community.
- `test_marketplace_filter.py` (existing): assert filtering by a numeric community ID still narrows results. The `"neighborhood"` filter branch is gone; old listings won't match.
- `test_neighborhood_community.py` (existing, extend): assert `/mine-with-neighborhood` returns 404 after deletion.
- Migration test: not needed (no migration).

### Frontend
- `npm run typecheck` clean (forces the narrowed types to compile cleanly).
- Sell wizard smoke: picker pre-selects user's neighborhood; tap to deselect works; tap up to 3, others grey out; tap an active chip → counter decrements, greyed chips reactivate.
- Marketplace filter smoke: tap a community chip, results narrow; remove chip, results widen.

### Manual phone smoke
- Edit Profile → change neighborhood (regression check: PR #15 modal flow still works).
- Sell a single listing → picker shows in PickupStep → publish with 1 community → verify card shows the chip on marketplace.
- Sell a bulk listing → picker pick of 2 → publish → all bulk items carry the same 2 community tags.

## Order of operations

Single PR, sequenced as commits for reviewability:

1. **Backend strip + new validation** — `main.py` ~7 sites, `routers/communities.py` route deletion. Tests updated in the same commit so CI passes.
2. **Frontend type narrowing + dead-code removal** — `App.tsx` `selectedMarketCommunities: number[]`, sidebar `Community.id: number`, defensive filter removal, endpoint URL switch. Pure type/cleanup commit.
3. **Sell wizard prop wiring** — `App.tsx:1377` passes `privateCommunities`. `SellWizard.tsx` accepts the new prop, adds `selectedCommunityIds` state, removes the auto-tag badge. No UI yet.
4. **PickupStep picker UI** — chip toggles, counter, empty state, headline rewrite. Wires into `selectedCommunityIds`.

Independent enough that 1 and 2 can land separately; 3 needs 1's BE behavior to be valid (else the wizard's payloads get rejected by the still-old auto-attach logic). 4 is the visible UX change.

## References

- Spec PR #15: `docs/superpowers/specs/2026-05-24-neighborhood-default-community-design.md`
- PR #15 plans:
  - `docs/superpowers/plans/2026-05-24-neighborhood-default-community-pr1-backend.md`
  - `docs/superpowers/plans/2026-05-24-neighborhood-default-community-pr2-frontend.md`
- HTML mockup of PickupStep states: `/tmp/cosello-pickup-step-mockup.html` (preview only, not committed)
- CLAUDE.md product thesis: "communities are NOT market containers; they are identity and trust layers overlaid on listings"
