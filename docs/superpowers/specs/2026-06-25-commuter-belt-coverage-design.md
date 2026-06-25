# Commuter-belt coverage + editable suggested-neighborhood

**Date:** 2026-06-25
**Status:** Approved (design); pending implementation plan
**Branch:** work directly on `dev` (no new feature branch, per standing preference)

## Problem

Two coupled problems surfaced during pre-prod testing:

1. **Valid Manhattan addresses get rejected at registration.** The signup flow
   persists *Mapbox's* neighborhood label (`ctx.neighborhood.name`, e.g.
   "Koreatown", "Hudson Yards") verbatim. `set_user_neighborhood`
   (`backend/services/neighborhood.py`) raises `ValueError → 400` for anything
   not in the 42-entry `MANHATTAN_NEIGHBORHOODS` list, so a real Manhattan
   address whose Mapbox label is off-list (Koreatown → should be Chelsea/NoMad)
   dies at "Create profile".

2. **The product only serves Manhattan, but students commute from the close-in
   Queens/Brooklyn belt.** Those addresses are filtered out of autocomplete
   (`NYC_ZIP_SET`) and have no neighborhood community, so a student living in
   Astoria or Williamsburg cannot register at all.

## Goals

- Students in the close-in Queens/Brooklyn commuter belt can register and
  transact.
- Registration never 400s on a valid served address.
- The user's neighborhood is a **ZIP-suggested default they can edit**, with the
  guardrail that any choice is a canonical neighborhood (always maps to a real
  community).

## Non-goals (explicitly out of scope)

- Feed radius / distance changes. `FEED_MAX_RADIUS_MI = 10.0` already spans the
  belt (Astoria↔Midtown ≈ 3–5 mi, Williamsburg↔Lower Manhattan ≈ 3–4 mi), so
  cross-borough listings surface automatically once data exists.
- Full Queens/Brooklyn coverage. Only the curated commuter belt below; more
  neighborhoods (Sunset Park, Ridgewood, Bay Ridge, …) are appended later via
  the same pattern.
- All five boroughs.
- Proximity-filtered neighborhood dropdown. The editable dropdown shows the
  **full** canonical list; list-membership is the only guardrail.

## Design decisions (resolved during brainstorming)

| # | Decision | Rationale |
|---|---|---|
| Scope | Targeted commuter belt only (~27 ZIPs / 19 neighborhoods) | Serve where users actually are; keep data hand-reviewable; honor MVP-simplicity bias |
| Resolution model | ZIP → exactly one canonical neighborhood (a function); derive server-side | Kills the Mapbox-label mismatch; one ZIP = one trust circle; coarse by design |
| Data sourcing | Hand-curated, human-reviewed; centroids from Census ZCTA | Matches school-seed / pricing-seed precedent; no runtime external dependency |
| Registration UX | ZIP-suggested **default**, user-editable dropdown, guarded to the canonical list | Folds smart-default + user agency; `set_user_neighborhood` validation becomes a backstop, never a user-facing failure |
| Dropdown contents | Full canonical list (~61 neighborhoods) | Simplest; address autocomplete already anchors the user; trust signal is self-attested |

## Curated reference data — commuter belt

One ZIP → one canonical neighborhood (circle). ZIPs that span several areas are
coarsened to the chosen label.

### Queens (10 ZIPs → 6 circles)

| ZIP | Neighborhood |
|---|---|
| 11101 | Long Island City |
| 11109 | Long Island City |
| 11102 | Astoria |
| 11103 | Astoria |
| 11105 | Astoria |
| 11106 | Astoria |
| 11104 | Sunnyside |
| 11377 | Woodside |
| 11372 | Jackson Heights |
| 11375 | Forest Hills |

### Brooklyn (17 ZIPs → 13 circles)

Each ZIP maps to exactly one neighborhood (the single value below). Where a ZIP
physically spans several areas, we pick one canonical label and the others are
**not** part of the mapping.

| ZIP | Neighborhood |
|---|---|
| 11222 | Greenpoint |
| 11211 | Williamsburg |
| 11249 | Williamsburg |
| 11206 | Williamsburg |
| 11237 | Bushwick |
| 11221 | Bushwick |
| 11216 | Bedford-Stuyvesant |
| 11233 | Bedford-Stuyvesant |
| 11205 | Clinton Hill |
| 11201 | DUMBO |
| 11217 | Boerum Hill |
| 11238 | Prospect Heights |
| 11215 | Park Slope |
| 11231 | Carroll Gardens |
| 11213 | Crown Heights |
| 11225 | Prospect-Lefferts Gardens |
| 11226 | Flatbush |

**19 new neighborhood circles:** Long Island City, Astoria, Sunnyside, Woodside,
Jackson Heights, Forest Hills, Greenpoint, Williamsburg, Bushwick,
Bedford-Stuyvesant, Clinton Hill, DUMBO, Boerum Hill, Prospect Heights,
Park Slope, Carroll Gardens, Crown Heights, Prospect-Lefferts Gardens, Flatbush.

## Components & file-level scope

### Backend — reference data

- **`backend/constants/neighborhoods.py`** — rename `MANHATTAN_NEIGHBORHOODS` →
  `NYC_NEIGHBORHOODS`; append the 19 new neighborhoods; update the
  Manhattan-specific docstring. Update all import sites:
  `routers/communities.py`, `services/neighborhood.py`,
  `tests/test_listing_create.py`, `tests/test_neighborhood_community.py`,
  `tests/test_neighborhood_zips.py`.
- **`backend/constants/neighborhood_zips.py`** — add `ZIP_NEIGHBORHOOD:
  dict[str, str]` (every served ZIP → one canonical neighborhood) covering the
  existing Manhattan ZIPs **and** the 27 new ones. Keep the existing
  `NEIGHBORHOOD_ZIP` (neighborhood → representative ZIP) for ZIP-prefill.
- **`backend/scripts/seed_zip_centroids.py`** — add 27 Queens/Brooklyn ZIP
  centroids (lat/lng from Census ZCTA).

### Backend — resolution

- **`backend/routers/auth.py`** (`register`, `update_profile`) — when the
  submitted neighborhood is blank/None, derive it from `zip_code` via
  `ZIP_NEIGHBORHOOD` before calling `set_user_neighborhood`. When provided,
  existing validation against `NYC_NEIGHBORHOODS` stands (now a backstop).
- **`backend/routers/communities.py`** — keep `GET /neighborhoods` returning the
  plain `string[]` (do **not** change its shape; `useNeighborhoods` depends on
  it). **No new endpoint:** the FE already maintains a canonical
  `ZIP_NEIGHBORHOOD` map in `nycZips.ts` (deliberately mirrored from the backend,
  per the file's sync contract), so the prefill suggestion is derived locally on
  the client. The backend `ZIP_NEIGHBORHOOD` (above) is used only for the
  server-side registration backstop.

### Backend — migration

- **`supabase/migrations/00xx_commuter_belt_communities.sql`** (next sequential,
  ~`0020`; confirm against the latest applied migration) — INSERT 19
  system-owned `Community` rows (one per new neighborhood), mirroring
  `0007_neighborhood_communities.sql` / `0008_align_*.sql`. Idempotent
  (guard against re-insert).
- **Prod bootstrap:** run `seed_zip_centroids.py` against prod to add the 27 new
  `zip_centroids` rows (same path Manhattan ZIPs were seeded).

### Frontend

- **`frontend/src/lib/mapboxSearch.ts`** — expand `NYC_BBOX` and `NYC_ZIP_SET`
  to include the commuter-belt ZIPs so those addresses surface in autocomplete.
- **`frontend/src/lib/nycZips.ts`** — add the 27 commuter-belt ZIP entries (kept
  in sync with the backend seed, per the file's existing contract).
- **`frontend/src/pages/signup/steps/LocationStep.tsx`** — change the
  neighborhood read-only input to an **editable native `<select>`** populated
  from `useNeighborhoods` (full canonical list). (`LocationCombobox` is
  ZIP-valued, not neighborhood-valued, so it is not reused here.) Prefilled to
  the ZIP-derived suggestion. User can change to any listed neighborhood.
- **`frontend/src/pages/signup/SignUpWizard.tsx`** — on address select, set the
  neighborhood default from `ZIP_NEIGHBORHOOD[zip]` (local); submit the chosen
  (always-canonical) neighborhood. `ReviewStep` already displays it.
- **Settings / Edit-Profile neighborhood control** — align to the same
  full-list combobox so registration and profile edit behave identically.

## Data flow (registration)

1. User types address → Mapbox v6 forward-geocode → suggestion with `zip` (must
   be in expanded `NYC_ZIP_SET`).
2. On select, FE derives the suggestion locally (`ZIP_NEIGHBORHOOD[zip]` from
   `nycZips.ts`) → prefill the neighborhood dropdown with it.
3. User keeps or changes the dropdown (full canonical list).
4. `POST /api/auth/register` with `{ zip_code, neighborhood, … }`. Backend:
   neighborhood present → validate ∈ `NYC_NEIGHBORHOODS` (backstop); if blank →
   derive from `ZIP_NEIGHBORHOOD[zip_code]`. `set_user_neighborhood` joins the
   matching system community.

## Error handling

- Address whose ZIP is **not** served (e.g. Far Rockaway, deep Brooklyn) — not
  returned by autocomplete (filtered by `NYC_ZIP_SET`); no silent dead-end is in
  scope for this spec beyond existing behavior (logged as a follow-up if desired).
- `ZIP_NEIGHBORHOOD[zip]` miss for an unknown ZIP → dropdown falls back to
  unselected and the user must pick (cannot continue empty — the step gate
  requires a neighborhood).
- Off-list neighborhood reaching the backend → corrected via the ZIP backstop if
  the ZIP is known; otherwise 400 (not reachable via the guarded dropdown).
- `useNeighborhoods` fetch failure → existing error+retry pattern; never blocks
  with a blank list silently.

## Testing & QA criteria

### Backend (pytest)

- `ZIP_NEIGHBORHOOD` covers **every** ZIP in `zip_centroids` (extend
  `test_neighborhood_zips.py`).
- Every value in `ZIP_NEIGHBORHOOD` is in `NYC_NEIGHBORHOODS`.
- Every `NYC_NEIGHBORHOODS` entry has a system-owned community row.
- `register` with a Queens ZIP (11103) and a Brooklyn ZIP (11211): derives the
  right neighborhood and auto-joins that community.
- `register` with an explicit canonical neighborhood is honored.
- `register`/`update_profile` with an off-list neighborhood still 400s.
- `neighborhood_for_zip("11211")` → `"Williamsburg"`; unknown ZIP → `None`.
- Migration idempotency.

### Frontend / E2E

- Astoria (11103) and Williamsburg (11211) addresses surface in autocomplete.
- Dropdown prefilled to the correct circle; changeable to any canonical
  neighborhood; submit 200.
- Registration completes end-to-end; user lands in the expected community.

## Tech-debt notes

- **Dual maps** (`NEIGHBORHOOD_ZIP` and new `ZIP_NEIGHBORHOOD`) are a drift risk;
  mitigated by the coverage/consistency tests above.
- The `MANHATTAN_NEIGHBORHOODS → NYC_NEIGHBORHOODS` rename touches ~6 files; a
  clean rename (no compat shim) is preferred to avoid a lingering legacy alias.

## Rollout

1. Land backend reference data + resolution + migration; run seed against prod
   (bootstrap centroids + community rows).
2. Land frontend autocomplete + dropdown changes.
3. QA last (Coworkers `qa-tester`), then this folds back into the `dev → main`
   release prep already in the backlog.
