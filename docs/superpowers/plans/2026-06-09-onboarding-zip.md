# Onboarding ZIP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user gets a valid NYC ZIP so geotag distance works — required + auto-prefilled at signup for new users; derived-from-neighborhood + a confirm-banner for existing users.

**Architecture:** A mirrored `neighborhood → representative ZIP` constant (backend + frontend) prefills the required signup ZIP dropdown and powers a one-time derive backfill for existing ZIP-less users. A new `User.zip_confirmed` flag (false = derived/unset) drives a marketplace banner that nudges existing users to confirm. `PUT /api/auth/profile` validates ZIPs against `zip_centroids` and sets `zip_confirmed=true`.

**Tech Stack:** FastAPI/SQLAlchemy (Supabase Postgres, `supabase/migrations/`), pytest; React+TS (`npm run typecheck`/`build`).

**Spec:** `docs/superpowers/specs/2026-06-08-onboarding-zip-design.md`

**Deviation from spec:** `/neighborhoods` returns a plain `string[]` (routers/communities.py:104), so extending it to objects would break consumers. Instead the `neighborhood → ZIP` map is a **mirrored constant** in backend (`constants/neighborhood_zips.py`) and frontend (`lib/nycZips.ts`). A backend test asserts every neighborhood maps to a seeded ZIP; a frontend check keeps the two in sync conceptually (same 43 keys).

**Migration note:** schema change ships as `supabase/migrations/0010_zip_confirmed.sql` + the model edit. **The user applies the migration** (as with 0009) before the DB-touching pytest tasks run.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `backend/constants/neighborhood_zips.py` | `NEIGHBORHOOD_ZIP` map | Create |
| `backend/tests/test_neighborhood_zips.py` | every neighborhood → seeded ZIP | Create |
| `supabase/migrations/0010_zip_confirmed.sql` | `users.zip_confirmed` column | Create |
| `backend/models.py` | `User.zip_confirmed` | Modify |
| `backend/routers/auth.py` | `UserOut.zip_confirmed`; validate ZIP + set confirmed in `update_profile`/create | Modify |
| `backend/scripts/derive_user_zips.py` | derive ZIP from neighborhood for ZIP-less users | Create |
| `backend/tests/test_onboarding_zip.py` | profile validation + confirmed flag | Create |
| `frontend/src/lib/nycZips.ts` | mirror `NEIGHBORHOOD_ZIP` (TS) | Modify |
| `frontend/src/contexts/AuthContext.tsx` | `AuthUser.zip_confirmed` | Modify |
| `frontend/src/pages/SignUpPage.tsx` | required ZIP dropdown + prefill from neighborhood | Modify |
| `frontend/src/pages/MyAccount/modals/EditProfileModal.tsx` | ZIP free-text → `NYC_ZIPS` dropdown | Modify |
| `frontend/src/components/ConfirmZipBanner.tsx` | confirm-ZIP banner | Create |
| `frontend/src/App.tsx` | render banner atop marketplace | Modify |

---

### Task 1: `NEIGHBORHOOD_ZIP` map + test

**Files:** Create `backend/constants/neighborhood_zips.py`, `backend/tests/test_neighborhood_zips.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_neighborhood_zips.py
from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP
from scripts.seed_zip_centroids import MANHATTAN_ZIPS

_SEEDED = {z[0] for z in MANHATTAN_ZIPS}

def test_every_neighborhood_maps_to_a_seeded_zip():
    for n in MANHATTAN_NEIGHBORHOODS:
        assert n in NEIGHBORHOOD_ZIP, f"missing map entry: {n}"
        assert NEIGHBORHOOD_ZIP[n] in _SEEDED, f"{n} -> {NEIGHBORHOOD_ZIP[n]} not seeded"

def test_no_extra_keys():
    assert set(NEIGHBORHOOD_ZIP) == set(MANHATTAN_NEIGHBORHOODS)
```

- [ ] **Step 2: Run, expect fail** — `cd backend && python -m pytest tests/test_neighborhood_zips.py -q` → `ModuleNotFoundError`.

- [ ] **Step 3: Create the map**

```python
# backend/constants/neighborhood_zips.py
"""Representative seeded ZIP per Manhattan neighborhood. Used to prefill the
signup ZIP and to derive a default for ZIP-less existing users. Coarse by
design (neighborhood-level); users refine via the dropdown. Every value MUST be
a ZIP seeded in scripts/seed_zip_centroids.py (enforced by test_neighborhood_zips)."""

NEIGHBORHOOD_ZIP: dict[str, str] = {
    "Battery Park City": "10280", "Carnegie Hill": "10128", "Chelsea": "10011",
    "Chinatown": "10013", "Civic Center": "10007", "Clinton (Hell's Kitchen)": "10019",
    "East Harlem": "10029", "East Village": "10009", "Financial District": "10004",
    "Flatiron District": "10010", "Gramercy Park": "10010", "Greenwich Village": "10012",
    "Hamilton Heights": "10031", "Harlem": "10027", "Hudson Heights": "10033",
    "Inwood": "10034", "Kips Bay": "10016", "Lenox Hill": "10021",
    "Lincoln Square": "10023", "Little Italy": "10013", "Lower East Side": "10002",
    "Marble Hill": "10034", "Midtown East": "10022", "Midtown West": "10019",
    "Morningside Heights": "10025", "Murray Hill": "10016", "NoHo": "10012",
    "NoMad": "10001", "Nolita": "10012", "Roosevelt Island": "10044",
    "SoHo": "10012", "Stuyvesant Town": "10009", "Sutton Place": "10022",
    "Theater District": "10036", "Tribeca": "10013", "Tudor City": "10017",
    "Turtle Bay": "10022", "Two Bridges": "10002", "Upper East Side": "10021",
    "Upper West Side": "10024", "Washington Heights": "10032", "West Village": "10014",
    "Yorkville": "10028",
}
```

- [ ] **Step 4: Run, expect pass** — `python -m pytest tests/test_neighborhood_zips.py -q` → 2 passed.
- [ ] **Step 5: Commit** — `git add backend/constants/neighborhood_zips.py backend/tests/test_neighborhood_zips.py && git commit -m "feat(geo): neighborhood→ZIP map (+ completeness test)"`

---

### Task 2: `zip_confirmed` column + model + UserOut

**Files:** Create `supabase/migrations/0010_zip_confirmed.sql`; Modify `backend/models.py`, `backend/routers/auth.py`

- [ ] **Step 1: Migration SQL**

```sql
-- supabase/migrations/0010_zip_confirmed.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_confirmed boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Model** — add to the `User` class in `backend/models.py` (next to `zip_code`):

```python
    zip_confirmed = Column(Boolean, nullable=False, server_default="false", default=False)
```

(`Boolean` is already imported if used elsewhere; if not, add it to the SQLAlchemy import.)

- [ ] **Step 3: `UserOut`** — add `zip_confirmed: bool = False` to the `UserOut` model (routers/auth.py:33) and set it in the constructor that builds `UserOut` from a `User` (the `zip_code=user.zip_code` site ~line 60): add `zip_confirmed=bool(user.zip_confirmed)`.

- [ ] **Step 4: Apply migration** — `psql "$DATABASE_URL" -f supabase/migrations/0010_zip_confirmed.sql` (or dashboard). Verify `SELECT zip_confirmed FROM users LIMIT 1;` runs.
- [ ] **Step 5: Import smoke** — `cd backend && python -c "from models import User; print('zip_confirmed' in User.__table__.columns)"` → `True`.
- [ ] **Step 6: Commit** — `git add supabase/migrations/0010_zip_confirmed.sql backend/models.py backend/routers/auth.py && git commit -m "feat(geo): users.zip_confirmed column + UserOut field"`

---

### Task 3: `PUT /api/auth/profile` — validate ZIP + set confirmed

**Files:** Modify `backend/routers/auth.py` (`update_profile` ~line 110-126, and the create/upsert path ~line 96); Test `backend/tests/test_onboarding_zip.py`

- [ ] **Step 1: Add validation + confirmed.** Wherever the profile handler does `current_user.zip_code = req.zip_code` (line 121) and the create-path `existing.zip_code = req.zip_code` (line 97), wrap with validation + set confirmed. Add a helper at module top:

```python
def _validate_and_set_zip(db, user, zip_code: str) -> None:
    from models import ZipCentroid
    z = (zip_code or "").strip()
    if not z or db.get(ZipCentroid, z) is None:
        raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
    user.zip_code = z
    user.zip_confirmed = True
```

Then replace `if req.zip_code is not None: current_user.zip_code = req.zip_code` with `if req.zip_code is not None: _validate_and_set_zip(db, current_user, req.zip_code)` (and the create-path equivalent for `existing`). (`HTTPException` is already imported in this router; confirm.)

- [ ] **Step 2: Failing tests**

```python
# backend/tests/test_onboarding_zip.py
def test_profile_update_rejects_unseeded_zip(authed_client, test_user, db_session):
    r = authed_client.put("/api/auth/profile", json={"zip_code": "99999"})
    assert r.status_code == 400

def test_profile_update_valid_zip_sets_confirmed(authed_client, test_user, db_session):
    from models import ZipCentroid, User
    if db_session.get(ZipCentroid, "10014") is None:
        db_session.add(ZipCentroid(zip_code="10014", latitude=40.734, longitude=-74.006, borough="Manhattan")); db_session.commit()
    r = authed_client.put("/api/auth/profile", json={"zip_code": "10014"})
    assert r.status_code == 200
    db_session.refresh(test_user)
    assert test_user.zip_code == "10014" and test_user.zip_confirmed is True
    assert r.json()["zip_confirmed"] is True
```

(Match the real request shape `update_profile` expects — it takes a JSON body model; confirm field names. If `display_name`/`neighborhood` are required by the model, include valid values in the body.)

- [ ] **Step 3: Run** — `cd backend && python -m pytest tests/test_onboarding_zip.py -q` → pass.
- [ ] **Step 4: Commit** — `git add backend/routers/auth.py backend/tests/test_onboarding_zip.py && git commit -m "feat(geo): profile update validates ZIP + sets zip_confirmed"`

---

### Task 4: `derive_user_zips.py` backfill

**Files:** Create `backend/scripts/derive_user_zips.py`

- [ ] **Step 1: Script**

```python
# backend/scripts/derive_user_zips.py
"""Derive a ZIP for existing ZIP-less users from their neighborhood. Idempotent:
only fills users with a neighborhood and no ZIP; leaves zip_confirmed=False so
the confirm-banner nudges them. Run at deploy.
Run: cd backend && python -m scripts.derive_user_zips
"""
from database import SessionLocal
from models import User
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP


def main() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).filter(
            (User.zip_code == None) | (User.zip_code == "")  # noqa: E711
        ).all()
        filled = skipped = 0
        for u in users:
            z = NEIGHBORHOOD_ZIP.get((u.neighborhood or "").strip())
            if z:
                u.zip_code = z
                u.zip_confirmed = False
                filled += 1
            else:
                skipped += 1
        db.commit()
        print(f"Derived ZIPs for {filled} user(s); skipped {skipped} with no mappable neighborhood.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run** — `cd backend && python -m scripts.derive_user_zips` → prints counts; re-run → idempotent (0 filled second time, since they now have ZIPs).
- [ ] **Step 3: Commit** — `git add backend/scripts/derive_user_zips.py && git commit -m "feat(geo): derive ZIP from neighborhood for existing users"`

---

### Task 5: Frontend constant mirror + `AuthUser` flag

**Files:** Modify `frontend/src/lib/nycZips.ts`, `frontend/src/contexts/AuthContext.tsx`

- [ ] **Step 1: Mirror the map in TS.** Add to `nycZips.ts` a `NEIGHBORHOOD_ZIP: Readonly<Record<string, string>>` with the **exact same 43 entries** as `backend/constants/neighborhood_zips.py` (transcribe). Export it.
- [ ] **Step 2: `AuthUser`** — add `zip_confirmed: boolean;` to the `AuthUser` interface (AuthContext.tsx:4). Ensure wherever `AuthUser` is built from the `/api/auth/me` (or profile) response, `zip_confirmed` is read (default `false` if absent).
- [ ] **Step 3: Typecheck** — `cd frontend && npm run typecheck`. Fix any `AuthUser` literal missing the field.
- [ ] **Step 4: Commit** — `git add frontend/src/lib/nycZips.ts frontend/src/contexts/AuthContext.tsx && git commit -m "feat(geo): NEIGHBORHOOD_ZIP (FE) + AuthUser.zip_confirmed"`

---

### Task 6: SignUpPage — required ZIP dropdown + prefill

**Files:** Modify `frontend/src/pages/SignUpPage.tsx`

- [ ] **Step 1: Replace the free-text ZIP `Input`** (the `zipCode`/`setZipCode` Input) with a **required `<select>`** of `NYC_ZIPS` (option `{zip} — {neighborhood}`, disabled "Select ZIP" placeholder).
- [ ] **Step 2: Prefill from neighborhood.** When the neighborhood becomes valid (the existing `isValidNeighborhood` / selection), if the user hasn't manually changed the ZIP, set `zipCode = NEIGHBORHOOD_ZIP[neighborhood] ?? ""`. Track a `zipTouched` flag so re-selecting a neighborhood re-prefills only when untouched.
- [ ] **Step 3: Require it.** Add to the submit guard (next to the name/neighborhood checks ~line 48-53): if `!NYC_ZIP_SET.has(zipCode)` → `setError("Select your ZIP code")` and return. Keep sending `zip_code: zipCode` (no longer `|| undefined`) in the `PUT /api/auth/profile` body (line 71).
- [ ] **Step 4: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` clean.
- [ ] **Step 5: Commit** — `git add frontend/src/pages/SignUpPage.tsx && git commit -m "feat(geo): required ZIP dropdown + neighborhood prefill at signup"`

---

### Task 7: EditProfileModal — ZIP dropdown

**Files:** Modify `frontend/src/pages/MyAccount/modals/EditProfileModal.tsx`

- [ ] **Step 1: Replace the ZIP `Input`** (`editZipCode`/`setEditZipCode`, ~line 175-179) with the same `NYC_ZIPS` `<select>` used in signup. (Backend now 400s on an unseeded ZIP, so free-text would break profile saves — the dropdown guarantees validity.) Keep it optional-to-not-block other edits only if `editZipCode` was already empty; otherwise a selected value is fine. Simplest: render the dropdown; if the user's current zip isn't in `NYC_ZIP_SET`, show the placeholder.
- [ ] **Step 2: Typecheck + build** clean.
- [ ] **Step 3: Commit** — `git add frontend/src/pages/MyAccount/modals/EditProfileModal.tsx && git commit -m "feat(geo): ZIP dropdown in Edit Profile"`

---

### Task 8: ConfirmZipBanner + marketplace integration

**Files:** Create `frontend/src/components/ConfirmZipBanner.tsx`; Modify `frontend/src/App.tsx`

- [ ] **Step 1: Banner component.** Props: `currentZip: string | null`, `onConfirm: (zip: string) => Promise<void>`. Renders a slim bar: copy "Confirm your ZIP code so we can show accurate distances", a `NYC_ZIPS` `<select>` defaulted to `currentZip` (if in `NYC_ZIP_SET`), a "Confirm" button → `onConfirm(selectedZip)`, and a "Not now" that hides it via local/session state (`sessionStorage` flag) so it returns next session. No `any`.
- [ ] **Step 2: Render atop the marketplace** in `App.tsx` — where the market page renders (near the listings grid / sidebar), show `<ConfirmZipBanner>` when `isAuthenticated && user && user.zip_confirmed === false` and not session-dismissed. `onConfirm` calls `PUT /api/auth/profile` with `{ zip_code }` (include the existing required fields `display_name`/`neighborhood` from `user` so the update validates), then **refreshes the auth user** (the existing refetch/refresh in AuthContext) so `zip_confirmed` flips to `true` and the banner hides without reload.
- [ ] **Step 3: Typecheck + build** clean.
- [ ] **Step 4: Commit** — `git add frontend/src/components/ConfirmZipBanner.tsx frontend/src/App.tsx && git commit -m "feat(geo): confirm-ZIP marketplace banner for unconfirmed users"`

---

## QA Handoff

- New signup: ZIP dropdown required, prefills from neighborhood, can't submit without a valid ZIP; new user → `zip_confirmed=true`, no banner.
- `derive_user_zips.py`: idempotent; fills ZIP from neighborhood for ZIP-less users; leaves `zip_confirmed=false`; never overwrites an existing ZIP.
- Existing unconfirmed user: marketplace banner shows; Confirm sets `zip_confirmed=true`, hides banner (no reload), distances compute; "Not now" hides for the session only.
- `PUT /profile`: unseeded ZIP → 400; valid ZIP → 200 + `zip_confirmed=true`.
- `NEIGHBORHOOD_ZIP` FE/BE have identical 43 keys; every value is seeded (backend test).
- Backend `pytest` green; frontend `typecheck`/`build` clean; migration `0010` applies.
