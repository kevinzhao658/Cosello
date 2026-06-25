# Commuter-belt Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Project note:** per `CLAUDE.md`, backend tasks route to the `backend-dev` Coworker, frontend tasks to `frontend-dev`, and `qa-tester` runs last.

**Goal:** Let students in the close-in Queens/Brooklyn commuter belt register and transact, and make the registration neighborhood a ZIP-suggested, user-editable value guarded to the canonical list.

**Architecture:** Add 27 commuter-belt ZIPs (→ 19 new neighborhood circles) to the existing neighborhood-community machinery: extend the canonical neighborhood constant, the ZIP→neighborhood map, the ZIP centroids seed, and add one migration that inserts the 19 system-owned communities. Registration derives a canonical neighborhood from the address ZIP (locally on the FE for the prefill, on the BE as a correctness backstop) and lets the user change it via a canonical-list dropdown.

**Tech Stack:** Python 3.14 / FastAPI / SQLAlchemy / Supabase Postgres (backend); React 18 / Vite / TypeScript (frontend); pytest (backend tests); `tsc --noEmit` (frontend gate — no FE unit runner exists).

## Global Constraints

- TypeScript: never use `any`; all types explicit.
- No em-dashes in user-facing copy; SVG (lucide) icons, never emojis.
- One ZIP maps to exactly one canonical neighborhood (the chosen value only).
- Every value in `ZIP_NEIGHBORHOOD` MUST be a member of `NYC_NEIGHBORHOODS`.
- System user id (owns neighborhood communities): `00000000-0000-0000-0000-000000000001`.
- Backend tests run against the live `cosello-dev` Supabase project; run with the `.env.test` overlay (`cd backend && set -a && source .env.test && set +a && python -m pytest ...`).
- Work directly on `dev` (no new feature branch). Commit frequently.
- New migration number is `0020` (latest applied is `0019`).

---

## Curated reference data (used verbatim across tasks)

**27 commuter-belt ZIP → canonical neighborhood (19 circles):**

```
# Queens
11101 Long Island City   11109 Long Island City
11102 Astoria            11103 Astoria           11105 Astoria          11106 Astoria
11104 Sunnyside          11377 Woodside          11372 Jackson Heights  11375 Forest Hills
# Brooklyn
11222 Greenpoint         11211 Williamsburg      11249 Williamsburg     11206 Williamsburg
11237 Bushwick           11221 Bushwick          11216 Bedford-Stuyvesant 11233 Bedford-Stuyvesant
11205 Clinton Hill       11201 DUMBO             11217 Boerum Hill      11238 Prospect Heights
11215 Park Slope         11231 Carroll Gardens   11213 Crown Heights    11225 Prospect-Lefferts Gardens
11226 Flatbush
```

**ZIP centroids (approx, Census ZCTA, 3 dp) + borough:**

```
("11101", 40.745, -73.949, "Queens"),  ("11109", 40.747, -73.958, "Queens"),
("11102", 40.772, -73.927, "Queens"),  ("11103", 40.763, -73.913, "Queens"),
("11105", 40.778, -73.908, "Queens"),  ("11106", 40.762, -73.931, "Queens"),
("11104", 40.745, -73.920, "Queens"),  ("11377", 40.745, -73.905, "Queens"),
("11372", 40.751, -73.883, "Queens"),  ("11375", 40.721, -73.846, "Queens"),
("11222", 40.728, -73.951, "Brooklyn"),("11211", 40.713, -73.957, "Brooklyn"),
("11249", 40.711, -73.967, "Brooklyn"),("11206", 40.701, -73.943, "Brooklyn"),
("11237", 40.704, -73.921, "Brooklyn"),("11221", 40.691, -73.928, "Brooklyn"),
("11216", 40.681, -73.949, "Brooklyn"),("11233", 40.678, -73.920, "Brooklyn"),
("11205", 40.694, -73.966, "Brooklyn"),("11201", 40.694, -73.990, "Brooklyn"),
("11217", 40.682, -73.979, "Brooklyn"),("11238", 40.679, -73.964, "Brooklyn"),
("11215", 40.667, -73.985, "Brooklyn"),("11231", 40.679, -74.000, "Brooklyn"),
("11213", 40.670, -73.937, "Brooklyn"),("11225", 40.663, -73.954, "Brooklyn"),
("11226", 40.646, -73.957, "Brooklyn"),
```

**19 neighborhoods → representative ZIP + community invite_code (for `NEIGHBORHOOD_ZIP` + migration):**

```
Long Island City        11101  NBHD-LIC
Astoria                 11102  NBHD-ASTORIA
Sunnyside               11104  NBHD-SUNNYSIDE
Woodside                11377  NBHD-WOODSIDE
Jackson Heights         11372  NBHD-JACKSON-HEIGHTS
Forest Hills            11375  NBHD-FOREST-HILLS
Greenpoint              11222  NBHD-GREENPOINT
Williamsburg            11211  NBHD-WILLIAMSBURG
Bushwick                11237  NBHD-BUSHWICK
Bedford-Stuyvesant      11216  NBHD-BED-STUY
Clinton Hill            11205  NBHD-CLINTON-HILL
DUMBO                   11201  NBHD-DUMBO
Boerum Hill             11217  NBHD-BOERUM-HILL
Prospect Heights        11238  NBHD-PROSPECT-HEIGHTS
Park Slope              11215  NBHD-PARK-SLOPE
Carroll Gardens         11231  NBHD-CARROLL-GARDENS
Crown Heights           11213  NBHD-CROWN-HEIGHTS
Prospect-Lefferts Gardens 11225 NBHD-PLG
Flatbush                11226  NBHD-FLATBUSH
```

---

## Task 1: Rename `MANHATTAN_NEIGHBORHOODS` → `NYC_NEIGHBORHOODS` and append the 19 new neighborhoods

**Files:**
- Modify: `backend/constants/neighborhoods.py`
- Modify: `backend/routers/communities.py` (import + docstring)
- Modify: `backend/services/neighborhood.py` (import)
- Modify: `backend/tests/test_listing_create.py`, `backend/tests/test_neighborhood_community.py`, `backend/tests/test_neighborhood_zips.py` (imports)

**Interfaces:**
- Produces: `NYC_NEIGHBORHOODS: list[str]` (61 entries: 42 existing + 19 new) in `backend/constants/neighborhoods.py`. No symbol named `MANHATTAN_NEIGHBORHOODS` remains anywhere.

- [ ] **Step 1: Find every reference**

Run: `grep -rn "MANHATTAN_NEIGHBORHOODS" backend`
Expected: matches in the 6 files listed above.

- [ ] **Step 2: Rewrite the constant file**

Replace the docstring + list in `backend/constants/neighborhoods.py`. Keep the existing 42 entries; rename the symbol; append the 19 new neighborhoods; update the prose:

```python
"""Canonical NYC neighborhood list (Manhattan + close-in Queens/Brooklyn
commuter belt).

Source of truth for two consumers:
- supabase/migrations/0007_*, 0008_*, 0020_* (pre-seed Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods)

The FE consumes the list ONLY via the endpoint. When extending to more
neighborhoods, append here AND add a follow-up migration that INSERTs the
new community rows.
"""

NYC_NEIGHBORHOODS: list[str] = [
    # --- Manhattan ---
    "Battery Park City", "Carnegie Hill", "Chelsea", "Chinatown", "Civic Center",
    "Hell's Kitchen", "East Harlem", "East Village", "Financial District",
    "Flatiron District", "Gramercy Park", "Greenwich Village", "Hamilton Heights",
    "Harlem", "Hudson Heights", "Inwood", "Kips Bay", "Lenox Hill", "Lincoln Square",
    "Little Italy", "Lower East Side", "Marble Hill", "Midtown East", "Midtown West",
    "Morningside Heights", "Murray Hill", "NoHo", "NoMad", "Nolita",
    "Roosevelt Island", "SoHo", "Stuyvesant Town", "Sutton Place", "Theater District",
    "Tribeca", "Tudor City", "Turtle Bay", "Two Bridges", "Upper East Side",
    "Upper West Side", "Washington Heights", "West Village", "Yorkville",
    # --- Queens (commuter belt) ---
    "Long Island City", "Astoria", "Sunnyside", "Woodside", "Jackson Heights",
    "Forest Hills",
    # --- Brooklyn (commuter belt) ---
    "Greenpoint", "Williamsburg", "Bushwick", "Bedford-Stuyvesant", "Clinton Hill",
    "DUMBO", "Boerum Hill", "Prospect Heights", "Park Slope", "Carroll Gardens",
    "Crown Heights", "Prospect-Lefferts Gardens", "Flatbush",
]
```

- [ ] **Step 3: Update the 5 import sites**

In each of `backend/routers/communities.py`, `backend/services/neighborhood.py`, `backend/tests/test_listing_create.py`, `backend/tests/test_neighborhood_community.py`, `backend/tests/test_neighborhood_zips.py`, replace `MANHATTAN_NEIGHBORHOODS` with `NYC_NEIGHBORHOODS` (imports and usages). In `communities.py:list_neighborhoods`, also change the docstring word "Manhattan" → "NYC" and the return line:

```python
    from constants.neighborhoods import NYC_NEIGHBORHOODS
    return sorted(NYC_NEIGHBORHOODS)
```

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "MANHATTAN_NEIGHBORHOODS" backend`
Expected: no matches.

- [ ] **Step 5: Run the touched suites**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_zips.py tests/test_neighborhood_community.py tests/test_listing_create.py -q`
Expected: PASS (the rename is mechanical; these import the constant).

- [ ] **Step 6: Commit**

```bash
git add backend/constants/neighborhoods.py backend/routers/communities.py backend/services/neighborhood.py backend/tests/test_listing_create.py backend/tests/test_neighborhood_community.py backend/tests/test_neighborhood_zips.py
git commit -m "refactor(neighborhoods): rename MANHATTAN_NEIGHBORHOODS -> NYC_NEIGHBORHOODS + append commuter belt"
```

---

## Task 2: Add backend `ZIP_NEIGHBORHOOD` map + extend `NEIGHBORHOOD_ZIP`, with a coverage test

**Files:**
- Modify: `backend/constants/neighborhood_zips.py`
- Test: `backend/tests/test_neighborhood_zips.py`

**Interfaces:**
- Consumes: `NYC_NEIGHBORHOODS` (Task 1).
- Produces: `ZIP_NEIGHBORHOOD: dict[str, str]` (68 entries: 41 Manhattan + 27 belt) in `backend/constants/neighborhood_zips.py`. Every value is in `NYC_NEIGHBORHOODS`.

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_neighborhood_zips.py`:

```python
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP, ZIP_NEIGHBORHOOD
from constants.neighborhoods import NYC_NEIGHBORHOODS


def test_zip_neighborhood_values_are_canonical():
    """Every ZIP_NEIGHBORHOOD value must be a canonical neighborhood."""
    bad = {z: n for z, n in ZIP_NEIGHBORHOOD.items() if n not in NYC_NEIGHBORHOODS}
    assert bad == {}, f"non-canonical neighborhoods mapped: {bad}"


def test_zip_neighborhood_covers_every_seeded_zip():
    """Every ZIP in the centroid seed must resolve to a neighborhood."""
    from scripts.seed_zip_centroids import all_seed_zips  # added in Task 3
    missing = [z for z in all_seed_zips() if z not in ZIP_NEIGHBORHOOD]
    assert missing == [], f"ZIPs with no neighborhood mapping: {missing}"


def test_new_neighborhoods_have_representative_zip():
    """Every commuter-belt neighborhood has a NEIGHBORHOOD_ZIP entry."""
    belt = ["Long Island City", "Astoria", "Sunnyside", "Woodside",
            "Jackson Heights", "Forest Hills", "Greenpoint", "Williamsburg",
            "Bushwick", "Bedford-Stuyvesant", "Clinton Hill", "DUMBO",
            "Boerum Hill", "Prospect Heights", "Park Slope", "Carroll Gardens",
            "Crown Heights", "Prospect-Lefferts Gardens", "Flatbush"]
    missing = [n for n in belt if n not in NEIGHBORHOOD_ZIP]
    assert missing == [], f"neighborhoods missing a representative ZIP: {missing}"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_zips.py::test_zip_neighborhood_values_are_canonical -q`
Expected: FAIL with `ImportError: cannot import name 'ZIP_NEIGHBORHOOD'`.

- [ ] **Step 3: Add the maps**

Append to `backend/constants/neighborhood_zips.py`. Add the 19 belt entries to `NEIGHBORHOOD_ZIP`, and add the full `ZIP_NEIGHBORHOOD` dict:

```python
# Representative ZIP for each commuter-belt neighborhood (append to NEIGHBORHOOD_ZIP above).
NEIGHBORHOOD_ZIP.update({
    "Long Island City": "11101", "Astoria": "11102", "Sunnyside": "11104",
    "Woodside": "11377", "Jackson Heights": "11372", "Forest Hills": "11375",
    "Greenpoint": "11222", "Williamsburg": "11211", "Bushwick": "11237",
    "Bedford-Stuyvesant": "11216", "Clinton Hill": "11205", "DUMBO": "11201",
    "Boerum Hill": "11217", "Prospect Heights": "11238", "Park Slope": "11215",
    "Carroll Gardens": "11231", "Crown Heights": "11213",
    "Prospect-Lefferts Gardens": "11225", "Flatbush": "11226",
})

# ZIP -> the single canonical neighborhood that contains it. Every value MUST be
# a member of NYC_NEIGHBORHOODS (enforced by test_neighborhood_zips). Mirrors the
# FE map in frontend/src/lib/nycZips.ts (keep the two in sync).
ZIP_NEIGHBORHOOD: dict[str, str] = {
    # --- Manhattan ---
    "10001": "NoMad", "10002": "Lower East Side", "10003": "East Village",
    "10004": "Financial District", "10005": "Financial District", "10006": "Financial District",
    "10007": "Tribeca", "10009": "East Village", "10010": "Gramercy Park",
    "10011": "Chelsea", "10012": "SoHo", "10013": "Tribeca", "10014": "West Village",
    "10016": "Murray Hill", "10017": "Midtown East", "10018": "Midtown West",
    "10019": "Hell's Kitchen", "10021": "Lenox Hill", "10022": "Midtown East",
    "10023": "Lincoln Square", "10024": "Upper West Side", "10025": "Upper West Side",
    "10026": "Harlem", "10027": "Morningside Heights", "10028": "Yorkville",
    "10029": "East Harlem", "10030": "Harlem", "10031": "Hamilton Heights",
    "10032": "Washington Heights", "10033": "Washington Heights", "10034": "Inwood",
    "10035": "East Harlem", "10036": "Theater District", "10037": "Harlem",
    "10038": "Financial District", "10039": "Harlem", "10040": "Inwood",
    "10044": "Roosevelt Island", "10065": "Lenox Hill", "10075": "Upper East Side",
    "10128": "Carnegie Hill", "10280": "Battery Park City",
    # --- Queens (commuter belt) ---
    "11101": "Long Island City", "11109": "Long Island City",
    "11102": "Astoria", "11103": "Astoria", "11105": "Astoria", "11106": "Astoria",
    "11104": "Sunnyside", "11377": "Woodside", "11372": "Jackson Heights",
    "11375": "Forest Hills",
    # --- Brooklyn (commuter belt) ---
    "11222": "Greenpoint", "11211": "Williamsburg", "11249": "Williamsburg",
    "11206": "Williamsburg", "11237": "Bushwick", "11221": "Bushwick",
    "11216": "Bedford-Stuyvesant", "11233": "Bedford-Stuyvesant",
    "11205": "Clinton Hill", "11201": "DUMBO", "11217": "Boerum Hill",
    "11238": "Prospect Heights", "11215": "Park Slope", "11231": "Carroll Gardens",
    "11213": "Crown Heights", "11225": "Prospect-Lefferts Gardens", "11226": "Flatbush",
}
```

Note: `NEIGHBORHOOD_ZIP` is currently a literal dict; convert its closing so `.update(...)` is valid (the literal stays, the `.update` call follows it).

- [ ] **Step 4: Run all three tests (the covers-every-seeded-zip one depends on Task 3 — expect it to fail until then)**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_zips.py::test_zip_neighborhood_values_are_canonical tests/test_neighborhood_zips.py::test_new_neighborhoods_have_representative_zip -q`
Expected: PASS. (`test_zip_neighborhood_covers_every_seeded_zip` is verified at the end of Task 3.)

- [ ] **Step 5: Commit**

```bash
git add backend/constants/neighborhood_zips.py backend/tests/test_neighborhood_zips.py
git commit -m "feat(neighborhoods): add ZIP_NEIGHBORHOOD map + belt representative ZIPs"
```

---

## Task 3: Extend the ZIP centroid seed with the 27 commuter-belt ZIPs

**Files:**
- Modify: `backend/scripts/seed_zip_centroids.py`

**Interfaces:**
- Produces: `all_seed_zips() -> list[str]` (helper consumed by Task 2's coverage test) returning all 68 seeded ZIP strings.

- [ ] **Step 1: Add the borough ZIP lists + helper**

In `backend/scripts/seed_zip_centroids.py`, after `MANHATTAN_ZIPS`, add:

```python
QUEENS_ZIPS = [
    ("11101", 40.745, -73.949), ("11109", 40.747, -73.958), ("11102", 40.772, -73.927),
    ("11103", 40.763, -73.913), ("11105", 40.778, -73.908), ("11106", 40.762, -73.931),
    ("11104", 40.745, -73.920), ("11377", 40.745, -73.905), ("11372", 40.751, -73.883),
    ("11375", 40.721, -73.846),
]

BROOKLYN_ZIPS = [
    ("11222", 40.728, -73.951), ("11211", 40.713, -73.957), ("11249", 40.711, -73.967),
    ("11206", 40.701, -73.943), ("11237", 40.704, -73.921), ("11221", 40.691, -73.928),
    ("11216", 40.681, -73.949), ("11233", 40.678, -73.920), ("11205", 40.694, -73.966),
    ("11201", 40.694, -73.990), ("11217", 40.682, -73.979), ("11238", 40.679, -73.964),
    ("11215", 40.667, -73.985), ("11231", 40.679, -74.000), ("11213", 40.670, -73.937),
    ("11225", 40.663, -73.954), ("11226", 40.646, -73.957),
]

# (borough_label, zip_tuples) — drives both seeding and all_seed_zips().
_SEED_GROUPS = [
    ("Manhattan", MANHATTAN_ZIPS),
    ("Queens", QUEENS_ZIPS),
    ("Brooklyn", BROOKLYN_ZIPS),
]


def all_seed_zips() -> list[str]:
    """Every ZIP string this seed manages (used by tests)."""
    return [z for _, group in _SEED_GROUPS for (z, _lat, _lng) in group]
```

- [ ] **Step 2: Rewrite `main()` to loop the groups**

```python
def main() -> None:
    db = SessionLocal()
    try:
        total = 0
        for borough, group in _SEED_GROUPS:
            for zip_code, lat, lng in group:
                row = db.get(ZipCentroid, zip_code)
                if row is None:
                    db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough=borough))
                else:
                    row.latitude, row.longitude, row.borough = lat, lng, borough
                total += 1
        db.commit()
        print(f"Seeded {total} ZIP centroids across {len(_SEED_GROUPS)} boroughs.")
    finally:
        db.close()
```

- [ ] **Step 3: Verify the coverage test now passes**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_zips.py -q`
Expected: PASS (all three new tests, including `test_zip_neighborhood_covers_every_seeded_zip`).

- [ ] **Step 4: Seed the cosello-dev test DB (needed for later register tests)**

Run: `cd backend && set -a && source .env.test && set +a && python -m scripts.seed_zip_centroids`
Expected: `Seeded 68 ZIP centroids across 3 boroughs.`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/seed_zip_centroids.py
git commit -m "feat(seed): add Queens/Brooklyn commuter-belt ZIP centroids"
```

---

## Task 4: Backend neighborhood resolution (ZIP-derive backstop) in register/update_profile

**Files:**
- Modify: `backend/services/neighborhood.py` (add helper)
- Modify: `backend/routers/auth.py` (`register`, `update_profile`)
- Test: `backend/tests/test_neighborhood_resolution.py` (create)

**Interfaces:**
- Consumes: `ZIP_NEIGHBORHOOD` (Task 2), `NYC_NEIGHBORHOODS` (Task 1).
- Produces: `neighborhood_for_zip(zip_code: str | None) -> str | None` in `backend/services/neighborhood.py`.

- [ ] **Step 1: Write the failing unit test**

Create `backend/tests/test_neighborhood_resolution.py`:

```python
from services.neighborhood import neighborhood_for_zip


def test_neighborhood_for_zip_belt():
    assert neighborhood_for_zip("11211") == "Williamsburg"
    assert neighborhood_for_zip("11103") == "Astoria"
    assert neighborhood_for_zip("11201") == "DUMBO"


def test_neighborhood_for_zip_manhattan():
    assert neighborhood_for_zip("10014") == "West Village"


def test_neighborhood_for_zip_unknown_or_none():
    assert neighborhood_for_zip("99999") is None
    assert neighborhood_for_zip(None) is None
    assert neighborhood_for_zip("") is None
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_resolution.py -q`
Expected: FAIL with `ImportError: cannot import name 'neighborhood_for_zip'`.

- [ ] **Step 3: Add the helper**

In `backend/services/neighborhood.py`, add near the top (after imports):

```python
from constants.neighborhood_zips import ZIP_NEIGHBORHOOD


def neighborhood_for_zip(zip_code: str | None) -> str | None:
    """Resolve a served ZIP to its single canonical neighborhood, or None."""
    if not zip_code:
        return None
    return ZIP_NEIGHBORHOOD.get(zip_code.strip())
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_resolution.py -q`
Expected: PASS.

- [ ] **Step 5: Wire the backstop into `register`**

In `backend/routers/auth.py:register`, replace the neighborhood handling block (currently lines ~129-142) so an off-list neighborhood with a known ZIP is corrected instead of 400'd:

```python
    # Resolve the effective neighborhood: trust a canonical value; otherwise
    # derive from the (validated) ZIP so a stale Mapbox label never 400s.
    effective_neighborhood = req.neighborhood
    if effective_neighborhood not in NYC_NEIGHBORHOODS:
        derived = neighborhood_for_zip(req.zip_code)
        if derived is not None:
            effective_neighborhood = derived

    try:
        set_user_neighborhood(db, existing, effective_neighborhood)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    existing.pronouns = req.pronouns
    existing.share_mutual_friends = True

    neighborhood_community = get_neighborhood_community(db, effective_neighborhood)
    if neighborhood_community is not None:
        set_circle_consent(db, existing.id, neighborhood_community.id, True)
```

Add imports at the top of `auth.py`: `from constants.neighborhoods import NYC_NEIGHBORHOODS` and `from services.neighborhood import neighborhood_for_zip` (extend the existing `services.neighborhood` import line).

- [ ] **Step 6: Apply the same backstop to `update_profile`**

In `backend/routers/auth.py:update_profile`, replace the `if req.neighborhood is not None:` block:

```python
    if req.neighborhood is not None:
        effective = req.neighborhood
        if effective not in NYC_NEIGHBORHOODS:
            derived = neighborhood_for_zip(req.zip_code)
            if derived is not None:
                effective = derived
        try:
            set_user_neighborhood(db, current_user, effective)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
```

- [ ] **Step 7: Write the integration test for the backstop**

Append to `backend/tests/test_neighborhood_resolution.py` (uses the existing `authed_client`/`db_session` fixtures; assumes Task 5's migration has been applied to cosello-dev so the community exists — if running before Task 5, the neighborhood string still updates even without the community row):

```python
from models import ZipCentroid, User


def _ensure_zip(db, zip_code, lat, lng, borough):
    if db.get(ZipCentroid, zip_code) is None:
        db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough=borough))
        db.commit()


def test_register_offlist_label_falls_back_to_zip(authed_client, db_session, test_user):
    """A stale Mapbox label ('Koreatown') + a valid ZIP must NOT 400; the
    neighborhood is corrected to the ZIP's canonical value."""
    _ensure_zip(db_session, "11211", 40.713, -73.957, "Brooklyn")
    r = authed_client.post("/api/auth/register", json={
        "display_name": "Belt Tester",
        "neighborhood": "Koreatown",   # not canonical
        "zip_code": "11211",
    })
    assert r.status_code == 200, r.text
    db_session.expire(test_user)
    updated = db_session.query(User).filter(User.id == test_user.id).first()
    assert updated.neighborhood == "Williamsburg"


def test_register_canonical_neighborhood_is_honored(authed_client, db_session, test_user):
    _ensure_zip(db_session, "11103", 40.763, -73.913, "Queens")
    r = authed_client.post("/api/auth/register", json={
        "display_name": "Belt Tester",
        "neighborhood": "Astoria",
        "zip_code": "11103",
    })
    assert r.status_code == 200, r.text
    db_session.expire(test_user)
    updated = db_session.query(User).filter(User.id == test_user.id).first()
    assert updated.neighborhood == "Astoria"
```

- [ ] **Step 8: Run the full resolution suite**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_resolution.py -q`
Expected: PASS (run after Task 5 has applied migration 0020 to cosello-dev).

- [ ] **Step 9: Commit**

```bash
git add backend/services/neighborhood.py backend/routers/auth.py backend/tests/test_neighborhood_resolution.py
git commit -m "feat(auth): derive canonical neighborhood from ZIP as registration backstop"
```

---

## Task 5: Migration 0020 — insert the 19 commuter-belt communities

**Files:**
- Create: `supabase/migrations/0020_commuter_belt_communities.sql`
- Modify: `backend/tests/test_neighborhood_community.py` (assert coverage)

**Interfaces:**
- Consumes: `NYC_NEIGHBORHOODS` (Task 1).
- Produces: 19 system-owned `communities` rows (one per belt neighborhood), idempotent.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0020_commuter_belt_communities.sql` (mirrors 0007/0008):

```sql
-- 0020_commuter_belt_communities.sql
-- Pre-seed one public Community row per Queens/Brooklyn commuter-belt
-- neighborhood, owned by the Cosello system user
-- (00000000-0000-0000-0000-000000000001). Idempotent via
-- ON CONFLICT (invite_code) DO NOTHING.

BEGIN;

INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Long Island City',          NULL, 'Long Island City',          NULL, NULL, NULL, TRUE, 'NBHD-LIC',               '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Astoria',                   NULL, 'Astoria',                   NULL, NULL, NULL, TRUE, 'NBHD-ASTORIA',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Sunnyside',                 NULL, 'Sunnyside',                 NULL, NULL, NULL, TRUE, 'NBHD-SUNNYSIDE',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Woodside',                  NULL, 'Woodside',                  NULL, NULL, NULL, TRUE, 'NBHD-WOODSIDE',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Jackson Heights',           NULL, 'Jackson Heights',           NULL, NULL, NULL, TRUE, 'NBHD-JACKSON-HEIGHTS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Forest Hills',              NULL, 'Forest Hills',              NULL, NULL, NULL, TRUE, 'NBHD-FOREST-HILLS',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Greenpoint',                NULL, 'Greenpoint',                NULL, NULL, NULL, TRUE, 'NBHD-GREENPOINT',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Williamsburg',              NULL, 'Williamsburg',              NULL, NULL, NULL, TRUE, 'NBHD-WILLIAMSBURG',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Bushwick',                  NULL, 'Bushwick',                  NULL, NULL, NULL, TRUE, 'NBHD-BUSHWICK',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Bedford-Stuyvesant',        NULL, 'Bedford-Stuyvesant',        NULL, NULL, NULL, TRUE, 'NBHD-BED-STUY',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Clinton Hill',              NULL, 'Clinton Hill',              NULL, NULL, NULL, TRUE, 'NBHD-CLINTON-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('DUMBO',                     NULL, 'DUMBO',                     NULL, NULL, NULL, TRUE, 'NBHD-DUMBO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Boerum Hill',               NULL, 'Boerum Hill',               NULL, NULL, NULL, TRUE, 'NBHD-BOERUM-HILL',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Prospect Heights',          NULL, 'Prospect Heights',          NULL, NULL, NULL, TRUE, 'NBHD-PROSPECT-HEIGHTS',  '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Park Slope',                NULL, 'Park Slope',                NULL, NULL, NULL, TRUE, 'NBHD-PARK-SLOPE',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Carroll Gardens',           NULL, 'Carroll Gardens',           NULL, NULL, NULL, TRUE, 'NBHD-CARROLL-GARDENS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Crown Heights',             NULL, 'Crown Heights',             NULL, NULL, NULL, TRUE, 'NBHD-CROWN-HEIGHTS',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Prospect-Lefferts Gardens', NULL, 'Prospect-Lefferts Gardens', NULL, NULL, NULL, TRUE, 'NBHD-PLG',               '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Flatbush',                  NULL, 'Flatbush',                  NULL, NULL, NULL, TRUE, 'NBHD-FLATBUSH',          '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Auto-join the system user to every system-owned community (mirrors 0007/0008).
INSERT INTO public.community_members (community_id, user_id, role, joined_at)
SELECT c.id, '00000000-0000-0000-0000-000000000001'::uuid, 'owner', NOW()
FROM public.communities c
WHERE c.created_by = '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (community_id, user_id) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply the migration to cosello-dev (session pooler)**

Run (psql against the cosello-dev session pooler; use the `DATABASE_URL` from `.env.test` with `:6543` → `:5432`):
```bash
cd backend && set -a && source .env.test && set +a && \
  psql "${DATABASE_URL/:6543\//:5432/}" -f ../supabase/migrations/0020_commuter_belt_communities.sql
```
Expected: `BEGIN … INSERT 0 19 … COMMIT` (second run: `INSERT 0 0`).

- [ ] **Step 3: Write the coverage assertion**

Add to `backend/tests/test_neighborhood_community.py`:

```python
def test_every_canonical_neighborhood_has_a_community(db_session):
    """Each NYC_NEIGHBORHOODS entry must have a system-owned community row."""
    from constants.neighborhoods import NYC_NEIGHBORHOODS
    from services.neighborhood import get_neighborhood_community
    missing = [n for n in NYC_NEIGHBORHOODS
               if get_neighborhood_community(db_session, n) is None]
    assert missing == [], f"neighborhoods with no community row: {missing}"
```

- [ ] **Step 4: Run the community coverage test**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_community.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_commuter_belt_communities.sql backend/tests/test_neighborhood_community.py
git commit -m "feat(migration): seed 19 commuter-belt neighborhood communities (0020)"
```

> **Prod note (do NOT run during implementation):** before the `dev → main` release, apply `0020` to prod and run `seed_zip_centroids.py` against prod. Captured in the backlog release-prep item.

---

## Task 6: Frontend — add the 27 belt ZIPs to `nycZips.ts`

**Files:**
- Modify: `frontend/src/lib/nycZips.ts`

**Interfaces:**
- Produces: belt entries present in `NYC_ZIPS` (so `NYC_ZIP_SET` includes them), canonical entries in `ZIP_NEIGHBORHOOD`, representative ZIPs in `NEIGHBORHOOD_ZIP`. Values mirror the backend `ZIP_NEIGHBORHOOD` from Task 2.

- [ ] **Step 1: Add belt entries to `NYC_ZIPS`**

Append to the `NYC_ZIPS` array (display `neighborhood` may be the friendly label; keep ascending grouping by appending a Queens/Brooklyn block):

```ts
  // --- Queens (commuter belt) ---
  { zip: "11101", neighborhood: "Long Island City" },
  { zip: "11102", neighborhood: "Astoria" },
  { zip: "11103", neighborhood: "Astoria" },
  { zip: "11104", neighborhood: "Sunnyside" },
  { zip: "11105", neighborhood: "Astoria" },
  { zip: "11106", neighborhood: "Astoria" },
  { zip: "11109", neighborhood: "Long Island City" },
  { zip: "11372", neighborhood: "Jackson Heights" },
  { zip: "11375", neighborhood: "Forest Hills" },
  { zip: "11377", neighborhood: "Woodside" },
  // --- Brooklyn (commuter belt) ---
  { zip: "11201", neighborhood: "DUMBO" },
  { zip: "11205", neighborhood: "Clinton Hill" },
  { zip: "11206", neighborhood: "Williamsburg" },
  { zip: "11211", neighborhood: "Williamsburg" },
  { zip: "11213", neighborhood: "Crown Heights" },
  { zip: "11215", neighborhood: "Park Slope" },
  { zip: "11216", neighborhood: "Bedford-Stuyvesant" },
  { zip: "11217", neighborhood: "Boerum Hill" },
  { zip: "11221", neighborhood: "Bushwick" },
  { zip: "11222", neighborhood: "Greenpoint" },
  { zip: "11225", neighborhood: "Prospect-Lefferts Gardens" },
  { zip: "11226", neighborhood: "Flatbush" },
  { zip: "11231", neighborhood: "Carroll Gardens" },
  { zip: "11233", neighborhood: "Bedford-Stuyvesant" },
  { zip: "11237", neighborhood: "Bushwick" },
  { zip: "11238", neighborhood: "Prospect Heights" },
  { zip: "11249", neighborhood: "Williamsburg" },
```

- [ ] **Step 2: Add the same ZIPs to `ZIP_NEIGHBORHOOD`** (canonical values — identical to backend Task 2). Append inside the `ZIP_NEIGHBORHOOD` object:

```ts
  // --- Queens (commuter belt) ---
  "11101": "Long Island City", "11109": "Long Island City",
  "11102": "Astoria", "11103": "Astoria", "11105": "Astoria", "11106": "Astoria",
  "11104": "Sunnyside", "11377": "Woodside", "11372": "Jackson Heights", "11375": "Forest Hills",
  // --- Brooklyn (commuter belt) ---
  "11222": "Greenpoint", "11211": "Williamsburg", "11249": "Williamsburg", "11206": "Williamsburg",
  "11237": "Bushwick", "11221": "Bushwick", "11216": "Bedford-Stuyvesant", "11233": "Bedford-Stuyvesant",
  "11205": "Clinton Hill", "11201": "DUMBO", "11217": "Boerum Hill", "11238": "Prospect Heights",
  "11215": "Park Slope", "11231": "Carroll Gardens", "11213": "Crown Heights",
  "11225": "Prospect-Lefferts Gardens", "11226": "Flatbush",
```

- [ ] **Step 3: Add the 19 representative ZIPs to `NEIGHBORHOOD_ZIP`** (mirror Task 2's representative-ZIP list — `Long Island City: 11101`, `Astoria: 11102`, … `Flatbush: 11226`).

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/nycZips.ts
git commit -m "feat(fe): add Queens/Brooklyn commuter-belt ZIPs to nycZips"
```

---

## Task 7: Frontend — expand the Mapbox autocomplete bounding box

**Files:**
- Modify: `frontend/src/lib/mapboxSearch.ts:43`

**Interfaces:** none (internal constant).

- [ ] **Step 1: Widen `NYC_BBOX`**

Replace line 43 so the bbox covers the commuter belt (LIC/Astoria east, down through Flatbush south). Min/max lng/lat covering ~Greenpoint→Forest Hills→Flatbush plus Manhattan:

```ts
const NYC_BBOX = "-74.03,40.63,-73.84,40.88"; // Manhattan + close-in Queens/Brooklyn belt
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual smoke (note for QA)**

In dev, typing a Williamsburg or Astoria street address must now surface a suggestion whose `zip` is in the belt set. (Verified in QA Task 9; no automated FE test harness exists.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/mapboxSearch.ts
git commit -m "feat(fe): widen address-autocomplete bbox to the commuter belt"
```

---

## Task 8: Frontend — editable suggested-neighborhood dropdown at registration

**Files:**
- Modify: `frontend/src/pages/signup/steps/LocationStep.tsx`
- Modify: `frontend/src/pages/signup/SignUpWizard.tsx`

**Interfaces:**
- Consumes: `ZIP_NEIGHBORHOOD` from `../../../lib/nycZips` (Task 6), `useNeighborhoods` from `../../../lib/useNeighborhoods`.

- [ ] **Step 1: Make the neighborhood field an editable canonical dropdown in `LocationStep`**

Extend `LocationStepProps` with `onChangeNeighborhood: (v: string) => void` and the canonical list state. Replace the read-only neighborhood `<input>` (lines ~59-62) with a native `<select>` driven by `useNeighborhoods()`. Keep the existing read-only City/State/ZIP inputs.

```tsx
import { useNeighborhoods } from "../../../lib/useNeighborhoods";
// ...add to LocationStepProps:
//   onChangeNeighborhood: (v: string) => void;

// inside the component:
const { list: neighborhoods, isLoading: nbLoading } = useNeighborhoods();

// replace the Neighborhood field block with:
<div>
  <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Neighborhood</div>
  <select
    className={roInput}
    value={neighborhood}
    onChange={(e) => onChangeNeighborhood(e.target.value)}
    disabled={nbLoading}
  >
    {!neighborhood && <option value="">Select a neighborhood</option>}
    {(neighborhoods ?? []).map((n) => (
      <option key={n} value={n}>{n}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 2: Prefill from the ZIP and wire the handler in `SignUpWizard`**

In `SignUpWizard.tsx`, import the map and set the neighborhood default from the ZIP on address select (replacing the Mapbox-neighborhood assignment), and pass the new handler:

```tsx
import { ZIP_NEIGHBORHOOD } from "../../lib/nycZips";
// ...
onSelect={(s) => {
  setAddress(s.label);
  setZip(s.zip);
  setCity(s.city ?? "");
  setState(s.state ?? "");
  setNeighborhood(ZIP_NEIGHBORHOOD[s.zip] ?? "");   // canonical suggestion, not the Mapbox label
  setAddrSelected(true);
}}
// add to <LocationStep .../>:
onChangeNeighborhood={setNeighborhood}
```

- [ ] **Step 3: Guard the step gate on a chosen neighborhood**

In `SignUpWizard.tsx:stepReady`, change the location case so the user cannot continue without a neighborhood selected:

```tsx
      case "location": return addrSelected && !!neighborhood.trim();
```

(The submit already sends `neighborhood: neighborhood.trim()`, which is now always a canonical value; `ReviewStep` already displays it.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/signup/steps/LocationStep.tsx frontend/src/pages/signup/SignUpWizard.tsx
git commit -m "feat(fe): editable ZIP-suggested neighborhood dropdown at registration"
```

---

## Task 9: QA — end-to-end verification (qa-tester, runs last)

**Files:** none (verification only).

- [ ] **Step 1: Backend suite green**

Run: `cd backend && set -a && source .env.test && set +a && python -m pytest tests/test_neighborhood_zips.py tests/test_neighborhood_resolution.py tests/test_neighborhood_community.py tests/test_onboarding_zip.py -q`
Expected: PASS.

- [ ] **Step 2: Frontend typecheck green**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: E2E registration — Brooklyn**

In dev: register a new phone account, type a Williamsburg street address → suggestion surfaces → neighborhood dropdown prefilled to "Williamsburg" → submit. Expected: 200, user lands in the Williamsburg community.

- [ ] **Step 4: E2E registration — Queens + manual change**

Type an Astoria address → dropdown prefilled "Astoria" → change it to a different canonical neighborhood (e.g. "Long Island City") → submit. Expected: 200, user neighborhood = the chosen value.

- [ ] **Step 5: Backstop check**

Confirm an off-list label cannot block registration: covered by `test_register_offlist_label_falls_back_to_zip` (Task 4). Confirm no raw 400 surfaces for any belt address.

- [ ] **Step 6: Regression — Manhattan unchanged**

Register a Manhattan address (e.g. 10014) → dropdown prefilled "West Village" → submit 200. Confirm existing Manhattan flow is unaffected.

- [ ] **Step 7: Produce QA report** to the main session (pass/fail per step).

---

## Self-review notes (author)

- **Spec coverage:** reference data (Task 2/3/6), rename (Task 1), migration (Task 5), BE resolution (Task 4), FE bbox (Task 7), editable dropdown (Task 8), QA (Task 9) — all spec sections covered. **Deviation from spec:** the `GET /neighborhoods/suggest?zip=` endpoint is dropped — the FE already maintains a canonical `ZIP_NEIGHBORHOOD` map (`nycZips.ts`), so the prefill derives locally; backend keeps its own map for the server-side backstop. Net: fewer moving parts, same behavior. Spec updated to match.
- **Settings/Edit-Profile alignment:** no structural task needed — `EditProfileModal` already type-filters against the canonical `useNeighborhoods` list and lists `NYC_ZIPS` for the ZIP select, so it inherits the new neighborhoods/ZIPs from Tasks 1 and 6 automatically.
- **Type consistency:** `neighborhood_for_zip`, `ZIP_NEIGHBORHOOD`, `NYC_NEIGHBORHOODS`, `all_seed_zips` used consistently across tasks.
