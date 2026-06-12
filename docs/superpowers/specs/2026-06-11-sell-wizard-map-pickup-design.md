# Sell-Wizard Step 5 — Map Pickup Picker (Geotag Phase 2b) — Design

**Status:** Approved by user 2026-06-11 — ready for writing-plans.
**Goal:** Replace step 5's address/ZIP form fields with a map-first pickup picker: an interactive Mapbox map with a draggable pin and a seller-adjustable privacy-circle radius. Buyers only ever see the circle — never the pin.

**Decisions locked with user:**
- **Storage semantics (B):** the pin is stored *coarsened* (~110 m rounding, same `_round_coord` floor as today), enforced server-side. Nothing more precise than ~a block ever touches the DB.
- **Map-first (C):** the map+search replaces the ZIP dropdown and free-text address. Listing `zip_code` is *derived from the pin* (reverse geocode), not chosen.
- **Client token (A):** Mapbox GL JS uses a *public* `pk.` token via `VITE_MAPBOX_TOKEN` — separate dev (localhost-restricted) and prod (domain-restricted) tokens. The backend's secret token stays server-side. CLAUDE.md gets a documented carve-out: URL-restricted public map-render tokens are allowed client-side.
- **Radius:** per-listing `map_radius_mi`, slider bounds **0.1–0.4 mi**, default **0.15 mi** (the buyer-map radius aligned in Phase 2).
- **Layout A (map-dominant):** single column — search box, full-width map, radius slider, Post. Identical mobile/desktop.
- **No communities dropdown** — removed from step 5. (Full "communities as tags" reversion is a separate backlogged feature; the API `communities` field still exists and is sent empty/default.)
- **Icon pin** — lucide `MapPin` rendered as a custom GL marker (no emoji/default Mapbox pin), consistent with the app icon set.
- **"Drag to adjust" tooltip** — a quiet pill above the pin, visible while the pin is idle, hidden during drag, reappears on release.

---

## UX (both flows)

`SinglePickupStep` and `PickupStep` (bulk) are replaced by one shared **`PickupMapStep`** component (kills the current duplication; bulk-specific bits — item count, per-item overrides — stay in thin wrappers or props).

Top to bottom:
1. **Search box — autocomplete-first** (user decision 2026-06-11): debounced (~300 ms) Mapbox Geocoding requests with `autocomplete=true`, bounded to the NYC bbox, `types=address,postcode`. Suggestions whose ZIP is not in the 42 seeded Manhattan ZIPs are filtered out (or shown disabled with "outside Manhattan"). **Only selecting a suggestion moves the pin/map** — free-typed text that is never selected does nothing, so an invalid address can't be captured by construction. The selected suggestion's place string persists as `pickup_location`, and the circle centers on its coordinates (even after the ~110 m storage coarsening, the true address remains inside the circle at every slider position — min radius 161 m > max rounding offset ~78 m). Model the dropdown UX on the existing `LocationCombobox` (debounce, keyboard nav, no-matches row).
2. **Map** (Mapbox GL JS, lazy-loaded) — draggable icon pin + translucent circle rendered live at the chosen radius (same amber treatment as the buyer-side static map). Pin seeds from the seller's profile-ZIP centroid before any search. Idle-pin tooltip: "Drag to adjust".
3. **Area-size slider** — 0.1–0.4 mi, default 0.15, current value labeled (e.g. "0.15 mi").
4. **Post button** — existing post flow, minus communities.

Client-side pre-submit check mirrors the server rule (pin must resolve to one of the 42 seeded Manhattan ZIPs) for instant feedback; the server check is authoritative.

## Data model & API

- **Migration 0012:** `ALTER TABLE listings ADD COLUMN IF NOT EXISTS map_radius_mi real` (null → render default 0.15). Bounds-checked server-side on write (reject outside 0.1–0.4).
- **`POST /api/listings`** accepts `latitude`/`longitude` (from the pin) + `map_radius_mi` + `pickup_location` (search string). Server:
  1. Rounds coords with `_round_coord` (never trusts client rounding).
  2. **Reverse-geocodes the pin server-side** (secret token, 1 call/post) → ZIP. ZIP must exist in `zip_centroids`, else 400 "Pickup must be in Manhattan for now". Stores the derived `zip_code` (client-sent ZIP is ignored). If the seller never searched (drag-only), the reverse-geocode's place label is stored as `pickup_location` so the field is never empty.
  3. Validates radius bounds; stores `map_radius_mi`.
- **Buyer-side static map** (`GET /api/listings/{id}/map.png`) renders the circle at `listing.map_radius_mi ?? 0.15`. (Interim: PR #50's hardcoded default changes 0.4 → 0.15 immediately, before this feature.)
- Distance/feed logic unchanged — it already reads listing lat/lng.

## Tokens & config

- `VITE_MAPBOX_TOKEN` (frontend env): public `pk.` token. Dev token URL-restricted to `http://localhost:5173/*` in `.env.local` (gitignored); prod token domain-restricted, set in the deploy env. Public scopes only (`styles:read`, `fonts:read`).
- Backend `MAPBOX_TOKEN` (existing, secret): static maps, Directions, and the new server-side reverse geocode.

## Failure modes

- **GL JS load failure / no WebGL / token missing** → step falls back to the current ZIP-dropdown + address-text fields (the existing components are kept as the degraded path) so posting is never blocked.
- **Search geocode fails** → inline error; pin drag still works (seeded from profile ZIP).
- **Server reverse-geocode fails at post** → 503 with retryable message; no partial listing created.
- **Bundle:** mapbox-gl (~230 KB gzip) is dynamically imported only when step 5 mounts; marketplace bundle untouched.

## Cost

~2 geocoding calls per posted listing (forward search + server verify) + GL tile loads during step 5 only — trivial against Mapbox free tiers at MVP volume.

## Out of scope

- Communities-as-tags reversion (backlogged separately).
- Buyer-side interactive maps (buyer map stays the static endpoint).
- Address autocomplete on profile/signup (Phase 2c — will reuse this geocoding machinery).
- Post-acceptance exact-address routing (Phase 3).

## Testing / QA criteria

- Server: coord rounding enforced; radius bounds rejected outside 0.1–0.4; non-Manhattan pin → 400; derived ZIP ∈ `zip_centroids`; client-sent ZIP ignored; reverse-geocode mocked in tests.
- Frontend: pin drag updates coords + circle; slider updates circle live + posts the value; tooltip idle/drag behavior; search recenters; fallback path renders when token absent (CI state); both flows post successfully; typecheck/build clean; no `any`.
- Buyer regression: detail map renders per-listing radius; old listings (null) render 0.15.
