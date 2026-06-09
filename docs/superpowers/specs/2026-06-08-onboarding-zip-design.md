# Onboarding ZIP — Design

**Status:** Design — pending user review, then writing-plans.
**Date:** 2026-06-08
**Goal:** Ensure every user has a valid NYC ZIP so geotag distance works for everyone — required (auto-prefilled) at signup for new users, and derived-from-neighborhood + a confirm-banner for existing users.

**Context:** Geotag Phase 1/1.5 shipped (PR #48). Distance is computed from the buyer's ZIP centroid, but a diagnostic showed **258 of 263 accounts had no ZIP**, so distance silently no-ops for them. `SignUpPage` already collects a ZIP but it's **optional + free-text**; *neighborhood* is already required everywhere.

---

## Architecture (one sentence)

A static **neighborhood → representative ZIP** map (served via the existing `/neighborhoods` endpoint) drives both halves: new users' signup ZIP auto-prefills from their (already-required) neighborhood as a validated `NYC_ZIPS` dropdown; existing ZIP-less users get a ZIP derived from their neighborhood by a one-time backfill, flagged unconfirmed (`zip_confirmed = false`) so a dismiss-until-confirmed marketplace banner nudges them to confirm/refine it.

## Components

### 0. Shared: `neighborhood → ZIP` map
- A static mapping of all 43 `MANHATTAN_NEIGHBORHOODS` → one representative seeded ZIP (from `zip_centroids` / the 42 `NYC_ZIPS`). Lives in a backend constant (e.g. `backend/constants/neighborhood_zips.py`).
- `GET /neighborhoods` (routers/communities.py:104) is extended to return `[{ "name": str, "zip": str }]` (currently returns names only) so the frontend can prefill without duplicating the map. Backward compatible if the frontend reads `.name`.

### 1. Data model
- Add `User.zip_confirmed` `Boolean`, default `false`. Migration `0010_zip_confirmed.sql` (`ADD COLUMN IF NOT EXISTS zip_confirmed boolean NOT NULL DEFAULT false`).
- `zip_confirmed = true` means the user explicitly chose/accepted their ZIP. `false` means it's derived (or unset) → show the banner.
- `UserOut` / the frontend `AuthUser` type gain `zip_confirmed: boolean`.

### 2. New users — signup (required, auto-prefilled)
- `SignUpPage`: replace the optional free-text ZIP `Input` with a **required `NYC_ZIPS` dropdown** (reuse Phase 1.5's `NYC_ZIPS` / `NYC_ZIP_SET`).
- When the user selects their neighborhood, **auto-prefill** the ZIP to that neighborhood's representative ZIP (from the `/neighborhoods` payload). User can change it; if they re-pick the neighborhood and haven't manually overridden, re-prefill.
- Submit is **blocked until a valid ZIP is set** (the prefill satisfies it). The existing `PUT /api/auth/profile` call already sends `zip_code`; the backend sets `zip_confirmed = true` whenever `zip_code` is provided by an explicit profile write (signup/edit/banner all go through this).

### 3. Existing ZIP-less users — derive + confirm-banner
- **Derive (one-time backfill, run at deploy):** `backend/scripts/derive_user_zips.py` — for every user with no ZIP **and** a neighborhood, set `zip_code` from the `neighborhood → ZIP` map and leave `zip_confirmed = false`. Idempotent (only fills ZIP-less users; never overwrites an existing ZIP). *(This is the production-correct counterpart to the random test backfill already run.)*
- **Confirm-banner:** a banner at the **top of the marketplace**, shown when `user.zip_confirmed === false`. Copy ≈ "Confirm your ZIP code so we can show accurate distances." It surfaces the current (derived) ZIP in the `NYC_ZIPS` dropdown; confirming or changing it calls `PUT /api/auth/profile` with the ZIP → backend sets `zip_confirmed = true` → banner disappears.
  - Persists until confirmed (a "not now" collapses it for the session but it returns next session while `zip_confirmed` is false). Not permanently dismissible — the whole point is to get a confirmed ZIP.

### 4. Validation / plumbing
- `PUT /api/auth/profile`: when `zip_code` is present, **validate it exists in `zip_centroids`** (reject 400 "Enter a valid NYC ZIP code", same rule as `create_listing`) and set `zip_confirmed = true`. (Frontend only ever sends valid `NYC_ZIPS` values, but validate server-side as defense.)
- Reuse the existing `zip_code` save path; no new endpoint.

## Data flow

1. **New user** picks neighborhood → ZIP prefills (dropdown) → submit → `PUT /profile {zip_code}` → `zip_confirmed=true`. No banner.
2. **Existing user, deploy:** `derive_user_zips.py` sets ZIP from neighborhood, `zip_confirmed=false`.
3. **Existing user, next visit:** marketplace banner (because `zip_confirmed=false`) → confirm/refine in dropdown → `PUT /profile {zip_code}` → `zip_confirmed=true` → banner gone, distances accurate.

## Error handling / edge cases

- User with no neighborhood AND no ZIP (rare; predates required-neighborhood): derive backfill skips them (no neighborhood to map). They still get the banner (`zip_confirmed=false`) to set a ZIP directly.
- Neighborhood not in the map (shouldn't happen — map covers all 43): derive skips; banner covers them.
- Invalid ZIP submitted (shouldn't happen via dropdown): 400 from the validated `PUT /profile`.
- The banner reads `zip_confirmed` from the auth user; after a successful confirm, the auth user refetches/updates so the banner hides without a reload.

## Out of scope

- Changing the neighborhood requirement or the neighborhood→community logic.
- Browser-GPS / precise geocoding (that's geotag Phase 2 / Mapbox).
- Reconciling the random test-account backfill (test data; the derive script only touches ZIP-less users, so it won't disturb them).

## Testing / QA criteria

- New signup: ZIP dropdown required; prefills from neighborhood; can't submit without a valid ZIP; new user has `zip_confirmed=true`, sees no banner.
- `derive_user_zips.py`: idempotent; sets ZIP from neighborhood for ZIP-less users with a neighborhood; leaves `zip_confirmed=false`; doesn't overwrite existing ZIPs.
- Existing unconfirmed user: marketplace banner shows; confirming sets `zip_confirmed=true`, hides the banner, and distances compute.
- `PUT /profile` rejects an unseeded ZIP (400) and sets `zip_confirmed=true` on a valid one.
- Backend `pytest` + frontend `typecheck`/`build` clean. Migration applies cleanly.

## Assumptions

- One representative ZIP per neighborhood is good enough for a derived default (neighborhood-coarse); users refine via signup/banner.
- `/neighborhoods` extension to include `zip` is backward compatible (consumers read `.name`).
