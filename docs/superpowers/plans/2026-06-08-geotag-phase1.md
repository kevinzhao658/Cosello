# Geotag Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give listings + users coarse ZIP-centroid coordinates and a working server-computed "distance from you" that lights up the existing distance slider + listing-detail pill — with no external map/geocoding API.

**Architecture:** A Cosello-owned `zip_centroids` table maps ZIP → lat/long. Listings default to the seller's profile-zip centroid (rounded for privacy). `GET /api/listings` computes haversine distance from the authenticated user's ZIP centroid to each listing and returns `distance_miles`, with an optional `max_distance` filter. Frontend reads `distance_miles` (no client-side geo math).

**Tech Stack:** FastAPI / SQLAlchemy (Supabase Postgres, migrations in `supabase/migrations/`), pytest backend tests, React + TS frontend (`npm run typecheck` / `build`).

**Spec:** `docs/superpowers/specs/2026-06-08-geotag-phase1-design.md`

**Migration note:** schema changes ship as a `supabase/migrations/000N_*.sql` file AND the matching SQLAlchemy model edit. Apply the migration to your test/dev DB before running pytest (`psql "$DATABASE_URL" -f supabase/migrations/0009_geotag.sql`, or your project's migration runner).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/0009_geotag.sql` | `zip_centroids` table + `listings` lat/long/zip columns | Create |
| `backend/models.py` | `ZipCentroid` model; `Listing` new columns + `to_dict` | Modify |
| `backend/services/geo.py` | haversine, centroid lookup, coord rounding, radius constant | Create |
| `backend/scripts/seed_zip_centroids.py` | idempotent Manhattan ZIP-centroid seed | Create |
| `backend/main.py` | listing-create defaulting; `GET /api/listings` distance + `max_distance` | Modify |
| `backend/tests/test_geo.py` | unit tests for `services/geo.py` | Create |
| `backend/tests/test_distance.py` | endpoint distance + create-defaulting tests | Create |
| `frontend/src/lib/types.ts` | `Listing` gains `latitude`/`longitude`/`zip_code`/`distance_miles` | Modify |
| `frontend/src/hooks/useMarketplaceBrowse.ts` | send `max_distance`, expose distance | Modify |
| `frontend/src/features/listings/ListingDetailModal.tsx` | pill + "Distance from you" from `distance_miles`; map-copy fix | Modify |

---

### Task 1: `geo.py` service (pure functions, no DB)

**Files:**
- Create: `backend/services/geo.py`
- Test: `backend/tests/test_geo.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_geo.py
import math
from services.geo import haversine_miles, round_coord, LOCATION_FUZZ_RADIUS_MI


def test_haversine_zero_distance():
    assert haversine_miles(40.73, -74.0, 40.73, -74.0) == 0.0


def test_haversine_known_distance():
    # ~0.96 mi between 10014 (West Village) and 10002 (LES) centroids
    d = haversine_miles(40.734, -74.006, 40.715, -73.986)
    assert 0.8 < d < 1.3


def test_round_coord_to_3_decimals():
    assert round_coord(40.7349821) == 40.735
    assert round_coord(-74.0061234) == -74.006


def test_radius_constant():
    assert LOCATION_FUZZ_RADIUS_MI == 0.4
```

- [ ] **Step 2: Run, expect fail** — `cd backend && python -m pytest tests/test_geo.py -q` → `ModuleNotFoundError: services.geo`.

- [ ] **Step 3: Implement**

```python
# backend/services/geo.py
"""Coarse geo helpers for ZIP-centroid distance. No external API.

Distance is center-to-center between ZIP centroids (intentionally coarse —
matches the privacy model where exact pickup points are never published).
"""
import math

# Fixed privacy radius (miles) for the published location circle. Phase 1 shows
# only the numeric "~X mi away"; Phase 2 draws this circle on a map. ~Manhattan-
# average ZIP footprint.
LOCATION_FUZZ_RADIUS_MI = 0.4

_EARTH_RADIUS_MI = 3958.7613


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles between two lat/long points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return _EARTH_RADIUS_MI * 2 * math.asin(math.sqrt(a))


def round_coord(value: float) -> float:
    """Round a coordinate to ~110 m so an exact point is never published."""
    return round(value, 3)
```

- [ ] **Step 4: Run, expect pass** — `python -m pytest tests/test_geo.py -q` → 4 passed.
- [ ] **Step 5: Commit** — `git add backend/services/geo.py backend/tests/test_geo.py && git commit -m "feat(geo): haversine + coord rounding + radius constant"`

---

### Task 2: `zip_centroids` table — migration + model

**Files:**
- Create: `supabase/migrations/0009_geotag.sql`
- Modify: `backend/models.py`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/0009_geotag.sql
-- Phase 1 geotag: ZIP-centroid lookup table + listing coordinates.
CREATE TABLE IF NOT EXISTS zip_centroids (
    zip_code  varchar(10) PRIMARY KEY,
    latitude  double precision NOT NULL,
    longitude double precision NOT NULL,
    borough   varchar(40)
);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude  double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS zip_code  varchar(10);
```

- [ ] **Step 2: Add the SQLAlchemy model** to `backend/models.py` (after the `Listing` class). Match the column types used elsewhere (`Column`, `String`, `Float` are already imported).

```python
class ZipCentroid(Base):
    __tablename__ = "zip_centroids"
    zip_code = Column(String(10), primary_key=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    borough = Column(String(40), nullable=True)
```

- [ ] **Step 3: Apply the migration to your test/dev DB** — `psql "$DATABASE_URL" -f supabase/migrations/0009_geotag.sql` (or the project's migration runner). Expected: no error; `\d zip_centroids` shows the table.
- [ ] **Step 4: Smoke-check the model imports** — `cd backend && python -c "from models import ZipCentroid; print(ZipCentroid.__tablename__)"` → `zip_centroids`.
- [ ] **Step 5: Commit** — `git add supabase/migrations/0009_geotag.sql backend/models.py && git commit -m "feat(geo): zip_centroids table + listing coord columns (migration + model)"`

---

### Task 3: `Listing` model — coord columns + `to_dict`

**Files:**
- Modify: `backend/models.py` (the `Listing` class + its `to_dict`)
- Test: `backend/tests/test_distance.py`

- [ ] **Step 1: Add columns to `Listing`** (next to `location`):

```python
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    zip_code = Column(String(10), nullable=True)
```

- [ ] **Step 2: Extend `Listing.to_dict()`** — add these keys to the returned dict (alongside `"location"`):

```python
            "latitude": self.latitude,
            "longitude": self.longitude,
            "zip_code": self.zip_code or "",
```

- [ ] **Step 3: Write a failing serialization test**

```python
# backend/tests/test_distance.py
import json
import io


def _img_bytes() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_listing_to_dict_has_geo_keys(db_session):
    from models import Listing
    import time
    l = Listing(id="geo-test-1", user_id="00000000-0000-0000-0000-000000000000",
                price_cents=1000, posted_at=time.time(), latitude=40.735,
                longitude=-74.006, zip_code="10014")
    d = l.to_dict()
    assert d["latitude"] == 40.735 and d["longitude"] == -74.006 and d["zip_code"] == "10014"
```

- [ ] **Step 4: Run, expect pass** — `cd backend && python -m pytest tests/test_distance.py::test_listing_to_dict_has_geo_keys -q` → 1 passed.
- [ ] **Step 5: Commit** — `git add backend/models.py backend/tests/test_distance.py && git commit -m "feat(geo): listing lat/long/zip columns + to_dict serialization"`

---

### Task 4: Manhattan ZIP-centroid seed

**Files:**
- Create: `backend/scripts/seed_zip_centroids.py`

- [ ] **Step 1: Write the idempotent seed script** (real Manhattan ZIP centroids; values approximate the US Census ZCTA gazetteer — refine from the gazetteer as needed, but these are valid for MVP distance).

```python
# backend/scripts/seed_zip_centroids.py
"""Idempotent seed for Manhattan ZIP centroids. Static data — no runtime API.
Re-run safe (upsert by zip_code). Source: US Census ZCTA gazetteer (approx).
Run: cd backend && python -m scripts.seed_zip_centroids
"""
from database import SessionLocal
from models import ZipCentroid

MANHATTAN_ZIPS = [
    ("10001", 40.750, -73.997), ("10002", 40.715, -73.986), ("10003", 40.731, -73.989),
    ("10004", 40.704, -74.012), ("10005", 40.706, -74.009), ("10006", 40.709, -74.013),
    ("10007", 40.714, -74.007), ("10009", 40.726, -73.979), ("10010", 40.739, -73.982),
    ("10011", 40.742, -74.000), ("10012", 40.725, -73.998), ("10013", 40.720, -74.005),
    ("10014", 40.734, -74.006), ("10016", 40.745, -73.978), ("10017", 40.752, -73.972),
    ("10018", 40.755, -73.993), ("10019", 40.766, -73.987), ("10021", 40.769, -73.959),
    ("10022", 40.758, -73.968), ("10023", 40.776, -73.982), ("10024", 40.799, -73.972),
    ("10025", 40.799, -73.968), ("10026", 40.803, -73.953), ("10027", 40.811, -73.953),
    ("10028", 40.776, -73.953), ("10029", 40.792, -73.944), ("10030", 40.818, -73.943),
    ("10031", 40.825, -73.950), ("10032", 40.838, -73.942), ("10033", 40.851, -73.934),
    ("10034", 40.867, -73.921), ("10035", 40.795, -73.929), ("10036", 40.759, -73.990),
    ("10037", 40.813, -73.937), ("10038", 40.709, -74.003), ("10039", 40.827, -73.936),
    ("10040", 40.858, -73.929), ("10044", 40.762, -73.950), ("10065", 40.765, -73.963),
    ("10075", 40.773, -73.956), ("10128", 40.781, -73.950), ("10280", 40.711, -74.016),
]


def main() -> None:
    db = SessionLocal()
    try:
        for zip_code, lat, lng in MANHATTAN_ZIPS:
            row = db.get(ZipCentroid, zip_code)
            if row is None:
                db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough="Manhattan"))
            else:
                row.latitude, row.longitude, row.borough = lat, lng, "Manhattan"
        db.commit()
        print(f"Seeded {len(MANHATTAN_ZIPS)} Manhattan ZIP centroids.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

(Check `backend/database.py` for the exact session factory name — use `SessionLocal` if present, else the project's equivalent. Match an existing seed script's import style, e.g. `backend/scripts/seed_*.py`.)

- [ ] **Step 2: Run it** — `cd backend && python -m scripts.seed_zip_centroids` → "Seeded 42 Manhattan ZIP centroids."
- [ ] **Step 3: Re-run (idempotency)** — run again → same message, no duplicate-key error.
- [ ] **Step 4: Commit** — `git add backend/scripts/seed_zip_centroids.py && git commit -m "feat(geo): idempotent Manhattan ZIP-centroid seed"`

---

### Task 5: Listing create defaults coords from seller's ZIP

**Files:**
- Modify: `backend/main.py` (`create_listing`, after `listing_id` is generated / before the `Listing(...)` is persisted)
- Test: `backend/tests/test_distance.py`

- [ ] **Step 1: Add a centroid helper to `services/geo.py`**

```python
def centroid_for_zip(db, zip_code: str | None):
    """Return (lat, lng) for a ZIP, or None if missing/unseeded."""
    if not zip_code:
        return None
    from models import ZipCentroid
    row = db.get(ZipCentroid, zip_code)
    return (row.latitude, row.longitude) if row else None
```

- [ ] **Step 2: In `create_listing`, default the listing's zip + coords** from the seller's profile zip. Set these fields on the `Listing(...)` constructed in the handler (the seller is `current_user`):

```python
    from services.geo import centroid_for_zip, round_coord
    seller_zip = (current_user.zip_code or "").strip() or None
    centroid = centroid_for_zip(db, seller_zip)
    listing_lat = round_coord(centroid[0]) if centroid else None
    listing_lng = round_coord(centroid[1]) if centroid else None
    # ...add to the Listing(...) kwargs: zip_code=seller_zip, latitude=listing_lat, longitude=listing_lng
```

- [ ] **Step 3: Write failing tests**

```python
# append to backend/tests/test_distance.py
def test_create_listing_defaults_to_seller_zip_centroid(authed_client, test_user, db_session, mock_storage):
    from models import ZipCentroid, Listing
    if db_session.get(ZipCentroid, "10014") is None:
        db_session.add(ZipCentroid(zip_code="10014", latitude=40.734, longitude=-74.006, borough="Manhattan"))
    test_user.zip_code = "10014"; db_session.commit()
    form = {
        "data": (None, json.dumps({"brand": "B", "name": "N", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "West Village"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 201
    lid = r.json()["id"]
    row = db_session.get(Listing, lid)
    assert row.zip_code == "10014" and row.latitude == 40.734 and row.longitude == -74.006


def test_create_listing_no_zip_leaves_coords_null(authed_client, test_user, db_session, mock_storage):
    from models import Listing
    test_user.zip_code = None; db_session.commit()
    form = {
        "data": (None, json.dumps({"brand": "B", "name": "N", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "Somewhere"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 201
    row = db_session.get(Listing, r.json()["id"])
    assert row.latitude is None and row.longitude is None
```

- [ ] **Step 4: Run, expect pass** — `cd backend && python -m pytest tests/test_distance.py -q` (the create tests pass; `centroid_for_zip` covered).
- [ ] **Step 5: Commit** — `git add backend/main.py backend/services/geo.py backend/tests/test_distance.py && git commit -m "feat(geo): listings default to seller ZIP centroid on create"`

---

### Task 6: `GET /api/listings` — distance + `max_distance`

**Files:**
- Modify: `backend/main.py` (`get_listings`, ~line 1363+)
- Test: `backend/tests/test_distance.py`

- [ ] **Step 1: Add `max_distance` param + distance computation.** Add `max_distance: Optional[float] = Query(None)` to the signature. After `results = [r.to_dict() for r in rows]`, attach distance from the requester's centroid and filter:

```python
    from services.geo import centroid_for_zip, haversine_miles
    buyer = centroid_for_zip(db, (current_user.zip_code or "").strip() or None) if current_user else None
    for item in results:
        lat, lng = item.get("latitude"), item.get("longitude")
        if buyer is not None and lat is not None and lng is not None:
            item["distance_miles"] = round(haversine_miles(buyer[0], buyer[1], lat, lng), 1)
        else:
            item["distance_miles"] = None
    if max_distance is not None and buyer is not None:
        results = [it for it in results if it["distance_miles"] is not None and it["distance_miles"] <= max_distance]
```

Place this **before** the sort/relevance/pagination block so filtering happens first. If `results` are later rebuilt from `rows_by_id`, ensure `distance_miles` is carried (attach to the dicts that get returned).

- [ ] **Step 2: Write failing tests**

```python
# append to backend/tests/test_distance.py
def test_listings_returns_distance_and_filters(authed_client, test_user, db_session, mock_storage):
    from models import ZipCentroid
    for z, la, lo in [("10014", 40.734, -74.006), ("10040", 40.858, -73.929)]:
        if db_session.get(ZipCentroid, z) is None:
            db_session.add(ZipCentroid(zip_code=z, latitude=la, longitude=lo, borough="Manhattan"))
    # buyer in West Village
    test_user.zip_code = "10014"; db_session.commit()
    # one near listing (10014), one far (10040 ~ 8.5 mi)
    for z in ("10014", "10040"):
        test_user.zip_code = z; db_session.commit()  # seller zip drives listing centroid
        authed_client.post("/api/listings", files={
            "data": (None, json.dumps({"brand": "B", "name": f"N-{z}", "description": "d",
                     "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                     "categoryAttributes": {}})),
            "communities": (None, ""), "visibility": (None, "public"),
            "pickup_location": (None, "X"), "images": ("t.png", _img_bytes(), "image/png")})
    test_user.zip_code = "10014"; db_session.commit()  # browse as West Village buyer

    full = authed_client.get("/api/listings").json()
    items = full if isinstance(full, list) else full.get("listings", full.get("results", []))
    by_name = {i["name"]: i for i in items}
    assert by_name["N-10014"]["distance_miles"] == 0.0
    assert by_name["N-10040"]["distance_miles"] > 5

    near = authed_client.get("/api/listings", params={"max_distance": 1}).json()
    near_items = near if isinstance(near, list) else near.get("listings", near.get("results", []))
    near_names = {i["name"] for i in near_items}
    assert "N-10014" in near_names and "N-10040" not in near_names


def test_listings_distance_null_when_buyer_has_no_zip(authed_client, test_user, db_session, mock_storage):
    test_user.zip_code = None; db_session.commit()
    res = authed_client.get("/api/listings").json()
    items = res if isinstance(res, list) else res.get("listings", res.get("results", []))
    assert all(i.get("distance_miles") is None for i in items)
```

(Adjust the response-shape unwrap to match `get_listings`'s actual return — inspect it; it returns a list or an object with a listings array.)

- [ ] **Step 3: Run, expect pass** — `cd backend && python -m pytest tests/test_distance.py -q`.
- [ ] **Step 4: Full backend suite (no regressions)** — `python -m pytest -q` → all pass.
- [ ] **Step 5: Commit** — `git add backend/main.py backend/tests/test_distance.py && git commit -m "feat(geo): /api/listings returns distance_miles + max_distance filter"`

---

### Task 7: Frontend `Listing` type

**Files:**
- Modify: `frontend/src/lib/types.ts` (the `Listing` interface, ~line 29-89)

- [ ] **Step 1: Add fields** to the `Listing` interface:

```ts
  latitude: number | null;
  longitude: number | null;
  zip_code: string;
  distance_miles: number | null;
```

- [ ] **Step 2: Typecheck** — `cd frontend && npm run typecheck`. Expected: FAIL only where a `Listing` object literal is constructed without the new fields (fixtures/mocks). Add the fields (`latitude: null, longitude: null, zip_code: "", distance_miles: null`) to any such literal the compiler flags. If none, it's clean.
- [ ] **Step 3: Commit** — `git add frontend/src/lib/types.ts && git commit -m "feat(geo): add lat/long/zip/distance to Listing type"`

---

### Task 8: Marketplace slider → `max_distance`

**Files:**
- Modify: `frontend/src/hooks/useMarketplaceBrowse.ts`

- [ ] **Step 1: Send `max_distance`.** In the params-building effect (where `params.set("sort", ...)` lives, ~line 125-159), add the slider value, and add `distanceMiles` to that effect's dependency array:

```ts
    params.set("max_distance", String(distanceMiles));
```

Remove the stale "inert until lat/long" comment at ~line 59-61. The listing payloads now carry `distance_miles`; consumers read it directly.

- [ ] **Step 2: Typecheck + build** — `cd frontend && npm run typecheck && npm run build`. Expected: clean.
- [ ] **Step 3: Commit** — `git add frontend/src/hooks/useMarketplaceBrowse.ts && git commit -m "feat(geo): marketplace slider filters by max_distance"`

---

### Task 9: Listing-detail distance + map copy

**Files:**
- Modify: `frontend/src/features/listings/ListingDetailModal.tsx` (distance pill ~389, "Distance from you" ~546/618, map placeholder copy ~538/609)

- [ ] **Step 1: Render distance from `distance_miles`.** Where the pill and "Distance from you" are gated on a numeric distance, source it from the listing's `distance_miles`; show `~{distance_miles.toFixed(1)} mi away` when non-null, and keep the existing hidden-when-null behavior.
- [ ] **Step 2: Fix the placeholder copy** — change both "Map placeholder · Integrate with Google Maps geotag" strings to "Map placeholder · Integrate with Mapbox (Phase 2)".
- [ ] **Step 3: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → clean.
- [ ] **Step 4: Commit** — `git add frontend/src/features/listings/ListingDetailModal.tsx && git commit -m "feat(geo): listing detail shows distance_miles; map copy → Mapbox"`

---

## QA Handoff (after all tasks)

- Seed runs idempotently; `zip_centroids` populated.
- Seller with a seeded Manhattan zip → new listing carries rounded centroid + zip; seller without zip → null coords (no error).
- Browse as a buyer with a seeded zip → `distance_miles` populated; **slider filters** (set 1 mi → far listings drop); detail **pill** shows `~X mi away`.
- Buyer with no/unseeded zip → no distance anywhere, no errors; browse otherwise unchanged.
- Published coords rounded to 3 decimals (exact point not leaked).
- `python -m pytest -q` green; `npm run typecheck && npm run build` clean.
- No Mapbox/Google code added (Phase 1 is internal-only).
