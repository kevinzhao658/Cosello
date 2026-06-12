# Geotag Phase 2 — Mapbox map views in listings (Design)

**Status:** Design — pending user greenlight, then writing-plans.
**Date:** 2026-06-10
**Goal:** Replace the two "Map placeholder · Integrate with Mapbox (Phase 2)" slots in the listing detail view with a real, privacy-preserving Mapbox map of the item's *approximate* pickup area, plus a walking-time estimate. One vendor (Mapbox), inside the free tier.

**Scope decisions (locked with user):**
- **Mapbox only** — no Google, no second vendor.
- **Walk only** — no car (low value in NYC), no subway (needs a transit vendor; deferred).
- **Static map** (Mapbox Static Images API), not interactive GL-JS.
- **Backend-proxied token** — Mapbox key never reaches the browser.
- **Durations only, fuzzed area** — never an exact pin or a route polyline pre-acceptance.

---

## Context (what already exists)

- `ListingDetailModal.tsx` has **two** identical placeholder blocks: the desktop **Location tab** (~line 532) and the mobile **Location drawer** (~line 606). Each pairs the map with a `<dl>`: Neighborhood, "Distance from you" (`listing.distance_miles`), and "Approx. address shared after offer is accepted."
- Listings already carry `latitude` / `longitude` (rounded to ~110 m) and `zip_code`. `distance_miles` is computed server-side from the buyer's ZIP centroid (haversine).
- `LOCATION_FUZZ_RADIUS_MI = 0.4` already exists, earmarked "Phase 2 visual only."
- The "exact address only after acceptance" privacy promise is printed in this very panel — the map must not undermine it.

## Architecture (one sentence)

A backend endpoint computes the listing's fuzzed center, builds a Mapbox **Static Images** URL with a translucent ~0.4 mi circle, and **streams the PNG** so the token stays server-side; a sibling field supplies a **walking-time estimate** (Mapbox Directions `walking`, buyer-centroid → listing-centroid, duration only) — both degrade gracefully to the current placeholder when `MAPBOX_TOKEN` is unset.

## Components

### 1. Config / secret
- New backend setting `MAPBOX_TOKEN` (env var). **User provides it** (free Mapbox account; static tier ~50k loads/mo, Directions ~100k/mo). Until set, the map endpoint returns a "no map" signal and the frontend renders today's stylized placeholder — nothing breaks. Stub cleanly per the backlog-API rule.

### 2. Map image — `GET /api/listings/{id}/map.png`
- Loads the listing, takes its stored `latitude`/`longitude` (already ~110 m coarse), applies the **visual fuzz** so the center is the approximate area, builds a Mapbox Static Images URL: neighborhood-level zoom, a semi-transparent **circle overlay** (~0.4 mi radius, brand color) — **no marker/pin**.
- **Streams the image bytes** (`image/png`) so the token is never in client-visible HTML/URL. Server-side cache keyed by listing id (the image is stable until the listing's coords change) + sane `Cache-Control` for the browser/CDN.
- If `MAPBOX_TOKEN` unset or Mapbox errors → `503`/`204` (frontend falls back to the placeholder). Handle Mapbox timeouts.

### 3. Walking estimate
- Add a `walk_minutes: int | null` field to the listing detail payload (the `/api/listings` item already returns `distance_miles`; extend the same serializer or a small enrichment).
- Source: **Mapbox Directions `walking`** between the **buyer's ZIP centroid** and the **listing's fuzzed center**, returning duration only — no geometry sent to the client. Cache per `(buyer_zip, listing_id)`; recompute only when the buyer's ZIP changes.
- **Fallback** (no token, no buyer ZIP, or Directions error): derive a rough estimate from the existing `distance_miles` × a walking-pace constant, OR return `null` (frontend hides the row). Keep the Directions call optional so the feature works degraded.
- Privacy: a duration number between two coarse centroids — no exact address, no drawn route.

### 4. Frontend — `ListingMap` component + wiring
- New `components/ListingMap.tsx`: renders `<img src="/api/listings/{id}/map.png">` inside the existing `aspect-[16/10]` frame, with **loading** (skeleton/shimmer), **error/empty** (fall back to the current `ld-map-grid` placeholder), and proper `alt` text ("Approximate pickup area").
- Replace **both** placeholder blocks in `ListingDetailModal.tsx` (desktop tab + mobile drawer) with `<ListingMap listingId={listing.id} />`. Keep the `<dl>` rows.
- Add the walk row to the `<dl>`: e.g. "Walking" → `~{walk_minutes} min` when present, hidden when null. Sits beside "Distance from you."
- `AuthUser`/listing types gain `walk_minutes`.

## Data flow

1. Detail modal opens → `<ListingMap>` requests `/api/listings/{id}/map.png` → backend fuzzes + streams the Mapbox static PNG → rendered in the frame.
2. Listing payload already includes `distance_miles`; now also `walk_minutes` (Mapbox walking duration, cached) → walk row shows "~N min."
3. No token yet → endpoint 204s, component shows the existing placeholder, walk row hidden. Feature is invisible-but-safe until the key lands.

## Error / edge cases
- `MAPBOX_TOKEN` unset → graceful placeholder (primary launch state until user adds the key).
- Listing with null lat/lng (legacy) → endpoint 204, placeholder shown.
- Buyer not logged in / no ZIP → `walk_minutes` null, row hidden (map still renders; it doesn't need the buyer).
- Mapbox down/slow → timeout → 503 → placeholder; never block modal render.

## Out of scope (future phases)
- **Car & subway ETAs** — car de-scoped (NYC); subway needs a transit vendor (Google) or self-hosted OTP+MTA-GTFS. Reserve a UI slot, don't build.
- **Interactive map** (pan/zoom) — static only for now.
- **Sell-wizard pin picker** — Phase 2b (needs GL-JS).
- **Street-address autocomplete** — Phase 2c (Mapbox Geocoding / Places-class).
- **Post-acceptance real route + ETA** — Phase 3, in the pickup-coordination flow where the exact address is shared.

## Testing / QA
- Endpoint: returns PNG with a valid token (mock Mapbox in tests); 204/503 without token or with null coords; token never appears in any client-visible response.
- Walk: `walk_minutes` populated with a (mocked) Directions response; null when no buyer ZIP; cache hit on repeat.
- Frontend: loading + error/placeholder + success states; both desktop tab and mobile drawer swapped; walk row hides on null; no `any`.
- Privacy assertions: no exact lat/lng or address in the map response; no route geometry in the walk path.
- `typecheck` + `build` + backend `pytest` clean.

## Assumptions
- Coarse buyer-centroid → fuzzed-listing-center is good enough for a "~N min walk" signal; not turn-by-turn.
- Mapbox free tier covers MVP volume; server-side image cache + per-`(buyer_zip, listing_id)` walk cache keep call counts low.
- User supplies `MAPBOX_TOKEN`; everything degrades to the current placeholder until then.
