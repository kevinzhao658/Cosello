# Circles — Phase 1: Backend Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the backend data model, consent storage, and school seed for the Circles system, with zero user-facing behavior change yet.

**Architecture:** Reuse the existing `communities` / `community_members` tables rather than renaming them (JoinRequest, Notification, friends, ranking, orders, and the neighborhood service all reference them — a rename is needlessly invasive). We *type* communities with a new `kind` column (`building` | `school` | `neighborhood` | `interest`), add a per-membership `share_with_mutuals` consent flag, add a user-level `share_mutual_friends` flag (mutual friends has no membership row), and add a `school_seed` reference table to back the school autocomplete. All new write paths live in a focused `services/circles.py`. No enrichment, ranking, registration, or display changes in this phase — those are Phases 2–5.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres, SQL migrations in `supabase/migrations/`, pytest (fixtures in `backend/tests/conftest.py`; DB tests seed users via the Supabase Admin API and skip when `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are unset).

---

## Roadmap (this plan is Phase 1 of 5)

- **Phase 1 — Backend data layer (this plan):** migration, models, `services/circles.py` (building derivation, school seed search + add/remove with max-2, consent setters). Pure data, fully unit-tested.
- **Phase 2 — Enrichment + ranking + orders repoint (separate plan):** rewrite feed/listing enrichment to derive *seller → circle memberships → viewer intersection*, gated by `share_with_mutuals`; repoint `ranking.py` circle-overlap to seller↔viewer circles; move `orders.py` neighborhood-pickup off `Listing.communities` onto `user.neighborhood`. Retire the seller-picks `communities` form field on create-listing.
- **Phase 3 — Registration 4-step wizard (separate plan):** segment `SignUpPage.tsx` into Name → Location (Mapbox reverse-geocode neighborhood/ZIP, derive building) → School (search/select, up to 2, skip) → Circles consent clicker; extend `POST /api/auth/register`; Welcome → Start-selling.
- **Phase 4 — Marketplace feed display (separate plan):** fixed three-slot byline (building · school · mutual friends), lit = revealed mutual (tooltip + friend count), faded = uniform/no-tooltip, on `ListingCard`.
- **Phase 5 — My Account Circles + profile (separate plan):** Settings → Circles toggles + school add/remove; profile schools line (no verification).

---

## File Structure (Phase 1)

- Create: `supabase/migrations/0013_circles.sql` — schema changes.
- Modify: `backend/models.py` — add `Community.kind`, `Community.school_seed_id`, `CommunityMember.share_with_mutuals`, `User.share_mutual_friends`; add `SchoolSeed` model.
- Create: `backend/services/circles.py` — all circle write/query helpers (single responsibility: circle membership + school seed + building derivation).
- Create: `backend/scripts/seed_schools.py` — one-time loader for the US higher-ed seed table from a CSV.
- Create: `backend/tests/test_circles.py` — unit tests for `services/circles.py`.

---

## Task 1: Migration `0013_circles.sql`

**Files:**
- Create: `supabase/migrations/0013_circles.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Circles Phase 1: type communities, add per-membership consent, add a
-- user-level mutual-friends consent flag, and a school seed reference table.
-- Backward compatible: existing communities default to kind='interest';
-- existing memberships default share_with_mutuals=false (opt-in).

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'interest',
  ADD COLUMN IF NOT EXISTS school_seed_id INTEGER;

-- Existing neighborhood communities (created by services/neighborhood.py) are
-- retyped so Phase 2 can tell them apart from interest communities.
UPDATE public.communities
  SET kind = 'neighborhood'
  WHERE neighborhood IS NOT NULL AND name = neighborhood;

ALTER TABLE public.community_members
  ADD COLUMN IF NOT EXISTS share_with_mutuals BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS share_mutual_friends BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.school_seed (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  state       VARCHAR(2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigram-style prefix search support for the autocomplete.
CREATE INDEX IF NOT EXISTS idx_school_seed_name_lower
  ON public.school_seed (lower(name));

-- Link a school-kind community back to the seed row it was created from.
ALTER TABLE public.communities
  ADD CONSTRAINT fk_communities_school_seed
  FOREIGN KEY (school_seed_id) REFERENCES public.school_seed(id)
  ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration to the dev database**

Run: `supabase db push` (from repo root, against the linked dev project), or apply via the Supabase SQL editor if `supabase` CLI is not linked.
Expected: migration applies cleanly; `\d public.communities` shows `kind` and `school_seed_id`; `school_seed` table exists.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_circles.sql
git commit -m "feat(circles): migration — type communities, consent flags, school_seed table"
```

---

## Task 2: SQLAlchemy model updates

**Files:**
- Modify: `backend/models.py` (`User` ~11-21, `Community` ~24-37, `CommunityMember` ~40-51; add `SchoolSeed`)
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write a failing model-shape test**

```python
# backend/tests/test_circles.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, User, SchoolSeed


def test_models_have_circle_columns():
    assert hasattr(Community, "kind")
    assert hasattr(Community, "school_seed_id")
    assert hasattr(CommunityMember, "share_with_mutuals")
    assert hasattr(User, "share_mutual_friends")
    assert SchoolSeed.__tablename__ == "school_seed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles.py::test_models_have_circle_columns -v`
Expected: FAIL with `ImportError: cannot import name 'SchoolSeed'`.

- [ ] **Step 3: Add the columns and the `SchoolSeed` model**

In `backend/models.py`, add to `User` (after `zip_confirmed`):

```python
    share_mutual_friends = Column(Boolean, nullable=False, server_default="false", default=False)
```

Add to `Community` (after `zip_code`):

```python
    kind = Column(String(20), nullable=False, server_default="interest", default="interest")
    school_seed_id = Column(Integer, ForeignKey("school_seed.id"), nullable=True)
```

Add to `CommunityMember` (after `role`):

```python
    share_with_mutuals = Column(Boolean, nullable=False, server_default="false", default=False)
```

Add a new model (place it right after `CommunityMember`):

```python
class SchoolSeed(Base):
    __tablename__ = "school_seed"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    state = Column(String(2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles.py::test_models_have_circle_columns -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/tests/test_circles.py
git commit -m "feat(circles): model columns + SchoolSeed model"
```

---

## Task 3: Address normalization (pure function)

Two users in the same building must resolve to the same building circle. Normalize the street address to a stable key: lowercase, collapse whitespace, drop unit/apt/suite/floor designators, strip punctuation.

**Files:**
- Create: `backend/services/circles.py`
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_circles.py
from services.circles import normalize_address


def test_normalize_address_strips_unit_and_case():
    assert normalize_address("123 W 21st St, Apt 4B") == "123 w 21st st"
    assert normalize_address("123 W 21st St #4B") == "123 w 21st st"
    assert normalize_address("123 W 21st St, Unit 4") == "123 w 21st st"


def test_normalize_address_collapses_whitespace_and_punct():
    assert normalize_address("  123   W 21st  St.  ") == "123 w 21st st"


def test_normalize_address_empty_is_empty():
    assert normalize_address("") == ""
    assert normalize_address(None) == ""
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_circles.py -k normalize_address -v`
Expected: FAIL with `ImportError: cannot import name 'normalize_address'`.

- [ ] **Step 3: Implement `normalize_address`**

```python
# backend/services/circles.py
"""Circle membership, school seed, and building-derivation helpers.

A "circle" is a typed community (kind in {building, school, neighborhood,
interest}). Building circles are keyed by a normalized street address; school
circles are created from a school_seed row. Mutual-friends consent is a
user-level flag (services here do not touch the friend graph).
"""
import re

from sqlalchemy.orm import Session

from models import Community, CommunityMember, SchoolSeed, User

# Unit designators we strip so "123 Main St Apt 4" == "123 Main St".
# Two patterns: keyword-based (apt/unit/suite/floor) and a bare hash (#4B),
# since "#4B" has no keyword to anchor on.
_UNIT_KEYWORD_RE = re.compile(
    r"[,]?\s*\b(apt|apartment|unit|ste|suite|fl|floor)\b\.?\s*\S*",
    re.IGNORECASE,
)
_UNIT_HASH_RE = re.compile(r"\s*#\s*\S*")
_PUNCT_RE = re.compile(r"[.,]")
_WS_RE = re.compile(r"\s+")


def normalize_address(address: str | None) -> str:
    """Return a stable lowercase key for building matching, or '' if empty."""
    if not address:
        return ""
    s = _UNIT_KEYWORD_RE.sub("", address)
    s = _UNIT_HASH_RE.sub("", s)
    s = _PUNCT_RE.sub("", s)
    s = _WS_RE.sub(" ", s)
    return s.strip().lower()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_circles.py -k normalize_address -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles.py
git commit -m "feat(circles): address normalization for building matching"
```

---

## Task 4: Building circle derivation

When a user sets their address, find-or-create a `kind='building'` community keyed by the normalized address (stored in `Community.name`), and ensure the user is a member. Returns the community.

**Files:**
- Modify: `backend/services/circles.py`
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles.py
from services.circles import set_user_building
from models import Community, CommunityMember


def test_set_user_building_dedupes_by_normalized_address(db_session, make_user):
    u1 = make_user(display_name="A")
    u2 = make_user(display_name="B")
    c1 = set_user_building(db_session, u1, "123 W 21st St, Apt 4B")
    c2 = set_user_building(db_session, u2, "123 W 21st ST #9")
    assert c1.id == c2.id                      # same building circle
    assert c1.kind == "building"
    members = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == c1.id
    ).count()
    assert members == 2
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == c1.id).delete()
    db_session.query(Community).filter(Community.id == c1.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles.py::test_set_user_building_dedupes_by_normalized_address -v`
Expected: FAIL with `ImportError: cannot import name 'set_user_building'` (or SKIP if Supabase env is unset — load `backend/.env` first).

- [ ] **Step 3: Implement `set_user_building`**

```python
# append to backend/services/circles.py
import secrets


def _ensure_member(db: Session, community_id: int, user_id: str) -> CommunityMember:
    m = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
        )
        .first()
    )
    if m is None:
        m = CommunityMember(community_id=community_id, user_id=user_id, role="member")
        db.add(m)
        db.commit()
        db.refresh(m)
    return m


def set_user_building(db: Session, user: User, address: str) -> Community | None:
    """Find-or-create the building circle for `address` and add `user` to it.

    Returns None when the address normalizes to empty.
    """
    key = normalize_address(address)
    if not key:
        return None
    community = (
        db.query(Community)
        .filter(Community.kind == "building", Community.name == key)
        .first()
    )
    if community is None:
        community = Community(
            name=key,
            kind="building",
            is_public=False,
            invite_code=secrets.token_urlsafe(8),
            created_by=user.id,
        )
        db.add(community)
        db.commit()
        db.refresh(community)
    _ensure_member(db, community.id, user.id)
    return community
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles.py::test_set_user_building_dedupes_by_normalized_address -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles.py
git commit -m "feat(circles): building-circle derivation from address"
```

---

## Task 5: School seed search + add/remove (max 2)

**Files:**
- Modify: `backend/services/circles.py`
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_circles.py
import pytest
from services.circles import search_schools, add_user_school, list_user_schools, TooManySchools
from models import SchoolSeed, Community, CommunityMember


@pytest.fixture
def seeded_schools(db_session):
    rows = [
        SchoolSeed(name="New York University", state="NY"),
        SchoolSeed(name="Columbia University", state="NY"),
        SchoolSeed(name="University of Michigan", state="MI"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    ids = [r.id for r in rows]
    yield rows
    db_session.query(Community).filter(Community.school_seed_id.in_(ids)).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()


def test_search_schools_prefix_and_substring(db_session, seeded_schools):
    names = [r.name for r in search_schools(db_session, "univers")]
    assert "Columbia University" in names and "University of Michigan" in names
    assert search_schools(db_session, "") == []


def test_add_user_school_enforces_cap_of_two(db_session, make_user, seeded_schools):
    u = make_user(display_name="S")
    add_user_school(db_session, u, seeded_schools[0].id)
    add_user_school(db_session, u, seeded_schools[1].id)
    with pytest.raises(TooManySchools):
        add_user_school(db_session, u, seeded_schools[2].id)
    assert {s.name for s in list_user_schools(db_session, u.id)} == {
        "New York University", "Columbia University",
    }
    # cleanup memberships
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_circles.py -k school -v`
Expected: FAIL with `ImportError` for `search_schools` / `TooManySchools`.

- [ ] **Step 3: Implement school helpers**

```python
# append to backend/services/circles.py
MAX_SCHOOLS = 2


class TooManySchools(Exception):
    """Raised when a user tries to add more than MAX_SCHOOLS school circles."""


def search_schools(db: Session, query: str, limit: int = 8) -> list[SchoolSeed]:
    """Case-insensitive substring search over the school seed table."""
    q = (query or "").strip()
    if not q:
        return []
    pattern = f"%{q.lower()}%"
    return (
        db.query(SchoolSeed)
        .filter(SchoolSeed.name.ilike(pattern))
        .order_by(SchoolSeed.name)
        .limit(limit)
        .all()
    )


def list_user_schools(db: Session, user_id: str) -> list[Community]:
    return (
        db.query(Community)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(CommunityMember.user_id == user_id, Community.kind == "school")
        .all()
    )


def add_user_school(db: Session, user: User, seed_id: int) -> Community:
    """Add a school circle for `user` from a seed row. Enforces MAX_SCHOOLS."""
    if len(list_user_schools(db, user.id)) >= MAX_SCHOOLS:
        raise TooManySchools(f"max {MAX_SCHOOLS} schools")
    seed = db.query(SchoolSeed).filter(SchoolSeed.id == seed_id).first()
    if seed is None:
        raise ValueError(f"unknown school_seed id {seed_id}")
    community = (
        db.query(Community)
        .filter(Community.kind == "school", Community.school_seed_id == seed_id)
        .first()
    )
    if community is None:
        community = Community(
            name=seed.name,
            kind="school",
            school_seed_id=seed.id,
            is_public=True,
            invite_code=secrets.token_urlsafe(8),
            created_by=user.id,
        )
        db.add(community)
        db.commit()
        db.refresh(community)
    _ensure_member(db, community.id, user.id)
    return community
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_circles.py -k school -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles.py
git commit -m "feat(circles): school seed search + add with max-2 cap"
```

---

## Task 6: Per-circle consent setter

**Files:**
- Modify: `backend/services/circles.py`
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles.py
from services.circles import set_circle_consent


def test_set_circle_consent_toggles_membership_flag(db_session, make_user):
    u = make_user(display_name="C")
    community = set_user_building(db_session, u, "55 Hudson St")
    set_circle_consent(db_session, u.id, community.id, True)
    m = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == community.id,
        CommunityMember.user_id == u.id,
    ).first()
    assert m.share_with_mutuals is True
    set_circle_consent(db_session, u.id, community.id, False)
    db_session.refresh(m)
    assert m.share_with_mutuals is False
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == community.id).delete()
    db_session.query(Community).filter(Community.id == community.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles.py::test_set_circle_consent_toggles_membership_flag -v`
Expected: FAIL with `ImportError: cannot import name 'set_circle_consent'`.

- [ ] **Step 3: Implement `set_circle_consent`**

```python
# append to backend/services/circles.py
def set_circle_consent(db: Session, user_id: str, community_id: int, share: bool) -> None:
    """Set the per-membership share_with_mutuals flag. No-op if not a member."""
    m = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == user_id,
        )
        .first()
    )
    if m is None:
        return
    m.share_with_mutuals = share
    db.commit()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles.py::test_set_circle_consent_toggles_membership_flag -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles.py
git commit -m "feat(circles): per-circle share_with_mutuals consent setter"
```

---

## Task 7: School seed bootstrap loader

One-time loader to populate `school_seed` from a CSV of US higher-ed institutions (College Scorecard / IPEDS export with `INSTNM`, `STABBR`). The CSV is committed under `backend/data/`.

**Files:**
- Create: `backend/scripts/seed_schools.py`
- Create: `backend/data/us_higher_ed.csv` (data artifact — first row header `name,state`)
- Test: `backend/tests/test_circles.py`

- [ ] **Step 1: Write a failing test for the parse step**

```python
# append to backend/tests/test_circles.py
from scripts.seed_schools import parse_rows


def test_parse_rows_dedupes_and_skips_blanks():
    csv_text = "name,state\nNew York University,NY\nNew York University,NY\n,NY\nMIT,MA\n"
    rows = parse_rows(csv_text)
    assert rows == [("New York University", "NY"), ("MIT", "MA")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles.py::test_parse_rows_dedupes_and_skips_blanks -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'scripts.seed_schools'`.

- [ ] **Step 3: Implement the loader**

```python
# backend/scripts/seed_schools.py
"""One-time loader: populate public.school_seed from a US higher-ed CSV.

Usage: python -m scripts.seed_schools backend/data/us_higher_ed.csv
Idempotent: clears and reloads the table.
"""
import csv
import io
import sys

from database import SessionLocal
from models import SchoolSeed


def parse_rows(csv_text: str) -> list[tuple[str, str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for row in reader:
        name = (row.get("name") or "").strip()
        state = (row.get("state") or "").strip()[:2]
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        out.append((name, state))
    return out


def load(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        rows = parse_rows(fh.read())
    db = SessionLocal()
    try:
        db.query(SchoolSeed).delete()
        db.add_all([SchoolSeed(name=n, state=s or None) for n, s in rows])
        db.commit()
        return len(rows)
    finally:
        db.close()


if __name__ == "__main__":
    n = load(sys.argv[1] if len(sys.argv) > 1 else "data/us_higher_ed.csv")
    print(f"Loaded {n} schools into school_seed")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles.py::test_parse_rows_dedupes_and_skips_blanks -v`
Expected: PASS.

- [ ] **Step 5: Add the data CSV and run the loader against dev**

Place the College Scorecard / IPEDS export at `backend/data/us_higher_ed.csv` with header `name,state` (one row per accredited institution).
Run: `cd backend && python -m scripts.seed_schools data/us_higher_ed.csv`
Expected: prints `Loaded <~6000> schools into school_seed`.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts/seed_schools.py backend/data/us_higher_ed.csv backend/tests/test_circles.py
git commit -m "feat(circles): school seed bootstrap loader + dataset"
```

---

## Task 8: Full Phase 1 test run

- [ ] **Step 1: Run the whole circles test module**

Run: `cd backend && python -m pytest tests/test_circles.py -v`
Expected: all tests PASS (DB-backed tests require `backend/.env` loaded so `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise they SKIP — a clean skip is acceptable but a local pass is the goal before merge).

- [ ] **Step 2: Run the existing suite to confirm no regressions**

Run: `cd backend && python -m pytest tests/test_neighborhood_community.py tests/test_listing_create.py -v`
Expected: PASS (these touch communities; the additive migration must not break them).

---

## Self-Review (against the spec)

- **Spec §2 circle types:** building (Task 4), school + max-2 (Task 5), school seed (Tasks 1, 7). Mutual friends has no membership — modeled as `User.share_mutual_friends` (Tasks 1, 2); the *count* derivation is read-side, deferred to Phase 2 enrichment. ✔
- **Spec §3 consent:** `share_with_mutuals` per membership + setter (Tasks 1, 2, 6); default false (opt-in) via `server_default="false"`. ✔
- **Spec §6 backend model:** typed communities + consent + seed (this whole plan). Enrichment/ranking/orders/register are explicitly Phases 2–3 — listed in the roadmap, not silently dropped. ✔
- **Neighborhood:** retyped to `kind='neighborhood'` in the migration (Task 1) so Phase 2 can distinguish it; no new neighborhood circle is created. ✔
- **No placeholders:** every code step shows full code; every test step shows the test and the exact `pytest` command + expected result. ✔
- **Type consistency:** `_ensure_member`, `set_user_building`, `add_user_school`, `list_user_schools`, `set_circle_consent`, `normalize_address`, `TooManySchools`, `MAX_SCHOOLS`, `SchoolSeed`, `parse_rows`/`load` are each defined before use and referenced consistently. ✔
- **Out of scope confirmed:** no `.edu` verification, no email provider, no display/registration changes in Phase 1. ✔
