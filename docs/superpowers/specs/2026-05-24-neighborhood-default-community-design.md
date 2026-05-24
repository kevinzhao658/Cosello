# Neighborhood Default Community — Design Spec

**Date:** 2026-05-24
**Branch:** `chore/neighborhood-default-community` (cut from `dev`)
**Status:** Awaiting user review.

## Why this spec exists

Cosello already has substantial scaffolding for a neighborhood-as-community concept:
- `User.neighborhood` and `Community.neighborhood` columns exist on the schema.
- `Listing.communities` stores a `int | "neighborhood"` JSON array, with the literal string `"neighborhood"` acting as a pseudo-community-id resolved at render time via string comparison against `user.neighborhood`.
- Listing creation auto-attaches the `"neighborhood"` pseudo-tag to every public listing.
- Marketplace ranking tier-2 already favors same-neighborhood listings.
- Onboarding gates on `user.neighborhood` being set.
- A virtual `{id: "neighborhood", name: "My Neighborhood"}` entry appears in `GET /api/communities/mine-with-neighborhood`.

But the neighborhood community isn't a real community — it's a pseudo-tag. No Community row exists for "Chinatown"; no member list; no dedicated page; no real-community trust signal mechanic. This spec promotes the neighborhood from a pseudo-tag to a real, first-class community while removing every trace of the pseudo-tag mechanism so we don't accumulate legacy debt.

## Goals

1. Auto-create real `Community` rows for each Manhattan neighborhood (~50 pre-seeded from a curated list).
2. Auto-join users to their neighborhood's community whenever `user.neighborhood` is set or changed.
3. Allow users to leave their neighborhood community (privacy escape hatch) without losing the listing-attachment behavior.
4. Surface neighborhood communities as publicly browsable (anyone can view; only matching-neighborhood users can join).
5. Replace the freeform `neighborhood` text input at onboarding with a curated picker.
6. Full cutover from the pseudo-tag mechanism — listing-creation, marketplace filter, visibility/tier logic, and the special-named endpoint all drop their `"neighborhood"` string special-cases. Backfill migration rewrites old listings.

## Non-goals

- Scaling beyond Manhattan in this PR (curated list is Manhattan-only; spec is structured so additional cities can be added later by extending the constants list).
- Address-derived neighborhoods (no geocoding integration).
- Per-neighborhood community moderation features (no admin tools beyond the standard public-community behavior).
- Friend-of-friend graph extensions tied to neighborhood (out of scope).
- Dark mode / color-blind modes (separate queued brainstorm).

---

## Section 1 — Data model + system bootstrap

### System user

Create one special user row (deterministic id, e.g., `'00000000-0000-0000-0000-000000000001'`, display_name `"Cosello"`) via an Alembic migration. This user:
- Cannot authenticate (no auth path provisions it).
- Cannot post listings (server-side guard rejects).
- Doesn't appear in friend search (filter out in `friends.py`).
- Owns every pre-seeded neighborhood Community via the `created_by` FK.

Adding a guard at every "post listing" or "send friend request" path is annoying; alternative: a single helper `is_system_user(user_id) -> bool` checked at relevant entry points. Spec accepts the small fan-out cost.

### Pre-seeded Community rows

Same migration inserts one Community per neighborhood from a curated list, sourced from NYC OpenData neighborhood tabulation areas (NTAs). The list lives in `backend/constants/neighborhoods.py` as a Python list of canonical strings. The migration reads this list and inserts:

```python
Community(
    name=canonical_name,
    neighborhood=canonical_name,
    is_public=True,
    invite_code=generate_invite_code(),  # required by schema; unused for these
    created_by=SYSTEM_USER_ID,
    description=None,
    image=None,
)
```

Per-neighborhood images are out of scope; can be added later via an admin tool.

### Neighborhood → community lookup

Add a helper:

```python
def get_neighborhood_community(db: Session, neighborhood_name: str) -> Community | None:
    if not neighborhood_name:
        return None
    return (
        db.query(Community)
        .filter(
            Community.neighborhood == neighborhood_name,
            Community.is_public.is_(True),
            Community.created_by == SYSTEM_USER_ID,
        )
        .first()
    )
```

The `created_by == SYSTEM_USER_ID` filter ensures we only match auto-created neighborhood communities, not user-created communities that happen to share the neighborhood name.

### Files affected

- `backend/migrations/<timestamp>_create_system_user_and_neighborhood_communities.py` (new Alembic migration).
- `backend/constants/neighborhoods.py` (new — the canonical list).
- `backend/db_helpers.py` or similar (new helper function).

---

## Section 2 — Membership lifecycle

### Auto-join on set/change

The endpoint that sets `user.neighborhood` (likely `PATCH /api/me` or the equivalent profile-update path) gains the following transactional logic:

```python
def set_user_neighborhood(db, user, new_neighborhood: str | None):
    old_neighborhood = user.neighborhood
    if old_neighborhood == new_neighborhood:
        return  # no-op

    # 1. Remove old membership if applicable
    if old_neighborhood:
        old_community = get_neighborhood_community(db, old_neighborhood)
        if old_community:
            db.query(CommunityMember).filter(
                CommunityMember.user_id == user.id,
                CommunityMember.community_id == old_community.id,
            ).delete()

    # 2. Set new value
    user.neighborhood = new_neighborhood

    # 3. Add new membership if applicable
    if new_neighborhood:
        new_community = get_neighborhood_community(db, new_neighborhood)
        if new_community:
            db.add(CommunityMember(
                user_id=user.id,
                community_id=new_community.id,
                role="member",
            ))

    db.commit()
```

Wrap in a transaction so a half-applied change can't strand a user.

### Validation

The endpoint validates the incoming `new_neighborhood` against the curated list. Off-list values are rejected with a 400. (The picker UI only ever submits canonical names; this is defense-in-depth.)

### Manual leave (privacy escape hatch)

The existing community-leave endpoint already handles deleting a `CommunityMember` row. No special-case logic for neighborhood communities — the user just leaves, their `user.neighborhood` stays set, future listings still auto-attach to that community (Section 5A), but they don't appear in the member list.

### Rejoin

User navigates to the Chinatown community page (publicly browsable per Section 4) and clicks "Join". The existing join endpoint validates that the user's `user.neighborhood == community.neighborhood` — if so, adds the CommunityMember row. If not, rejects with a 403 ("you can only join your own neighborhood's community").

### Files affected

- `backend/routers/auth.py` or `backend/routers/profile.py` — the endpoint that updates `user.neighborhood`.
- `backend/routers/communities.py` — the join endpoint adds the `user.neighborhood == community.neighborhood` guard for neighborhood communities.

---

## Section 3 — API surface changes

### Delete `/api/communities/mine-with-neighborhood`

Endpoint becomes redundant — the user's neighborhood community now naturally appears in their `CommunityMember` list. FE caller at `App.tsx:624` updates to use the plain `/api/communities/mine` endpoint. **No alias, no deprecation period — single PR delete.**

If `/api/communities/mine` doesn't yet expose the public/private partition that `mine-with-neighborhood` returned, extend it to do so. Either way, one endpoint, no special handling.

### Extend the user-update endpoint

Whichever endpoint owns `PATCH /api/me`-style updates (write to `user.neighborhood`) gains the membership-swap logic from Section 2.

### New endpoint: `GET /api/communities/neighborhoods`

Returns the curated list of canonical neighborhood names as a JSON array of strings. Used by the FE onboarding picker. Sourced from the same `backend/constants/neighborhoods.py` the migration uses, so picker options and pre-seeded communities stay in lockstep.

### Existing community endpoints — no change

`GET /api/communities/{id}` returns the same shape for neighborhood communities as any other. Member list, description, image, etc. all flow through unchanged.

---

## Section 4 — Frontend changes

### A. Onboarding picker

Today's onboarding (gated by `AuthContext.needsOnboarding`) uses a freeform text input for `neighborhood`. Replace with a `<Combobox>` / typeahead dropdown fed by `GET /api/communities/neighborhoods`:
- User starts typing → filter the list.
- Click to select → submits the canonical name.
- Cannot proceed without picking from the list.

### B. App.tsx + AuthContext cleanup

Drop the `"neighborhood"` pseudo-id special-case branches:
- `App.tsx:130-131` — the `publicCommunities` / `privateCommunities` state types currently allow `id: string | number` because of `"neighborhood"`. After this PR, `id` is always `number`.
- `App.tsx:673` — `selectedMarketCommunities.includes("neighborhood")` branch goes away; the filter uses the real community id.
- `App.tsx:678` — `params.set("neighborhood", user.neighborhood)` is unnecessary; the real community id carries the filter context.
- `App.tsx:624` — call `/api/communities/mine` instead of `/api/communities/mine-with-neighborhood`.

### C. Marketplace filter

When the user selects their neighborhood from the marketplace's community filter, the FE sends `community=<neighborhood_community_id>` (numeric) like any other community filter. No more `community=neighborhood&neighborhood=Chinatown`.

### D. Sell wizard community selector

Today the sell wizard shows a list of communities the user is a member of. Pre-check the user's neighborhood community by default and render it as non-removable. UX cue: a small "(default for your neighborhood)" annotation. Mirrors the backend auto-attach behavior so the user sees where their listing will appear without surprise.

### E. Profile / Settings neighborhood-change flow

User can change their neighborhood in profile settings via the same curated picker. Before saving, show a confirmation modal:

> "You'll leave the [old neighborhood] community and join [new neighborhood]. Your existing listings stay tagged to [old neighborhood]."

The "existing listings stay tagged" claim is true because `Listing.communities` is computed at posting time, not at view time (Section 5A confirms this).

### F. Dedicated community page

`GET /api/communities/{id}` already returns the data needed to render a community detail surface. The FE Communities tab in MyAccount currently lists user-joined communities; clicking one should open the community detail view that already exists. Verify it works for a neighborhood community (same Community shape — should "just work").

### Files affected

- `frontend/src/pages/SignUpPage.tsx` — the onboarding completion form (entered from `App.tsx:1262-1271`). Replace the neighborhood text input here with the curated picker.
- `frontend/src/App.tsx` — multiple sites (see B).
- `frontend/src/contexts/AuthContext.tsx` — if it has pseudo-id handling.
- `frontend/src/features/sell-wizard/` — the community selector.
- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — profile-settings neighborhood input + confirmation modal.

---

## Section 5 — Full cutover migration (zero legacy debt)

### A. Listing creation cutover

`main.py:1102-1106` becomes:

```python
if visibility == "public":
    community_ids = []
    if current_user.neighborhood:
        nbhd_community = get_neighborhood_community(db, current_user.neighborhood)
        if nbhd_community:
            community_ids.append(nbhd_community.id)
    memberships = db.query(CommunityMember).filter(
        CommunityMember.user_id == current_user.id,
    ).all()
    for m in memberships:
        comm = db.query(Community).filter(Community.id == m.community_id).first()
        if comm and comm.id not in community_ids:  # de-dupe
            community_ids.append(comm.id)
```

New listings store ONLY integer community IDs. No more `"neighborhood"` string in any newly-written `Listing.communities` JSON array.

### B. One-time backfill migration

A second Alembic migration (separate from the bootstrap migration in Section 1 so the system user and pre-seeded communities exist before the backfill runs). For every `Listing` whose `communities` JSON contains the literal `"neighborhood"`:

1. Parse the JSON array.
2. Look up the poster's `user.neighborhood`.
3. Find the matching pre-seeded Community via `get_neighborhood_community(...)`.
4. If found → replace `"neighborhood"` with `community.id` in the array.
5. If not found (poster's `user.neighborhood` is an off-list freeform string) → remove `"neighborhood"` from the array entirely.
6. Write the updated JSON back.

The migration is idempotent — re-running it on a backfilled DB does nothing because no listings still contain the literal `"neighborhood"`.

### C. Drop `main.py` string special-cases

- `_infer_visibility` (~line 1294) — drop the `nc == "neighborhood"` branch. A listing is "public" if any of its community IDs are in `all_public_ids`. The neighborhood community is a public community in `all_public_ids`, so the existing logic handles it without the special-case.
- `_tier` (~line 1323) — drop the `nc == "neighborhood"` branch. Tier-2 is now driven by `nc in my_community_ids` (the user's CommunityMember list, which now includes the neighborhood community).
- Marketplace filter (~lines 1338-1344) — drop the `part == "neighborhood"` branch. The FE sends a numeric community id; the existing `int(part)` path handles it.

### D. Existing-user re-pick prompt

Users whose `user.neighborhood` is set to an off-list string need a one-time prompt to re-pick. Implementation:

1. On user-fetch (e.g., `/api/me`), the backend compares `user.neighborhood` against the curated list and returns a new field `neighborhood_needs_repick: boolean`.
2. The FE checks this field on app load. If true, shows a one-time modal: *"We've updated how neighborhoods work — please pick yours from the list."*
3. Modal is dismissible (user can postpone), but the FE re-shows it on next app load until they pick.
4. After re-pick → `neighborhood_needs_repick` flips to false; they auto-join the new community; future listings tag correctly.

Their backfilled listings (where the tag was dropped because no match was found) stay un-tagged. They don't auto-backfill on re-pick — the user accepts this trade-off as the cost of clean state.

### E. Delete `/api/communities/mine-with-neighborhood`

Already covered in Section 3 — repeated here for migration completeness. The deletion lands in the same PR as the rest of Section 5.

### F. Final invariant

The mutual-community trust signal between neighbors keeps working — it just runs through real-community membership now instead of pseudo-tag string comparison. The literal string `"neighborhood"` stops being a community pseudo-id anywhere in the backend codebase. It survives only as the field NAME `neighborhood` on the User and Community models.

Grep-able acceptance criterion: `grep -rn '"neighborhood"' backend/ --include="*.py"` returns zero matches where the string is being used as a community-id value. The string surviving as a column name (e.g., `Community.neighborhood`) or in test fixtures is fine.

### Files affected

- `backend/main.py` — listing creation, `_infer_visibility`, `_tier`, marketplace filter (drop 4 special-case branches).
- `backend/routers/communities.py` — delete `my_communities_with_neighborhood` function + route.
- `backend/migrations/<timestamp>_backfill_listing_neighborhood_tags.py` — new Alembic migration.

---

## Approach to PR decomposition

This spec is intentionally one document. The implementation plan (writing-plans) should split into 2 or 3 PRs along these natural seams:

- **PR 1 — Backend foundation:** System user migration, pre-seeded neighborhood communities, `get_neighborhood_community` helper, membership-swap on `user.neighborhood` change, `GET /api/communities/neighborhoods` endpoint.
- **PR 2 — Frontend onboarding + sell flow + profile:** Curated picker UI, App.tsx + AuthContext cleanup, sell wizard pre-select, profile-settings change flow.
- **PR 3 — Cutover + cleanup:** Listing creation logic update, backfill migration, `main.py` special-case removal, delete `/api/communities/mine-with-neighborhood`, re-pick prompt, FE marketplace filter update.

PRs are ordered so each is independently deployable: PR 1 lands the new infrastructure without changing user-facing behavior; PR 2 surfaces the new UX; PR 3 cuts over and removes the legacy code. Writing-plans decides the final decomposition.

---

## Verification (acceptance criteria)

1. `cd backend && pytest` exits 0. New migrations apply cleanly to a fresh DB.
2. `cd frontend && npm run typecheck` exits 0. Build clean.
3. `grep -rn '"neighborhood"' backend/ --include="*.py"` returns zero matches where the string is used as a community-id value (only model field names + test fixtures may match).
4. Manual smoke on a fresh test account:
   - Onboarding shows the curated picker. Picking "Chinatown" auto-joins the user to the Chinatown community.
   - Sell wizard shows "Chinatown" pre-checked and non-removable for a public listing.
   - Posting a listing → `Listing.communities` JSON array contains the integer Chinatown id, no `"neighborhood"` string.
   - Marketplace community filter "Chinatown" returns the listing.
   - A second user with `user.neighborhood = "Chinatown"` views the listing → mutual-community trust signal "Chinatown" surfaces.
   - User changes their neighborhood in profile settings → confirmation modal shows; existing listings stay tagged to old neighborhood.
   - User leaves the neighborhood community manually → they disappear from the member list; future listings still auto-attach.
5. Backfill verification on staging: pick a sample of listings that contained `"neighborhood"` pre-deploy. After deploy, confirm those listings now contain the matching integer community id (or no tag at all if the poster's neighborhood was off-list).

---

## Tech debt deliberately left for future PRs

- **Per-neighborhood community images.** Pre-seeded communities have `image = None`. Admin upload tool or a curated set of images can come later. Doesn't block the feature.
- **Scaling beyond Manhattan.** The curated list in `backend/constants/neighborhoods.py` is Manhattan-only. Adding additional cities (Brooklyn, Queens, etc.) requires extending the list + running the seed migration for the new entries. No structural changes needed.
- **Dedicated neighborhood feed page (e.g., `/communities/chinatown`).** Today's community detail view works via the existing routes. A dedicated, polished neighborhood-only page (with custom layout, neighborhood hero, etc.) is a future enhancement.
- **Address-derived neighborhood detection.** The Google Maps integration from CLAUDE.md's backlog could power "we detected you're in [Chinatown] — confirm?" UX. Not in scope.
- **Cross-neighborhood discovery features.** Browsing other neighborhoods' feeds works today via the publicly browsable communities. A "discover other neighborhoods" landing surface (e.g., a map view of all Manhattan neighborhood communities) is a future enhancement.
- **Listing.communities backfill performance.** For a small Cosello DB (initial launch), the backfill migration iterates all listings synchronously — fine. At scale, a chunked or background migration may be needed; flagged for later.
