# Sell-Wizard Map Pickup Picker (Geotag Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sell-wizard step 5's ZIP-dropdown/address fields with a map-first pickup picker — autocomplete address search, draggable coarsened pin, adjustable privacy-circle radius (0.1–0.4 mi, default 0.15) — per the approved spec `docs/superpowers/specs/2026-06-11-sell-wizard-map-pickup-design.md`.

**Architecture:** Backend first (locks the API contract): a per-listing `map_radius_mi` column, a server-side reverse-geocode (pin → ZIP, must be one of the 42 seeded Manhattan ZIPs), and `POST /api/listings` accepting optional pin fields — when absent, the legacy `pickup_zip` path is unchanged (this IS the degraded fallback). Frontend second: a shared `PickupMapStep` (Mapbox GL JS, lazy-loaded; icon pin; live circle; autocomplete search where ONLY selecting a suggestion moves the pin) wired into both wizard flows, falling back to the legacy fields when the public token is missing or GL fails.

**Tech Stack:** FastAPI/SQLAlchemy (Supabase Postgres), httpx, pytest; React 18 + TS, mapbox-gl (dynamic import), Tailwind v4, Vite env (`VITE_MAPBOX_TOKEN`).

**Branch:** `feature/sell-wizard-map-pickup` (cut from dev `aaded31`). Commit per task. The user applies SQL migrations themselves — never run them.

---

## File map

| File | Role |
|---|---|
| `supabase/migrations/0012_map_radius.sql` | new column (create) |
| `backend/models.py` | `Listing.map_radius_mi` + `to_dict` (modify) |
| `backend/services/mapbox.py` | radius constants, `reverse_geocode_zip` (modify) |
| `backend/main.py` | `create_listing` pin path; `map.png` per-listing radius (modify) |
| `backend/tests/test_map_pickup.py` | backend tests (create) |
| `frontend/src/lib/geoCircle.ts` | circle GeoJSON for GL (create) |
| `frontend/src/lib/mapboxSearch.ts` | autocomplete forward geocode (create) |
| `frontend/src/features/sell-wizard/steps/PickupMapStep.tsx` | the new step (create) |
| `frontend/src/features/sell-wizard/SellWizard.tsx` + `usePostListing.ts` + `useSellWizard.ts` | wiring (modify) |

---

### Task 1: Migration + model — `map_radius_mi`

**Files:** Create `supabase/migrations/0012_map_radius.sql`; Modify `backend/models.py` (Listing class ~line 170s, `to_dict` ~line 237).

- [ ] **Step 1: Write the migration** (do NOT apply it — the user runs migrations in the Supabase SQL Editor):

```sql
-- 0012_map_radius.sql
-- Per-listing buyer-facing map circle radius (miles). NULL -> render default 0.15.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS map_radius_mi real;
```

- [ ] **Step 2: Add the column + serialization.** In `backend/models.py`, next to `latitude`/`longitude` (~line 183):

```python
    map_radius_mi = Column(Float, nullable=True)  # buyer map circle radius; NULL -> default
```

and in `to_dict` next to `"zip_code"`:

```python
            "map_radius_mi": self.map_radius_mi,
```

- [ ] **Step 3: Run existing tests to confirm nothing broke:** `cd backend && python3 -m pytest tests/test_geotag_phase2.py tests/test_listing_create.py -q` → all pass (SQLite test DB picks the column up from the model).

- [ ] **Step 4: Commit** — `git add supabase/migrations/0012_map_radius.sql backend/models.py && git commit -m "feat(geotag-2b): map_radius_mi column + migration 0012"`

### Task 2: Mapbox service — radius bounds + reverse geocode

**Files:** Modify `backend/services/mapbox.py`; Test `backend/tests/test_map_pickup.py` (create).

- [ ] **Step 1: Write failing tests** (`backend/tests/test_map_pickup.py`):

```python
"""Phase 2b — map pickup picker backend tests. All Mapbox HTTP is mocked."""
import pytest
import services.mapbox as mb


def test_radius_constants():
    assert mb.MIN_MAP_RADIUS_MI == 0.1
    assert mb.MAX_MAP_RADIUS_MI == 0.4
    assert mb.MAP_CIRCLE_RADIUS_MI == 0.15


def test_reverse_geocode_zip_parses_postcode(monkeypatch):
    class FakeResp:
        status_code = 200
        def json(self):
            return {"features": [{
                "place_name": "123 Mercer St, New York, New York 10012, United States",
                "context": [{"id": "postcode.123", "text": "10012"}],
            }]}
    monkeypatch.setattr(mb.httpx, "get", lambda *a, **k: FakeResp())
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") == ("10012", "123 Mercer St, New York, New York 10012, United States")


def test_reverse_geocode_zip_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise mb.httpx.ConnectError("down")
    monkeypatch.setattr(mb.httpx, "get", boom)
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") is None
```

- [ ] **Step 2: Run to verify failure:** `python3 -m pytest tests/test_map_pickup.py -q` → FAIL (`MIN_MAP_RADIUS_MI` missing). Note: `services/mapbox.py` currently does `import httpx` inside functions — Step 3 hoists it to module level so the monkeypatch target `mb.httpx` exists.

- [ ] **Step 3: Implement.** In `backend/services/mapbox.py`: move `import httpx` to module top (keep function-local imports removed), and add below `MAP_CIRCLE_RADIUS_MI`:

```python
import httpx  # module-level so tests can monkeypatch services.mapbox.httpx

# Seller-adjustable bounds for the per-listing circle (spec 2026-06-11).
MIN_MAP_RADIUS_MI = 0.1
MAX_MAP_RADIUS_MI = 0.4

_GEOCODE_BASE = "https://api.mapbox.com/geocoding/v5/mapbox.places"


def reverse_geocode_zip(lat: float, lng: float, token: str) -> tuple[str, str] | None:
    """Reverse-geocode a pin to (zip, place_label) via Mapbox. None on any failure.

    Used by create_listing to derive the listing ZIP from the seller's pin —
    the client-sent ZIP is never trusted. Secret token only; 4s timeout.
    """
    url = f"{_GEOCODE_BASE}/{lng},{lat}.json"
    try:
        resp = httpx.get(url, params={"access_token": token, "types": "address", "limit": 1}, timeout=4.0)
        if resp.status_code != 200:
            return None
        feats = resp.json().get("features") or []
        if not feats:
            return None
        feat = feats[0]
        for ctx in feat.get("context", []):
            if str(ctx.get("id", "")).startswith("postcode"):
                return (str(ctx["text"]), str(feat.get("place_name", "")))
        return None
    except Exception:
        return None
```

- [ ] **Step 4: Run tests:** `python3 -m pytest tests/test_map_pickup.py tests/test_geotag_phase2.py -q` → all pass (geotag_phase2 confirms the httpx hoist broke nothing).
- [ ] **Step 5: Commit** — `git commit -am "feat(geotag-2b): radius bounds + reverse_geocode_zip in mapbox service"`

### Task 3: `create_listing` pin path (API contract)

**Files:** Modify `backend/main.py` (`create_listing` signature ~1089 and the geo block ~1345); Test `backend/tests/test_map_pickup.py` (extend).

**Contract being added (frontend consumes this):** optional form fields `latitude`, `longitude`, `map_radius_mi`. When `latitude`+`longitude` are present: server rounds them, reverse-geocodes → ZIP (400 `"Pickup must be in Manhattan for now"` if the ZIP isn't in `zip_centroids`, 503 `"Could not verify pickup location — try again"` if Mapbox fails), validates radius bounds (400 `"map_radius_mi must be between 0.1 and 0.4"`), ignores any client `pickup_zip`, and falls back to the reverse-geocode place label when `pickup_location` is empty. When absent: the existing `pickup_zip` path runs untouched (degraded/legacy mode).

- [ ] **Step 1: Write failing tests** (append to `test_map_pickup.py`; copy the app/client/auth fixture pattern from the top of `backend/tests/test_geotag_phase2.py` — same FakeUser + dependency-override approach, and monkeypatch `main._MAPBOX_TOKEN = "tok"`):

```python
# Pin path: posts with latitude/longitude/map_radius_mi (multipart form, 1 dummy image).
# 1. happy path: monkeypatch mb.reverse_geocode_zip -> ("10012", "123 Mercer St…");
#    POST with latitude=40.7251234, longitude=-73.9986789, map_radius_mi=0.2, pickup_zip="99999"
#    -> 200; stored listing has zip_code == "10012" (client zip IGNORED),
#    latitude == round_coord(40.7251234) (3 decimals), map_radius_mi == 0.2.
# 2. non-Manhattan: reverse returns ("11201", "…Brooklyn…") and 11201 not seeded
#    -> 400 "Pickup must be in Manhattan for now".
# 3. geocode failure: reverse returns None -> 503.
# 4. radius out of bounds (0.05) -> 400 mentioning 0.1 and 0.4.
# 5. legacy path: NO latitude/longitude sent, pickup_zip="10012" -> 200, behaves exactly as today.
# 6. pickup_location empty + pin path -> stored pickup_location == reverse place label.
```

Write these as real test functions (the comment block above is the checklist of cases — each becomes `def test_...` with actual asserts, using the fixture pattern from `test_geotag_phase2.py`).

- [ ] **Step 2: Run to verify failures:** `python3 -m pytest tests/test_map_pickup.py -q` → new tests FAIL (form fields not accepted / zip not derived).

- [ ] **Step 3: Implement.** In `create_listing`'s signature add:

```python
    latitude: str = Form(""),
    longitude: str = Form(""),
    map_radius_mi: str = Form(""),
```

Replace the geo block (currently `from services.geo import centroid_for_zip... listing_lng = _round_coord(_centroid[1])`) with:

```python
    from services.geo import centroid_for_zip, round_coord as _round_coord
    import re as _re

    _radius: float | None = None
    if map_radius_mi.strip():
        from services.mapbox import MIN_MAP_RADIUS_MI, MAX_MAP_RADIUS_MI
        try:
            _radius = float(map_radius_mi)
        except ValueError:
            raise HTTPException(status_code=400, detail="map_radius_mi must be a number")
        if not (MIN_MAP_RADIUS_MI <= _radius <= MAX_MAP_RADIUS_MI):
            raise HTTPException(
                status_code=400,
                detail=f"map_radius_mi must be between {MIN_MAP_RADIUS_MI} and {MAX_MAP_RADIUS_MI}",
            )

    if latitude.strip() and longitude.strip():
        # Pin path (Phase 2b): coords from the seller's pin. Round server-side
        # (privacy floor — never trust client rounding), derive the ZIP via
        # reverse geocode, ignore any client-sent pickup_zip.
        try:
            _pin_lat, _pin_lng = float(latitude), float(longitude)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid pin coordinates")
        listing_lat = _round_coord(_pin_lat)
        listing_lng = _round_coord(_pin_lng)
        if not _MAPBOX_TOKEN:
            raise HTTPException(status_code=503, detail="Could not verify pickup location — try again")
        from services.mapbox import reverse_geocode_zip
        _rev = reverse_geocode_zip(listing_lat, listing_lng, _MAPBOX_TOKEN)
        if _rev is None:
            raise HTTPException(status_code=503, detail="Could not verify pickup location — try again")
        _zip, _place_label = _rev
        if centroid_for_zip(db, _zip) is None:
            raise HTTPException(status_code=400, detail="Pickup must be in Manhattan for now")
        if not pickup_location.strip():
            pickup_location = _place_label
    else:
        # Legacy / degraded path: ZIP dropdown drives coords (unchanged).
        _zip = pickup_zip.strip()
        if not _re.fullmatch(r"\d{5}", _zip):
            raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
        _centroid = centroid_for_zip(db, _zip)
        if _centroid is None:
            raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
        listing_lat = _round_coord(_centroid[0])
        listing_lng = _round_coord(_centroid[1])
```

and in the `Listing(...)` constructor add `map_radius_mi=_radius,` after `longitude=...`.

- [ ] **Step 4: Run:** `python3 -m pytest tests/test_map_pickup.py tests/test_listing_create.py tests/test_geotag_phase2.py -q` → all pass.
- [ ] **Step 5: Commit** — `git commit -am "feat(geotag-2b): create_listing pin path — server rounding, derived ZIP, radius bounds"`

### Task 4: Buyer map renders per-listing radius

**Files:** Modify `backend/main.py` (`get_listing_map`, ~1880); Test `backend/tests/test_map_pickup.py` (extend).

- [ ] **Step 1: Failing test:** listing with `map_radius_mi=0.3` → monkeypatch `fetch_static_map_png` to capture its `radius_mi` arg → GET `/api/listings/{id}/map.png` → captured radius == 0.3; second listing with `map_radius_mi=None` → captured == 0.15.
- [ ] **Step 2: Run → FAIL** (always 0.15 today).
- [ ] **Step 3: Implement.** In `get_listing_map` replace the fetch call's radius arg:

```python
    from services.mapbox import MAP_CIRCLE_RADIUS_MI, fetch_static_map_png
    radius = listing.map_radius_mi if listing.map_radius_mi is not None else MAP_CIRCLE_RADIUS_MI
    png_bytes = fetch_static_map_png(listing.latitude, listing.longitude, radius, _MAPBOX_TOKEN)
```

- [ ] **Step 4: Run** `python3 -m pytest tests/test_map_pickup.py tests/test_geotag_phase2.py -q` → pass. **Step 5: Commit** — `git commit -am "feat(geotag-2b): map.png renders per-listing map_radius_mi"`

### Task 5: Frontend libs — token, circle, autocomplete search

**Files:** Create `frontend/src/lib/geoCircle.ts`, `frontend/src/lib/mapboxSearch.ts`; Modify `frontend/src/lib/types.ts` (Listing gains `map_radius_mi?: number | null`). Run `npm install mapbox-gl` and `npm install -D @types/mapbox-gl` in `frontend/`.

- [ ] **Step 1: `geoCircle.ts`** — circle polygon for the GL source (same math as the backend overlay):

```ts
/** GeoJSON circle polygon approximating `radiusMi` miles around (lat, lng).
 *  Mirrors backend/services/mapbox.py:_circle_geojson — mid-Manhattan degree scale. */
const DEG_PER_MILE_LAT = 1 / 69.0;
const DEG_PER_MILE_LNG = 1 / 52.6;

export function circlePolygon(lat: number, lng: number, radiusMi: number, points = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (2 * Math.PI * i) / points;
    coords.push([lng + radiusMi * DEG_PER_MILE_LNG * Math.cos(a), lat + radiusMi * DEG_PER_MILE_LAT * Math.sin(a)]);
  }
  coords.push(coords[0]);
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}
```

- [ ] **Step 2: `mapboxSearch.ts`** — autocomplete forward geocode, NYC-bounded, filtered to the 42 ZIPs:

```ts
import { NYC_ZIP_SET } from "./nycZips";

export interface AddressSuggestion {
  label: string;       // full place_name
  lat: number;
  lng: number;
  zip: string;         // always one of the 42 seeded ZIPs
}

const NYC_BBOX = "-74.03,40.68,-73.90,40.88"; // Manhattan-ish bounds
const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function hasMapboxToken(): boolean {
  return typeof TOKEN === "string" && TOKEN.length > 0;
}

/** Forward-geocode partial input. Only suggestions whose postcode is in our 42
 *  seeded Manhattan ZIPs are returned — selecting one is inherently valid. */
export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (!TOKEN || q.length < 3) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${TOKEN}&autocomplete=true&bbox=${NYC_BBOX}&types=address,postcode&limit=5`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data: {
    features: { place_name: string; center: [number, number]; context?: { id: string; text: string }[]; text?: string }[];
  } = await res.json();
  const out: AddressSuggestion[] = [];
  for (const f of data.features ?? []) {
    const zip =
      f.context?.find((c) => c.id.startsWith("postcode"))?.text ??
      (/^\d{5}$/.test(f.text ?? "") ? (f.text as string) : undefined);
    if (zip && NYC_ZIP_SET.has(zip)) {
      out.push({ label: f.place_name, lat: f.center[1], lng: f.center[0], zip });
    }
  }
  return out;
}
```

- [ ] **Step 3:** Add `map_radius_mi?: number | null;` to the `Listing` type next to `latitude`/`longitude` in `lib/types.ts`. Add `VITE_MAPBOX_TOKEN?: string` to the env typing if `src/vite-env.d.ts` declares an `ImportMetaEnv` interface (check; if it's just the default `/// <reference types="vite/client" />`, no change needed).
- [ ] **Step 4:** `npm run typecheck && npm run build` → clean. **Step 5: Commit** — `git commit -m "feat(geotag-2b): geoCircle + NYC-filtered autocomplete search libs"` (add the three files + package.json/lock).

### Task 6: `PickupMapStep` component

**Files:** Create `frontend/src/features/sell-wizard/steps/PickupMapStep.tsx`.

Single-responsibility component; no posting logic inside. Props contract (consumed by Task 7):

```ts
export interface PickupMapStepProps {
  /** Seed center: seller's profile-ZIP centroid is unknown client-side, so seed
   *  from the profile ZIP's NYC_ZIPS entry via ZIP_NEIGHBORHOOD default; pass null to use Manhattan center. */
  initialLat: number | null;
  initialLng: number | null;
  pin: { lat: number; lng: number } | null;            // controlled
  onPinChange: (pin: { lat: number; lng: number }) => void;
  radiusMi: number;                                     // controlled, 0.1–0.4
  onRadiusChange: (r: number) => void;
  pickupLabel: string;                                  // selected suggestion label ("" if drag-only)
  onPickupLabelChange: (label: string) => void;
  /** Render-prop fallback: legacy fields shown when no token / GL init fails. */
  renderFallback: () => React.ReactNode;
}
```

- [ ] **Step 1: Implement the component.** Key requirements (all in one file; ~200 lines):
  - `hasMapboxToken()` false → render `renderFallback()` immediately. Also catch GL init errors (`map.on("error")` + try/catch around constructor) → set `glFailed` → fallback.
  - **Lazy GL:** `const [gl, setGl] = useState<typeof import("mapbox-gl") | null>(null);` + `useEffect(() => { import("mapbox-gl").then(m => { import("mapbox-gl/dist/mapbox-gl.css"); setGl(m.default ? m : m); }); }, [])` — show `<Skeleton className="absolute inset-0 rounded-none" />` (the house primitive) inside the map frame until the map's `load` event.
  - **Map init** (in an effect once `gl` + container ref ready): `new gl.Map({ container, style: "mapbox://styles/mapbox/streets-v12", center: [lng ?? -73.985, lat ?? 40.748], zoom: 14.5, accessToken: TOKEN })`. Store on a ref; clean up with `map.remove()`.
  - **Pin:** custom HTML element marker — a `div` containing the lucide `MapPin` SVG path (render `<MapPin>` via `createRoot` is overkill; inline the SVG markup with `text-primary` fill, size ~34px, `cursor-grab`): `new gl.Marker({ element, draggable: true }).setLngLat([lng, lat]).addTo(map)`. On `dragend` → `onPinChange({ lat, lng })` (raw; server coarsens). On `drag` hide tooltip; on `dragend` show it.
  - **"Drag to adjust" tooltip:** a small absolutely-positioned pill `div` inside the marker element, above the pin (`-top-7`), classes `bg-canvas/90 border border-hairline rounded-full px-2 py-0.5 text-[10px] text-muted whitespace-nowrap shadow-card`; toggled via state mirrored into `element.dataset` or direct style on drag start/end events.
  - **Circle:** on map `load`, `map.addSource("area", { type: "geojson", data: circlePolygon(...) })` + fill layer (`fill-color "#D4A017", fill-opacity 0.25`) + line layer (same color, opacity 0.6, width 2). An effect updates `(map.getSource("area") as GeoJSONSource).setData(circlePolygon(pin.lat, pin.lng, radiusMi))` whenever pin/radius change, and `map.easeTo({ center })` on pin change from search.
  - **Search combobox:** input + dropdown modeled on `LocationCombobox` (debounce 300 ms via `setTimeout` ref + `AbortController` per request, ArrowUp/Down/Enter/Escape, click-outside). Calls `searchAddresses(query, signal)`; renders `label` rows; empty non-empty query → "No Manhattan matches". **Selecting a suggestion** (only path that moves anything): `onPinChange({lat, lng})`, `onPickupLabelChange(label)`, recenter map, collapse list. Typing alone never moves the pin.
  - **Radius slider:** `<input type="range" min={0.1} max={0.4} step={0.05} value={radiusMi} onChange={e => onRadiusChange(Number(e.target.value))} />` with label row `Area size — {radiusMi.toFixed(2)} mi`; style with the existing range-input look from `MarketplaceSidebar.tsx` (copy its slider classes).
  - Loading/error states on search handled inline (spinner row / error row); no `any` anywhere.
- [ ] **Step 2:** `npm run typecheck && npm run build` → clean (build also verifies the dynamic import chunks: expect a new `mapbox-gl` chunk in the output, NOT in the main bundle).
- [ ] **Step 3: Commit** — `git commit -m "feat(geotag-2b): PickupMapStep — GL map, draggable icon pin, live circle, autocomplete"`

### Task 7: Wire into both flows + post fields

**Files:** Modify `frontend/src/features/sell-wizard/SellWizard.tsx` (~150, ~1160 `PickupStep`, ~1207 `SinglePickupStep`), `frontend/src/features/sell-wizard/useSellWizard.ts` (state), `frontend/src/features/sell-wizard/usePostListing.ts` (~63–112 single, ~137–176 bulk).

- [ ] **Step 1: Wizard state.** In `SellWizard.tsx` (where `postPickupZip`/`bulkPickupZip` live, ~line 150) add:

```ts
  const [pickupPin, setPickupPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupRadiusMi, setPickupRadiusMi] = useState(0.15);
  const [pickupLabel, setPickupLabel] = useState("");
```

Seed `pickupPin` from the user's profile ZIP centroid: `useEffect` — if `pickupPin === null && userZipCode` use a small client map of ZIP→centroid… (client doesn't have centroids; instead seed the MAP center only via `initialLat/Lng = null` → Manhattan default, and leave `pickupPin` seeded at map center on first render of the step: `onPinChange` fires from PickupMapStep's init effect with the initial center). Keep it simple: PickupMapStep, on map `load`, calls `onPinChange(initial center)` if `pin === null` so the wizard always has coords once the map shows.
- [ ] **Step 2: Replace step renders.** Where `<PickupStep …/>` (bulk, ~1160) and `<SinglePickupStep …/>` (~1207) render, render `<PickupMapStep>` with the shared state and `renderFallback={() => <PickupStep …original props… />}` (resp. `<SinglePickupStep …/>`) — the legacy components stay in-tree as the degraded path, with their communities picker REMOVED (delete the `CommunityPicker` block + props from both legacy components; keep address/ZIP fields). Checklist signals (~325): treat pickup as set when `pickupPin !== null` OR the legacy zips are set: `const pickupLocationSet = pickupPin !== null || (productDetails ? postPickupZip !== "" : bulkPickupZip !== "")`.
- [ ] **Step 3: Post fields.** In `usePostListing.ts`, thread new options `{ pin, radiusMi, pickupLabel }` (add to the hook's input object alongside `postPickupLocation` etc.). In BOTH `postSingleListing` and the bulk post body, after `formData.append("pickup_zip", …)` add:

```ts
      if (pin) {
        formData.append("latitude", String(pin.lat));
        formData.append("longitude", String(pin.lng));
        formData.append("map_radius_mi", String(radiusMi));
      }
```

and use `pickupLabel || pickup` as the `pickup_location` value when the pin path is active. Relax the `if (!zip)` guards to `if (!zip && !pin)` (pin path doesn't need a client ZIP).
- [ ] **Step 4:** `npm run typecheck && npm run build` → clean. Manual smoke list for the implementer: single flow posts with pin; bulk flow posts with pin; with `VITE_MAPBOX_TOKEN` unset the legacy fields render and posting still works.
- [ ] **Step 5: Commit** — `git commit -m "feat(geotag-2b): wire PickupMapStep into single+bulk flows; post pin fields"`

### Task 8: CLAUDE.md carve-out + env example

**Files:** Modify `CLAUDE.md` ("What NOT To Do" bullet about API keys), `frontend/.env.example` (create if absent).

- [ ] **Step 1:** In CLAUDE.md change the bullet `- Do not expose API keys or credentials in frontend code or shared config files` to:

```markdown
- Do not expose API keys or credentials in frontend code or shared config files
  - **Documented exception:** URL-restricted *public* map-render tokens (Mapbox `pk.`) are allowed client-side via `VITE_MAPBOX_TOKEN` — dev token restricted to localhost, prod token restricted to the production domain. Secret tokens stay server-side.
```

- [ ] **Step 2:** Create `frontend/.env.example` with `VITE_MAPBOX_TOKEN=pk.your-public-url-restricted-token` and a one-line comment. Confirm `.env.local` is gitignored (`git check-ignore frontend/.env.local`).
- [ ] **Step 3: Commit** — `git commit -m "docs(geotag-2b): CLAUDE.md public-token carve-out + frontend env example"`

### Task 9: QA pass (qa-tester, read-only)

- [ ] Backend: `python3 -m pytest tests/ -q` all green; verify pin-path tests cover: derived-ZIP-overrides-client, non-Manhattan 400, geocode-failure 503, radius bounds 400, legacy path untouched, place-label fallback for `pickup_location`, map.png per-listing radius + null→0.15.
- [ ] Frontend: typecheck/build clean; no `any` in new files; mapbox-gl is a lazy chunk (not in the entry bundle — check `dist/assets` listing); PickupMapStep renders fallback when token absent; search only moves pin on selection; tooltip hidden during drag; slider bounds 0.1–0.4 step 0.05; communities picker gone from step 5 in both flows; Skeleton primitive used for map loading.
- [ ] Privacy: client never sends a trusted ZIP on the pin path; server rounds coords; no route geometry anywhere; secret token never in frontend code (grep `sk\.` and `MAPBOX_TOKEN` in `frontend/src`).
- [ ] Report PASS/FAIL per area with file:line evidence.

---

## Self-review (done at write time)

- **Spec coverage:** layout A (Task 6), icon pin + tooltip (6), autocomplete selection-only (5+6), coarsened storage + derived ZIP + Manhattan-only + place-label fallback (3), radius column/bounds/buyer map (1,3,4), token split + carve-out (5,8), fallback path (6,7), no communities (7), lazy bundle (6), costs n/a runtime. Gap check: none found.
- **Type consistency:** `AddressSuggestion{label,lat,lng,zip}` used in Tasks 5/6; `PickupMapStepProps` defined in 6, consumed in 7; form fields `latitude/longitude/map_radius_mi` match Tasks 3/7. `reverse_geocode_zip` returns `tuple[str,str] | None` in Tasks 2/3.
- **Migration discipline:** 0012 is written, never applied by agents — the user applies it (test DB derives schema from the model).
