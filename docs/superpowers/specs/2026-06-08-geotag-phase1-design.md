# Geotag Phase 1 — Geo Foundation + Distance (Design)

**Status:** Design — pending user review, then writing-plans.
**Date:** 2026-06-08
**Scope:** Phase 1 of the geotag initiative. Ships listing/user coordinates and a working "distance from you" with **no external map/geocoding API**. Phase 2 (Mapbox location picker + interactive maps) is explicitly out of scope here — see "Out of Scope."

---

## Goal

Give every listing a coarse, privacy-safe geographic location so the **already-built** distance UI lights up:
- the marketplace **distance slider** (built, currently inert — `useMarketplaceBrowse.ts:59-61` waits for lat/long),
- the listing-detail **distance pill** + **"Distance from you"** field (`ListingDetailModal.tsx:389, 546`).

All distance math is powered by an **internal ZIP-centroid table** — zero runtime dependency on Google/Mapbox (aligns with `feedback_no_long_term_api_dependency`).

## Architecture (one sentence)

Each listing and user resolves to a **ZIP-code centroid** (lat/long from a Cosello-owned `zip_centroids` seed table); the listings API computes **haversine distance** from the requesting user's centroid to each listing's centroid, returns it on the payload, and optionally filters by the slider's max distance. Published coordinates are **rounded server-side** so they never reveal an exact point.

## Tech Stack

Python 3.14 / FastAPI / SQLAlchemy (SQLite) backend; React + TS frontend. No new runtime deps. Static seed data only.

---

## 1. Data model

### 1a. New table: `zip_centroids` (Cosello-owned seed)
| Column | Type | Notes |
|---|---|---|
| `zip_code` | `String(10)` PK | e.g. `"10014"` |
| `latitude` | `Float` | centroid lat |
| `longitude` | `Float` | centroid lng |
| `borough` | `String(40)` nullable | `"Manhattan"`, for future filtering/QA |

- **Source:** US Census ZCTA gazetteer / NYC Open Data ZIP centroids — public, static. Seeded once via an idempotent script (`backend/scripts/seed_zip_centroids.py`), human spot-checked. **No runtime API.** Manhattan ZIPs for MVP (~43 rows); the table can grow later without code changes.
- Pattern mirrors the queued `pricing_seed` table (internal seed, one-shot generation + human check).

### 1b. `Listing` — add three columns
- `latitude` `Float` nullable, `longitude` `Float` nullable — the listing's **published center** (rounded; see §4).
- `zip_code` `String(10)` nullable — the listing's ZIP.
- Serialized in `Listing.to_dict()` as `latitude`, `longitude`, `zip_code` (and the computed `distance_miles` is attached by the endpoint, not stored — see §3).

### 1c. Users
- No schema change. Users already have `zip_code`. The buyer's location for "distance from you" is **`current_user.zip_code` → `zip_centroids` lookup** at request time.

### 1d. Listing creation default
- On `POST /api/listings`, set `listing.zip_code = seller's profile zip_code` and `latitude/longitude = round(zip_centroids[zip])`. If the seller has no zip or it's not in the table → leave coords `null` (graceful degradation, §5). **No per-listing override UI in Phase 1** (that's the Phase-2 Mapbox picker).

---

## 2. Distance computation

- Pure-Python **haversine** helper `haversine_miles(lat1, lng1, lat2, lng2) -> float` in a new `backend/services/geo.py`. No dependency.
- Buyer centroid = `zip_centroids[current_user.zip_code]`. Listing centroid = `(listing.latitude, listing.longitude)`.
- Distance is computed **server-side per request** (the server knows the authenticated user), so the client never needs the buyer's coordinates and filtering can happen before pagination.

## 3. API changes — `GET /api/listings`

- The endpoint is **already auth-required** (`current_user: User = Depends(get_current_user)`, which 401s anonymous), so the requester is always a real user — the buyer centroid comes from `current_user.zip_code`.
- **New optional query param** `max_distance` (float, miles). When present AND the requesting user has a resolvable centroid, drop listings whose distance exceeds it (applied in Python, before sort + pagination).
- **Payload:** each listing dict gains `distance_miles: number | null`. `null` when the listing lacks coords OR the requesting user's zip is unset / not in `zip_centroids`.
- **Unresolvable requester centroid** (user has no zip, or it isn't seeded): `distance_miles = null` for all; `max_distance` is ignored (no filtering) — browse degrades to today's behavior.
- Sort modes (`newest` / `price_*` / FYP) are unchanged; the distance filter is an additional pre-sort prune.
- `POST /api/listings`: apply §1d defaulting.

## 4. Privacy

- The **published** `latitude`/`longitude` are **rounded to 3 decimal places (~110 m)** at write time, so a listing's exact point is never derivable from the API. In Phase 1 coords are essentially the ZIP centroid anyway; the rounding rule is established now so Phase-2 pin adjustments inherit it.
- The **fixed standard radius = 0.4 mi** (Manhattan-average ZIP footprint) is defined as a shared constant `LOCATION_FUZZ_RADIUS_MI = 0.4` for Phase-2's visual circle. Phase 1 displays only the numeric "~X mi away"; it does not draw the circle.
- Exact pickup address remains gated behind `address_released` exactly as today — unchanged.

## 5. Frontend — light up the existing UI

- **Marketplace slider** (`useMarketplaceBrowse.ts`): send the slider value as `max_distance`; render using each listing's `distance_miles`. Remove the "inert until lat/long" stopgap.
- **Listing detail** (`ListingDetailModal.tsx`): the distance pill (`:389`) and "Distance from you" (`:546`) read `distance_miles` and render (e.g. `"~0.7 mi away"`); they stay hidden when `distance_miles` is `null` (existing gating).
- **Display format:** approximate, one decimal, prefixed `~` (e.g. `~0.7 mi`) to reinforce that it's coarse.
- The **"Map placeholder · Integrate with Google Maps geotag"** block stays a placeholder in Phase 1 (becomes a real Mapbox map in Phase 2). *(Note: update that placeholder copy to say Mapbox, not Google, since we chose Mapbox.)*

## 6. Error handling / graceful degradation

- Listing missing zip/coords, or the requesting user's zip unset / not in `zip_centroids` → `distance_miles = null` → distance pill/slider simply don't show for that listing. No errors surfaced.
- `max_distance` with an unresolvable requester centroid → ignored (return unfiltered).
- (Listing-detail views fetched via any anonymous-capable endpoint likewise show no distance — same null→hide path.)
- Seed script is idempotent (upsert by `zip_code`); safe to re-run.

## 7. Out of scope (Phase 2 — separate spec/PR)

- Mapbox map in the "where to sell" step: address autocomplete + draggable pin to override the default ZIP/center.
- Listing-detail real map rendering the 0.4-mi radius circle.
- Browser-GPS as a buyer-location source.
- Reverse-geocoding a dragged pin → ZIP.
- `VITE_MAPBOX_TOKEN` + the `mapProvider` seam.

## 8. Testing / QA criteria

- Seed `zip_centroids`; create a listing as a Manhattan-zip seller → listing gets the rounded centroid + zip.
- As a buyer with a different Manhattan zip, browse → `distance_miles` populated; the **slider filters** (e.g. set 1 mi → far listings drop); the **detail pill** shows `~X mi away`.
- Seller/buyer with no zip → no distance shown anywhere, no errors.
- Anonymous browse → unchanged (no distance, slider no-op).
- Published coords are rounded to 3 decimals (verify exact point isn't leaked).
- `npm run typecheck && npm run build` clean; backend imports/migrate cleanly.

## 9. Assumptions

- Distance is **center-to-center** between ZIP centroids (coarse by design; matches the privacy model).
- Manhattan-only ZIP seed for MVP; non-Manhattan zips resolve to `null` distance until seeded.
- A lightweight schema migration adds the three `Listing` columns + the `zip_centroids` table (SQLite; nullable adds are non-breaking).
