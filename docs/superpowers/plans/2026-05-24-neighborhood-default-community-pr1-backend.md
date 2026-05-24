# Neighborhood Default Community — PR 1 (Backend Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the backend infrastructure for neighborhood-as-first-class-community: a system user, pre-seeded `Community` rows for each Manhattan neighborhood, a curated-list endpoint, and auto-managed membership when `user.neighborhood` is set or changes. Zero user-facing behavior change — this PR is deployable without touching the FE.

**Architecture:** Two SQL migrations (system user + pre-seeded communities), one constants file with the canonical neighborhood list, one helper module for lookup + membership-swap, and two existing auth endpoints extended to call the swap logic. Tests cover the helper logic and the endpoint round-trip.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres. Migrations via `supabase/migrations/*.sql`. Test framework: pytest.

**Spec:** `docs/superpowers/specs/2026-05-24-neighborhood-default-community-design.md` (committed `32d1979` on this branch).

**Branch state at plan start:** `chore/neighborhood-default-community` is 1 commit ahead of dev (just the spec). After this plan: 1 PR opened against dev with several commits on this branch.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `backend/constants/neighborhoods.py` | Create | Single source of truth for the canonical Manhattan neighborhood list. Imported by both the seed migration and the curated-list endpoint. |
| `backend/constants/__init__.py` | Create | Make `constants/` a Python package. |
| `supabase/migrations/0006_system_user.sql` | Create | INSERT the Cosello system user with deterministic UUID. |
| `supabase/migrations/0007_neighborhood_communities.sql` | Create | INSERT a `Community` row per neighborhood from the canonical list. INSERT corresponding `community_members` row(s) auto-joining the system user as the owner. |
| `backend/services/neighborhood.py` | Create | `get_neighborhood_community()` lookup helper + `set_user_neighborhood()` membership-swap helper. |
| `backend/routers/auth.py` | Modify (~lines 75-120) | Wire `set_user_neighborhood()` into both `POST /api/auth/register` and `PUT /api/auth/profile`. |
| `backend/routers/communities.py` | Modify (add new route handler) | New `GET /api/communities/neighborhoods` endpoint returning the canonical list. |
| `backend/tests/test_neighborhood_community.py` | Create | Tests for the helper module + endpoint integration. |

No FE files touched in this PR.

---

## Commit Strategy

The PR ships as multiple small commits for review hygiene:

| # | Subject |
|---|---|
| 1 | `feat(backend): add canonical Manhattan neighborhood list` |
| 2 | `feat(backend): SQL migration to insert Cosello system user` |
| 3 | `feat(backend): SQL migration to pre-seed neighborhood communities` |
| 4 | `feat(backend): neighborhood community helpers + membership swap` |
| 5 | `feat(backend): GET /api/communities/neighborhoods endpoint` |
| 6 | `feat(backend): wire neighborhood swap into auth endpoints` |

All 6 commits land on `chore/neighborhood-default-community`. Open PR after the last one.

---

## Task 1: Curated neighborhood list

**Files:**
- Create: `backend/constants/__init__.py`
- Create: `backend/constants/neighborhoods.py`

### Steps

- [ ] **Step 1: Create the package marker**

```bash
touch backend/constants/__init__.py
```

- [ ] **Step 2: Write `backend/constants/neighborhoods.py`**

```python
"""Canonical Manhattan neighborhood list.

Source of truth for two consumers:
- supabase/migrations/0007_neighborhood_communities.sql (pre-seeds Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods endpoint)

When extending to additional cities, append to the list — the migration is
idempotent via ON CONFLICT DO NOTHING.
"""

# Curated from NYC Department of City Planning's Neighborhood Tabulation Areas
# (NTAs) for Manhattan. Names match common usage; not a strict NTA mapping.
MANHATTAN_NEIGHBORHOODS: list[str] = [
    "Chelsea",
    "Chinatown",
    "East Harlem",
    "East Village",
    "Financial District",
    "Flatiron",
    "Gramercy",
    "Greenwich Village",
    "Harlem",
    "Hell's Kitchen",
    "Inwood",
    "Kips Bay",
    "Little Italy",
    "Lower East Side",
    "Midtown East",
    "Midtown West",
    "Morningside Heights",
    "Murray Hill",
    "NoHo",
    "NoLita",
    "Roosevelt Island",
    "SoHo",
    "Times Square",
    "Tribeca",
    "Two Bridges",
    "Union Square",
    "Upper East Side",
    "Upper West Side",
    "Washington Heights",
    "West Village",
]
```

- [ ] **Step 3: Verify Python import works**

Run: `cd backend && python3 -c "from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS; print(len(MANHATTAN_NEIGHBORHOODS))"`

Expected: `30`

- [ ] **Step 4: Commit**

```bash
git add backend/constants/__init__.py backend/constants/neighborhoods.py
git commit -m "$(cat <<'EOF'
feat(backend): add canonical Manhattan neighborhood list

backend/constants/neighborhoods.py exports MANHATTAN_NEIGHBORHOODS — a
list of 30 canonical neighborhood names. Single source of truth used
by the seed migration and the GET /api/communities/neighborhoods
endpoint that the onboarding picker calls.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: System user SQL migration

**Files:**
- Create: `supabase/migrations/0006_system_user.sql`

### Steps

- [ ] **Step 1: Write the migration file**

```sql
-- 0006_system_user.sql
-- Insert the Cosello system user. Owns all auto-created neighborhood
-- communities via the created_by FK. Idempotent via ON CONFLICT.

BEGIN;

INSERT INTO public.users (id, display_name, neighborhood, profile_picture, pickup_address, zip_code, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Cosello',
  NULL,
  NULL,
  NULL,
  NULL,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply the migration locally**

Run: `cd backend && python3 -c "from supabase import create_client; import os; from dotenv import load_dotenv; load_dotenv('.env'); c = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_ROLE_KEY']); print(c.table('users').select('id, display_name').eq('id', '00000000-0000-0000-0000-000000000001').execute().data)"`

Expected: empty list `[]` before the migration runs.

Then apply the migration. The project does not have an automated migration runner — supabase migrations are typically applied via the Supabase dashboard SQL editor or `psql`. From the repo root:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0006_system_user.sql
```

(If `DATABASE_URL` is the pooler URL with a username/password that can run DDL — usually fine for Supabase Pro tier. If permissions reject, apply via the Supabase dashboard SQL editor.)

- [ ] **Step 3: Verify the system user exists**

Run the same select-by-id command from Step 2.

Expected: `[{'id': '00000000-0000-0000-0000-000000000001', 'display_name': 'Cosello'}]`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_system_user.sql
git commit -m "$(cat <<'EOF'
feat(backend): SQL migration to insert Cosello system user

Adds a deterministic-UUID system user (00000000-0000-0000-0000-000000000001,
display_name "Cosello") that will own every auto-created neighborhood
community via the `created_by` FK. Idempotent via ON CONFLICT DO NOTHING.

The system user cannot authenticate (no auth.users row paired with it)
and is filtered out of friend search + listing creation in follow-up
work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pre-seeded neighborhood communities SQL migration

**Files:**
- Create: `supabase/migrations/0007_neighborhood_communities.sql`

### Steps

- [ ] **Step 1: Write the migration file**

The list of neighborhoods must mirror `backend/constants/neighborhoods.py`. Hand-transcribe (writing-plans skill rules out a runtime-import here — SQL is text).

```sql
-- 0007_neighborhood_communities.sql
-- Pre-seed one public Community row per Manhattan neighborhood, owned
-- by the Cosello system user (00000000-0000-0000-0000-000000000001).
-- Each community.neighborhood matches the canonical name for the
-- get_neighborhood_community() lookup in backend/services/neighborhood.py.
-- Idempotent via ON CONFLICT (the unique constraint on invite_code
-- gives us idempotency since invite_code is a per-row prefix derived
-- from the neighborhood name).

BEGIN;

INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Chelsea',             NULL, 'Chelsea',             NULL, NULL, NULL, TRUE, 'NBHD-CHELSEA',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Chinatown',           NULL, 'Chinatown',           NULL, NULL, NULL, TRUE, 'NBHD-CHINATOWN',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('East Harlem',         NULL, 'East Harlem',         NULL, NULL, NULL, TRUE, 'NBHD-EAST-HARLEM',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('East Village',        NULL, 'East Village',        NULL, NULL, NULL, TRUE, 'NBHD-EAST-VILLAGE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Financial District',  NULL, 'Financial District',  NULL, NULL, NULL, TRUE, 'NBHD-FIDI',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Flatiron',            NULL, 'Flatiron',            NULL, NULL, NULL, TRUE, 'NBHD-FLATIRON',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Gramercy',            NULL, 'Gramercy',            NULL, NULL, NULL, TRUE, 'NBHD-GRAMERCY',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Greenwich Village',   NULL, 'Greenwich Village',   NULL, NULL, NULL, TRUE, 'NBHD-GREENWICH',        '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Harlem',              NULL, 'Harlem',              NULL, NULL, NULL, TRUE, 'NBHD-HARLEM',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hell''s Kitchen',     NULL, 'Hell''s Kitchen',     NULL, NULL, NULL, TRUE, 'NBHD-HELLS-KITCHEN',    '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Inwood',              NULL, 'Inwood',              NULL, NULL, NULL, TRUE, 'NBHD-INWOOD',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Kips Bay',            NULL, 'Kips Bay',            NULL, NULL, NULL, TRUE, 'NBHD-KIPS-BAY',         '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Little Italy',        NULL, 'Little Italy',        NULL, NULL, NULL, TRUE, 'NBHD-LITTLE-ITALY',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lower East Side',     NULL, 'Lower East Side',     NULL, NULL, NULL, TRUE, 'NBHD-LES',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Midtown East',        NULL, 'Midtown East',        NULL, NULL, NULL, TRUE, 'NBHD-MIDTOWN-EAST',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Midtown West',        NULL, 'Midtown West',        NULL, NULL, NULL, TRUE, 'NBHD-MIDTOWN-WEST',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Morningside Heights', NULL, 'Morningside Heights', NULL, NULL, NULL, TRUE, 'NBHD-MORNINGSIDE',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Murray Hill',         NULL, 'Murray Hill',         NULL, NULL, NULL, TRUE, 'NBHD-MURRAY-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoHo',                NULL, 'NoHo',                NULL, NULL, NULL, TRUE, 'NBHD-NOHO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoLita',              NULL, 'NoLita',              NULL, NULL, NULL, TRUE, 'NBHD-NOLITA',           '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Roosevelt Island',    NULL, 'Roosevelt Island',    NULL, NULL, NULL, TRUE, 'NBHD-ROOSEVELT-ISLAND', '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('SoHo',                NULL, 'SoHo',                NULL, NULL, NULL, TRUE, 'NBHD-SOHO',             '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Times Square',        NULL, 'Times Square',        NULL, NULL, NULL, TRUE, 'NBHD-TIMES-SQUARE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Tribeca',             NULL, 'Tribeca',             NULL, NULL, NULL, TRUE, 'NBHD-TRIBECA',          '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Two Bridges',         NULL, 'Two Bridges',         NULL, NULL, NULL, TRUE, 'NBHD-TWO-BRIDGES',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Union Square',        NULL, 'Union Square',        NULL, NULL, NULL, TRUE, 'NBHD-UNION-SQUARE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Upper East Side',     NULL, 'Upper East Side',     NULL, NULL, NULL, TRUE, 'NBHD-UES',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Upper West Side',     NULL, 'Upper West Side',     NULL, NULL, NULL, TRUE, 'NBHD-UWS',              '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Washington Heights',  NULL, 'Washington Heights',  NULL, NULL, NULL, TRUE, 'NBHD-WASHINGTON-HTS',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('West Village',        NULL, 'West Village',        NULL, NULL, NULL, TRUE, 'NBHD-WEST-VILLAGE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Auto-join the system user as a member of every neighborhood community
-- it owns. Keeps the FK semantics clean (every community has at least
-- one member). System user filtered out of member-list endpoints in
-- follow-up work.
INSERT INTO public.community_members (community_id, user_id, role, joined_at)
SELECT
  c.id,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'owner',
  NOW()
FROM public.communities c
WHERE c.created_by = '00000000-0000-0000-0000-000000000001'::uuid
ON CONFLICT (community_id, user_id) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Apply the migration**

```bash
psql "$DATABASE_URL" -f supabase/migrations/0007_neighborhood_communities.sql
```

- [ ] **Step 3: Verify the rows landed**

Run a sanity check:

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM communities WHERE created_by = '00000000-0000-0000-0000-000000000001'::uuid;"
```

Expected: `30` (matches the constants file).

```bash
psql "$DATABASE_URL" -c "SELECT name, neighborhood, invite_code FROM communities WHERE created_by = '00000000-0000-0000-0000-000000000001'::uuid ORDER BY name LIMIT 5;"
```

Expected: 5 rows, first one being `Chelsea`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_neighborhood_communities.sql
git commit -m "$(cat <<'EOF'
feat(backend): SQL migration to pre-seed neighborhood communities

Inserts 30 Manhattan neighborhood Community rows, each owned by the
Cosello system user (created in 0006). Each row's `neighborhood`
field matches the canonical name so get_neighborhood_community()
can lookup by string.

invite_code values use stable NBHD-* prefixes derived from the
neighborhood name — keeps the unique constraint and gives the
migration idempotency via ON CONFLICT.

System user auto-joins each community as 'owner' so the FK pattern
matches user-created communities.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Neighborhood community helpers + membership swap

**Files:**
- Create: `backend/services/neighborhood.py`
- Create: `backend/tests/test_neighborhood_community.py`

### Steps

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_neighborhood_community.py
import pytest
from sqlalchemy.orm import Session

from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from models import Community, CommunityMember, User
from services.neighborhood import (
    SYSTEM_USER_ID,
    get_neighborhood_community,
    set_user_neighborhood,
)


def test_get_neighborhood_community_returns_seeded_row(db: Session):
    community = get_neighborhood_community(db, "Chinatown")
    assert community is not None
    assert community.name == "Chinatown"
    assert community.neighborhood == "Chinatown"
    assert community.is_public is True
    assert str(community.created_by) == SYSTEM_USER_ID


def test_get_neighborhood_community_off_list_returns_none(db: Session):
    assert get_neighborhood_community(db, "Not A Real Neighborhood") is None
    assert get_neighborhood_community(db, "") is None
    assert get_neighborhood_community(db, None) is None  # type: ignore[arg-type]


def test_get_neighborhood_community_ignores_user_created_with_same_name(db: Session, user_factory):
    # A real user creates a community with the same neighborhood name.
    # Should NOT be returned by get_neighborhood_community.
    real_user = user_factory(display_name="Alice", neighborhood="Chinatown")
    rogue = Community(
        name="Chinatown Buddies",
        neighborhood="Chinatown",
        is_public=True,
        invite_code="ROGUE-CHINATOWN",
        created_by=real_user.id,
    )
    db.add(rogue)
    db.commit()

    found = get_neighborhood_community(db, "Chinatown")
    assert found is not None
    assert found.invite_code == "NBHD-CHINATOWN"  # the system-owned one


def test_set_user_neighborhood_creates_membership_on_first_set(db: Session, user_factory):
    user = user_factory(display_name="Bob", neighborhood=None)
    set_user_neighborhood(db, user, "Chinatown")

    user_again = db.query(User).filter(User.id == user.id).first()
    assert user_again.neighborhood == "Chinatown"

    chinatown = get_neighborhood_community(db, "Chinatown")
    membership = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.user_id == user.id,
            CommunityMember.community_id == chinatown.id,
        )
        .first()
    )
    assert membership is not None
    assert membership.role == "member"


def test_set_user_neighborhood_swaps_membership_on_change(db: Session, user_factory):
    user = user_factory(display_name="Carol", neighborhood="Chinatown")
    set_user_neighborhood(db, user, "Chinatown")  # initial join
    set_user_neighborhood(db, user, "Tribeca")    # swap

    user_again = db.query(User).filter(User.id == user.id).first()
    assert user_again.neighborhood == "Tribeca"

    # Old membership gone
    old = get_neighborhood_community(db, "Chinatown")
    assert (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == old.id)
        .first()
        is None
    )

    # New membership exists
    new = get_neighborhood_community(db, "Tribeca")
    assert (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == new.id)
        .first()
        is not None
    )


def test_set_user_neighborhood_rejects_off_list(db: Session, user_factory):
    user = user_factory(display_name="Dan", neighborhood=None)
    with pytest.raises(ValueError, match="not in the curated"):
        set_user_neighborhood(db, user, "Not A Real Neighborhood")


def test_set_user_neighborhood_idempotent_on_no_change(db: Session, user_factory):
    user = user_factory(display_name="Eve", neighborhood=None)
    set_user_neighborhood(db, user, "SoHo")
    soho = get_neighborhood_community(db, "SoHo")

    # Calling again with the same value should not duplicate the membership
    set_user_neighborhood(db, user, "SoHo")

    count = (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == soho.id)
        .count()
    )
    assert count == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_neighborhood_community.py -v`

Expected: FAIL — `services.neighborhood` doesn't exist yet (ImportError).

- [ ] **Step 3: Write the implementation**

```python
# backend/services/neighborhood.py
"""Helpers for the neighborhood-as-community system.

The Cosello system user (SYSTEM_USER_ID) owns every auto-created
neighborhood community. The canonical list lives in
backend/constants/neighborhoods.py — this module never hardcodes
neighborhood names.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from models import Community, CommunityMember, User

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


def get_neighborhood_community(db: Session, neighborhood_name: str | None) -> Community | None:
    """Return the system-owned Community row for the given neighborhood, or None.

    Filters by `created_by == SYSTEM_USER_ID` so a user-created Community that
    happens to share the same neighborhood name doesn't shadow the canonical one.
    """
    if not neighborhood_name:
        return None
    return (
        db.query(Community)
        .filter(
            Community.neighborhood == neighborhood_name,
            Community.is_public.is_(True),
            Community.created_by == SYSTEM_USER_ID,
        )
        .first()
    )


def set_user_neighborhood(
    db: Session,
    user: User,
    new_neighborhood: str | None,
) -> None:
    """Update user.neighborhood and swap the CommunityMember row transactionally.

    - Validates new_neighborhood is in MANHATTAN_NEIGHBORHOODS (or None).
    - Removes the old membership (if any).
    - Updates user.neighborhood.
    - Adds the new membership (if applicable).
    - Idempotent: if old == new, no-op.

    Raises ValueError if new_neighborhood is set but not in the curated list.
    """
    if new_neighborhood and new_neighborhood not in MANHATTAN_NEIGHBORHOODS:
        raise ValueError(
            f"Neighborhood '{new_neighborhood}' is not in the curated list. "
            f"Pick from {len(MANHATTAN_NEIGHBORHOODS)} canonical neighborhoods."
        )

    old_neighborhood = user.neighborhood
    if old_neighborhood == new_neighborhood:
        return  # no-op

    # 1. Remove old membership if applicable
    if old_neighborhood:
        old_community = get_neighborhood_community(db, old_neighborhood)
        if old_community:
            db.query(CommunityMember).filter(
                CommunityMember.user_id == user.id,
                CommunityMember.community_id == old_community.id,
            ).delete()

    # 2. Update the user's neighborhood string
    user.neighborhood = new_neighborhood

    # 3. Add new membership if applicable AND the user isn't already a member
    #    (defensive against manual rejoin races)
    if new_neighborhood:
        new_community = get_neighborhood_community(db, new_neighborhood)
        if new_community:
            already = (
                db.query(CommunityMember)
                .filter(
                    CommunityMember.user_id == user.id,
                    CommunityMember.community_id == new_community.id,
                )
                .first()
            )
            if not already:
                db.add(
                    CommunityMember(
                        user_id=user.id,
                        community_id=new_community.id,
                        role="member",
                    )
                )

    db.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_neighborhood_community.py -v`

Expected: PASS, all 7 tests green.

If the `user_factory` fixture isn't defined in `conftest.py`, the test file needs an inline fixture or the existing fixture set in `conftest.py` needs to be checked first. Spend up to 5 minutes wiring it; if it's not trivially available, define a minimal `user_factory` fixture at the top of the test file:

```python
@pytest.fixture
def user_factory(db):
    created: list[User] = []
    def _make(display_name: str, neighborhood: str | None = None) -> User:
        from uuid import uuid4
        u = User(id=str(uuid4()), display_name=display_name, neighborhood=neighborhood)
        db.add(u)
        db.commit()
        created.append(u)
        return u
    yield _make
    for u in created:
        # cleanup (skip cascade headaches by deleting deps first)
        db.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
        db.delete(u)
    db.commit()
```

- [ ] **Step 5: Commit**

```bash
git add backend/services/neighborhood.py backend/tests/test_neighborhood_community.py
git commit -m "$(cat <<'EOF'
feat(backend): neighborhood community helpers + membership swap

backend/services/neighborhood.py exports two pure helpers:

- get_neighborhood_community(db, neighborhood_name) — returns the
  system-owned Community for a given canonical name (or None).
  Filters by created_by == SYSTEM_USER_ID so user-created communities
  sharing the same neighborhood string don't shadow.

- set_user_neighborhood(db, user, new_neighborhood) — transactional
  swap that validates against MANHATTAN_NEIGHBORHOODS, removes the
  old CommunityMember row, updates user.neighborhood, and inserts
  the new CommunityMember row. Idempotent on no-change. Raises
  ValueError on off-list values.

Tests cover: seeded-row lookup, off-list returns None,
user-created-with-same-name doesn't shadow, first-time join,
swap-on-change, off-list rejection, idempotent no-op.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: GET /api/communities/neighborhoods endpoint

**Files:**
- Modify: `backend/routers/communities.py` (add new route)
- Modify: `backend/tests/test_neighborhood_community.py` (add endpoint test)

### Steps

- [ ] **Step 1: Write the failing endpoint test**

Append to `backend/tests/test_neighborhood_community.py`:

```python
def test_get_neighborhoods_endpoint_returns_curated_list(client):
    response = client.get("/api/communities/neighborhoods")
    assert response.status_code == 200

    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 30
    assert "Chinatown" in data
    assert "West Village" in data
    assert "Not A Real Neighborhood" not in data

    # Alphabetically sorted (caller-friendly)
    assert data == sorted(data)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_neighborhood_community.py::test_get_neighborhoods_endpoint_returns_curated_list -v`

Expected: FAIL — endpoint returns 404.

- [ ] **Step 3: Add the endpoint to `backend/routers/communities.py`**

Find a sensible position (near the top of the route definitions, before `/mine`). Add the route:

```python
@router.get("/neighborhoods")
async def list_neighborhoods():
    """Return the curated list of canonical Manhattan neighborhood names.

    Used by the FE onboarding picker. Single source of truth lives in
    backend/constants/neighborhoods.py — extend that list to add new
    neighborhoods. No auth required (the list is public).
    """
    from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
    return sorted(MANHATTAN_NEIGHBORHOODS)
```

(The `import` is inside the function to avoid a circular-import risk if the constants file ever grows; if no such risk exists, hoist to the top of the file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_neighborhood_community.py::test_get_neighborhoods_endpoint_returns_curated_list -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/communities.py backend/tests/test_neighborhood_community.py
git commit -m "$(cat <<'EOF'
feat(backend): GET /api/communities/neighborhoods endpoint

Returns the curated MANHATTAN_NEIGHBORHOODS list alphabetically
sorted. No auth required (the list is public — same data the
seed migration uses). Onboarding picker consumes this in PR 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire set_user_neighborhood into auth endpoints

**Files:**
- Modify: `backend/routers/auth.py` (lines 75-120 — both `register` and `update_profile`)
- Modify: `backend/tests/test_neighborhood_community.py` (add integration tests)

### Steps

- [ ] **Step 1: Write the failing integration tests**

Append to `backend/tests/test_neighborhood_community.py`:

```python
def test_register_endpoint_auto_joins_neighborhood_community(client, auth_token_for_new_user):
    token = auth_token_for_new_user
    resp = client.post(
        "/api/auth/register",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "display_name": "Frank",
            "neighborhood": "SoHo",
        },
    )
    assert resp.status_code == 200

    user_id = resp.json()["id"]
    # Verify CommunityMember row exists for SoHo
    from database import SessionLocal
    db = SessionLocal()
    try:
        soho = get_neighborhood_community(db, "SoHo")
        membership = (
            db.query(CommunityMember)
            .filter(CommunityMember.user_id == user_id, CommunityMember.community_id == soho.id)
            .first()
        )
        assert membership is not None
    finally:
        db.close()


def test_register_endpoint_rejects_off_list_neighborhood(client, auth_token_for_new_user):
    token = auth_token_for_new_user
    resp = client.post(
        "/api/auth/register",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "display_name": "Grace",
            "neighborhood": "Atlantis",
        },
    )
    assert resp.status_code == 400
    assert "curated" in resp.json()["detail"].lower()


def test_update_profile_swaps_neighborhood_community(client, authed_user_factory):
    user, token = authed_user_factory(display_name="Hank", neighborhood="Chinatown")

    # User's initial membership in Chinatown
    from database import SessionLocal
    db = SessionLocal()
    try:
        chinatown = get_neighborhood_community(db, "Chinatown")
        # Ensure they're a member at start
        assert (
            db.query(CommunityMember)
            .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == chinatown.id)
            .first() is not None
        )
    finally:
        db.close()

    # Update to Tribeca
    resp = client.put(
        "/api/auth/profile",
        headers={"Authorization": f"Bearer {token}"},
        json={"neighborhood": "Tribeca"},
    )
    assert resp.status_code == 200

    # Verify swap
    db = SessionLocal()
    try:
        chinatown = get_neighborhood_community(db, "Chinatown")
        tribeca = get_neighborhood_community(db, "Tribeca")
        assert (
            db.query(CommunityMember)
            .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == chinatown.id)
            .first() is None
        )
        assert (
            db.query(CommunityMember)
            .filter(CommunityMember.user_id == user.id, CommunityMember.community_id == tribeca.id)
            .first() is not None
        )
    finally:
        db.close()
```

The `auth_token_for_new_user` and `authed_user_factory` fixtures should already exist in `conftest.py` if the project follows standard FastAPI test patterns. If not, the implementer adds minimal versions; spec'd here is the contract.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_neighborhood_community.py -v -k "register or update_profile"`

Expected: FAILs — register inserts neighborhood directly without auto-joining; update_profile doesn't swap.

- [ ] **Step 3: Update `backend/routers/auth.py`**

Find `POST /register` (line 75–100). Update the section that sets neighborhood:

Before:
```python
    existing.display_name = req.display_name
    existing.neighborhood = req.neighborhood
    if req.pickup_address is not None:
        existing.pickup_address = req.pickup_address
    if req.zip_code is not None:
        existing.zip_code = req.zip_code
    db.commit()
```

After:
```python
    existing.display_name = req.display_name
    if req.pickup_address is not None:
        existing.pickup_address = req.pickup_address
    if req.zip_code is not None:
        existing.zip_code = req.zip_code
    db.commit()  # flush profile fields first

    # Then handle neighborhood + auto-join membership in one tx
    try:
        set_user_neighborhood(db, existing, req.neighborhood)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
```

Find `PUT /profile` (line 103–119). Similar update:

Before:
```python
    if req.display_name is not None:
        current_user.display_name = req.display_name
    if req.neighborhood is not None:
        current_user.neighborhood = req.neighborhood
    if req.pickup_address is not None:
        current_user.pickup_address = req.pickup_address
    if req.zip_code is not None:
        current_user.zip_code = req.zip_code
    db.commit()
```

After:
```python
    if req.display_name is not None:
        current_user.display_name = req.display_name
    if req.pickup_address is not None:
        current_user.pickup_address = req.pickup_address
    if req.zip_code is not None:
        current_user.zip_code = req.zip_code
    db.commit()  # flush non-neighborhood fields first

    if req.neighborhood is not None:
        try:
            set_user_neighborhood(db, current_user, req.neighborhood)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
```

Add the import at the top of the file:

```python
from services.neighborhood import set_user_neighborhood
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_neighborhood_community.py -v`

Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/auth.py backend/tests/test_neighborhood_community.py
git commit -m "$(cat <<'EOF'
feat(backend): wire neighborhood swap into auth endpoints

POST /api/auth/register and PUT /api/auth/profile now route the
neighborhood field through services.neighborhood.set_user_neighborhood()
instead of writing user.neighborhood directly. This:

- Validates against the curated MANHATTAN_NEIGHBORHOODS list
  (rejects with 400 on off-list values).
- Auto-creates the CommunityMember row for the user's
  neighborhood community.
- Swaps the membership transactionally when the user changes
  their neighborhood later.

Integration tests cover register-side and update-side flows
including the off-list rejection path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification + PR

- [ ] **Final A: All tests green**

```bash
cd backend && pytest -v
```

Expected: zero failures.

- [ ] **Final B: Commit log**

```bash
git log dev..HEAD --oneline
```

Expected: spec commit + 6 implementation commits (7 total).

- [ ] **Final C: Push + open PR**

```bash
git push -u origin chore/neighborhood-default-community
gh pr create --base dev --head chore/neighborhood-default-community \
  --title "feat(communities): neighborhood default community — PR 1 (backend foundation)" \
  --body "Implements PR 1 of the neighborhood-default-community spec. Backend-only — zero user-facing change.

  Adds: Cosello system user, 30 pre-seeded Manhattan neighborhood Community rows, get_neighborhood_community() + set_user_neighborhood() helpers, GET /api/communities/neighborhoods endpoint, auth endpoint wiring.

  Spec: docs/superpowers/specs/2026-05-24-neighborhood-default-community-design.md
  Plan: docs/superpowers/plans/2026-05-24-neighborhood-default-community-pr1-backend.md

  PR 2 (frontend) and PR 3 (cutover) follow once this lands."
```

- [ ] **Final D: Manual sanity smoke (post-merge to dev)**

Run a quick `curl` to verify the new endpoint:

```bash
curl https://<your-backend-host>/api/communities/neighborhoods | jq length
```

Expected: `30`.

---

## Self-Review

**Spec coverage:**
- Spec Section 1 (system user, pre-seed, helper) → Task 1, 2, 3, 4 ✓
- Spec Section 2 (membership lifecycle: auto-join, swap, idempotent) → Task 4 (helper) + Task 6 (wiring) ✓
- Spec Section 3 (API: new endpoint + extended PATCH /me) → Task 5 + Task 6 ✓
- Spec Section 3 (delete mine-with-neighborhood) → NOT in this PR (deferred to PR 3 per spec decomposition) ✓ — intentional gap
- Spec Section 4 (frontend) → NOT in this PR (deferred to PR 2) ✓ — intentional gap
- Spec Section 5 (cutover migration) → NOT in this PR (deferred to PR 3) ✓ — intentional gap

**Placeholder scan:** No TBD/TODO. Every step has concrete code or commands. The conftest `auth_token_for_new_user` / `authed_user_factory` fixtures are referenced as a contract; if the implementer finds they don't exist, the test file is responsible for defining minimal versions inline.

**Type consistency:** `SYSTEM_USER_ID` is the same string `"00000000-0000-0000-0000-000000000001"` in `services/neighborhood.py`, the SQL migrations, and the tests. `MANHATTAN_NEIGHBORHOODS` is the same list referenced by the constants file, the SQL migration (hand-transcribed — verify in code review), and the endpoint.

**Known risk:** the SQL migration hand-transcribes the 30 neighborhood names. If the constants file and the SQL migration diverge (e.g., add a neighborhood to one but not the other), the seed becomes incomplete or the endpoint claims to support a neighborhood that has no Community row. Mitigation: a test that compares the migration's INSERT names to `MANHATTAN_NEIGHBORHOODS` at fixture-setup time, OR rewrite the migration as a Python seed script. Spec'd as a known acceptance risk; flag at review.

**No spec gaps for PR 1's scope.**
