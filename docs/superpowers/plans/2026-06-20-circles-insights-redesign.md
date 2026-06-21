# Circles "Insights" Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the binary circle byline (neighborhood · school · mutual-friends) with an insight byline: a pastel medal ribbon for connection degree (1st/2nd/3rd), an always-on school short-name (bold when it's yours), and coarse distance on the location line. No "same building" indicator.

**Architecture:** Backend computes a new per-viewer `circles` shape ({connection.degree, school|null}) in `services/circles.py` and serves it on the existing feed/listing endpoints. Distance reuses the already-computed `listing.distance_miles` field (no change to its plumbing). A new `school_seed.short_name` column drives the compact school label. Frontend rewrites `CircleByline.tsx` to render the ribbon + school, and the location line appends distance. Settings drops the neighborhood row.

**Tech Stack:** Python 3.14 / FastAPI / SQLAlchemy / Supabase Postgres (raw `.sql` migrations in `supabase/migrations/`, applied manually); React 18 / TS / Tailwind v4 / lucide-react; pytest.

**Spec:** `docs/superpowers/specs/2026-06-20-circles-insights-redesign-design.md`

**Branch:** `feature/circles-insights` (already cut from `dev`; the spec is committed there).

---

## File Structure

**Backend**
- `supabase/migrations/0017_school_short_name.sql` — *create* — add `school_seed.short_name`.
- `supabase/migrations/0018_school_membership_visible.sql` — *create* — backfill existing school memberships `share_with_mutuals=true`.
- `backend/scripts/backfill_school_short_names.py` — *create* — populate `short_name` (= curated override ?? acronym ?? name).
- `backend/services/circles.py` — *modify* — add `connection_degree(...)`; rewrite `_assemble_circles`, `seller_circles_for_viewer`, `seller_circles_for_viewer_batch`, `EMPTY_CIRCLES`, `get_user_circles_summary`.
- `backend/models.py` — *modify* — add `short_name` to `SchoolSeed`.
- `backend/tests/test_circles_insights.py` — *create* — unit tests for degree + enrichment shape.

**Frontend**
- `frontend/src/lib/types.ts` — *modify* — new `ListingCircles` shape.
- `frontend/src/components/CircleByline.tsx` — *rewrite* — ribbon + school.
- `frontend/src/components/ListingCard.tsx` — *modify* — location line appends distance.
- `frontend/src/pages/signup/CirclePreview.tsx` — *modify* — new props/shape.
- `frontend/src/pages/MyAccount/CircleSettings.tsx` — *modify* — remove neighborhood row; update preview wiring.

**Out of scope (explicit):** building display/consent (stays dormant), walk-time on cards, ranking changes, the `update_profile` neighborhood-consent bug (moot for display).

---

## Task 1: Add `school_seed.short_name` column + model field

**Files:**
- Create: `supabase/migrations/0017_school_short_name.sql`
- Modify: `backend/models.py:59-66` (`SchoolSeed`)

- [ ] **Step 1: Write the migration**

`supabase/migrations/0017_school_short_name.sql`:
```sql
-- Add a compact display name for schools shown on listing cards.
-- short_name = curated override ?? computed acronym ?? full name (populated by
-- backend/scripts/backfill_school_short_names.py). Idempotent.

DO $$ BEGIN
  ALTER TABLE public.school_seed ADD COLUMN short_name VARCHAR(64);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
```

- [ ] **Step 2: Apply the migration to the live DB**

Run (from repo root, backend/.env must hold `DATABASE_URL`):
```bash
cd backend && python -c "import os; from pathlib import Path; from dotenv import load_dotenv; load_dotenv(Path('.env')); import psycopg2; c=psycopg2.connect(os.environ['DATABASE_URL']); cur=c.cursor(); cur.execute(open('../supabase/migrations/0017_school_short_name.sql').read()); c.commit(); print('applied'); c.close()"
```
Expected: `applied`

- [ ] **Step 3: Add the model field**

In `backend/models.py`, inside `class SchoolSeed` after the `acronym` line (currently line 65):
```python
    short_name = Column(String(64), nullable=True)
```

- [ ] **Step 4: Verify the column exists**

Run:
```bash
cd backend && python -c "from pathlib import Path; from dotenv import load_dotenv; load_dotenv(Path('.env')); import os, psycopg2; c=psycopg2.connect(os.environ['DATABASE_URL']); cur=c.cursor(); cur.execute(\"select column_name from information_schema.columns where table_name='school_seed' and column_name='short_name'\"); print(cur.fetchone()); c.close()"
```
Expected: `('short_name',)`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_school_short_name.sql backend/models.py
git commit -m "feat(circles): add school_seed.short_name column"
```

---

## Task 2: Backfill `short_name`

**Files:**
- Create: `backend/scripts/backfill_school_short_names.py`

- [ ] **Step 1: Write the backfill script**

`backend/scripts/backfill_school_short_names.py`:
```python
"""Backfill school_seed.short_name.

short_name = curated override (for schools whose acronym isn't recognizable)
             ?? computed acronym
             ?? full name

Idempotent: only updates rows whose stored short_name differs from the target.
Run: cd backend && python -m scripts.backfill_school_short_names
"""
import os
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=True)

import psycopg2
from services.circles import compute_acronym

# Schools whose acronym is NOT the recognizable form. Keyed by exact seed name.
# Extend as new in-use schools surface (school communities are created on demand,
# so this set stays small).
CURATED: dict[str, str] = {
    "Columbia University": "Columbia",
    "Parsons School of Design": "Parsons",
    "Fordham University": "Fordham",
    "Pace University": "Pace",
    "The New School": "The New School",
    "Cooper Union": "Cooper Union",
}


def target_short_name(name: str) -> str:
    if name in CURATED:
        return CURATED[name]
    return compute_acronym(name) or name


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = 0")
    cur.execute("SELECT id, name, short_name FROM public.school_seed")
    rows = cur.fetchall()

    to_update = [(rid, target_short_name(name)) for rid, name, stored in rows
                 if stored != target_short_name(name)]

    if not to_update:
        print(f"Total {len(rows)} rows; 0 updated (already correct)")
        conn.close()
        return

    values = b", ".join(cur.mogrify("(%s, %s)", (rid, sn)) for rid, sn in to_update)
    cur.execute(b"""
        UPDATE public.school_seed AS s SET short_name = v.sn
          FROM (VALUES """ + values + b""") AS v(id, sn) WHERE s.id = v.id
    """)
    conn.commit()
    print(f"Total {len(rows)} rows; updated {len(to_update)}")
    conn.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the backfill**

Run:
```bash
cd backend && python -m scripts.backfill_school_short_names
```
Expected: `Total <N> rows; updated <M>` (M = number with NULL or wrong short_name on first run).

- [ ] **Step 3: Verify a curated + an acronym row**

Run:
```bash
cd backend && python -c "from pathlib import Path; from dotenv import load_dotenv; load_dotenv(Path('.env')); import os, psycopg2; c=psycopg2.connect(os.environ['DATABASE_URL']); cur=c.cursor(); cur.execute(\"select name, short_name from school_seed where name in ('Columbia University','New York University') order by name\"); print(cur.fetchall()); c.close()"
```
Expected: `[('Columbia University', 'Columbia'), ('New York University', 'NYU')]`

- [ ] **Step 4: Re-run to confirm idempotency**

Run: `cd backend && python -m scripts.backfill_school_short_names`
Expected: `Total <N> rows; 0 updated (already correct)`

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/backfill_school_short_names.py
git commit -m "feat(circles): backfill school_seed.short_name (curated/acronym/name)"
```

---

## Task 3: `connection_degree` helper (TDD)

**Files:**
- Modify: `backend/services/circles.py` (add helper near `count_mutual_friends`, ~line 309)
- Test: `backend/tests/test_circles_insights.py`

Degree definition (lowest wins): **1** = direct friend; **2** = share ≥1 mutual friend; **3** = an edge connects someone in the viewer's friend set to someone in the seller's friend set (friend-of-a-friend-of-a-friend); else **None**.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_circles_insights.py`:
```python
"""Unit tests for the circles 'insights' enrichment (degree + shape)."""
from services.circles import _connection_degree_from_sets


def test_degree_direct_friend():
    # seller is directly in viewer's friend set
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "A"}, seller_friends={"V"},
        edges_from_viewer_friends={}, viewer_id="V") == 1


def test_degree_mutual_friend():
    # viewer and seller share friend "M"
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"M"}, seller_friends={"M"},
        edges_from_viewer_friends={}, viewer_id="V") == 2


def test_degree_third():
    # viewer→A (friend), A→B (edge), B→seller (B in seller_friends): degree 3
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        edges_from_viewer_friends={"A": {"B"}}, viewer_id="V") == 3


def test_degree_none_beyond_third():
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        edges_from_viewer_friends={"A": {"C"}}, viewer_id="V") is None


def test_degree_self_is_none():
    assert _connection_degree_from_sets(
        seller_id="V", viewer_friends=set(), seller_friends=set(),
        edges_from_viewer_friends={}, viewer_id="V") is None


def test_degree_lowest_wins():
    # direct friend AND shares a mutual → still 1
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "M"}, seller_friends={"M"},
        edges_from_viewer_friends={}, viewer_id="V") == 1
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd backend && python -m pytest tests/test_circles_insights.py -q`
Expected: FAIL — `ImportError: cannot import name '_connection_degree_from_sets'`

- [ ] **Step 3: Implement the pure helper**

In `backend/services/circles.py`, add after `count_mutual_friends` (~line 326):
```python
def _connection_degree_from_sets(
    *,
    seller_id: str,
    viewer_friends: set[str],
    seller_friends: set[str],
    edges_from_viewer_friends: dict[str, set[str]],
    viewer_id: str,
) -> int | None:
    """Pure degree computation from pre-loaded graph slices (lowest wins).

    edges_from_viewer_friends: {friend_id: that friend's accepted-friend set},
    used only for the 3rd-degree check.
    """
    if seller_id == viewer_id:
        return None
    if seller_id in viewer_friends:
        return 1
    if viewer_friends & seller_friends:
        return 2
    for a in viewer_friends:
        if edges_from_viewer_friends.get(a, set()) & seller_friends:
            return 3
    return None
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd backend && python -m pytest tests/test_circles_insights.py -q`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles_insights.py
git commit -m "feat(circles): connection-degree pure helper (1st/2nd/3rd) + tests"
```

---

## Task 4: New `circles` enrichment shape (single-call path)

**Files:**
- Modify: `backend/services/circles.py` — `_assemble_circles`, `seller_circles_for_viewer`, `EMPTY_CIRCLES` (lines ~363-484)
- Test: `backend/tests/test_circles_insights.py`

New shape (note: **no proximity** — distance reuses the existing `listing.distance_miles`):
```python
{"connection": {"degree": 1|2|3|None},
 "school": {"shortName": str, "fullName": str, "isMine": bool} | None}
```

- [ ] **Step 1: Write the failing test (shape + school always-on + connection gating)**

Append to `backend/tests/test_circles_insights.py`:
```python
from services.circles import EMPTY_CIRCLES


def test_empty_circles_new_shape():
    assert EMPTY_CIRCLES == {"connection": {"degree": None}, "school": None}


def test_empty_circles_is_not_mutated_accidentally():
    # canonical constant must keep both keys
    assert set(EMPTY_CIRCLES.keys()) == {"connection", "school"}
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python -m pytest tests/test_circles_insights.py::test_empty_circles_new_shape -q`
Expected: FAIL — current `EMPTY_CIRCLES` has keys `neighborhood/school/mutualFriends`.

- [ ] **Step 3: Rewrite `EMPTY_CIRCLES` and `_assemble_circles`**

Replace `EMPTY_CIRCLES` (lines ~419-423) with:
```python
EMPTY_CIRCLES: dict = {"connection": {"degree": None}, "school": None}
```

Replace `_assemble_circles` (lines ~363-410) with:
```python
def _assemble_circles(
    *,
    school: dict | None,
    degree: int | None,
) -> dict:
    """Build the per-viewer circles dict from pre-computed pieces.

    school: {"shortName","fullName","isMine"} or None when the seller has no
        visible school. degree: connection degree (1/2/3) or None.
    """
    return {"connection": {"degree": degree}, "school": school}
```

- [ ] **Step 4: Rewrite `seller_circles_for_viewer` to produce the new shape**

Replace the body of `seller_circles_for_viewer` (lines ~426-484) with:
```python
def seller_circles_for_viewer(
    db: Session,
    seller_id: str,
    viewer: User,
    *,
    viewer_circle_ids: set[int] | None = None,
    seller: User | None = None,
) -> dict:
    """The seller's insight circles relative to a viewer: connection degree +
    always-on school (bold-when-mine resolved client-side via isMine)."""
    if viewer_circle_ids is None:
        viewer_circle_ids = {
            m.community_id
            for m in db.query(CommunityMember.community_id)
            .filter(CommunityMember.user_id == viewer.id)
            .all()
        }

    school = _seller_school_for_viewer(db, seller_id, viewer_circle_ids)

    if seller is None:
        seller = db.query(User).filter(User.id == seller_id).first()
    degree = None
    if seller is not None and bool(seller.share_mutual_friends):
        vf = _load_friend_ids(db, viewer.id)
        sf = _load_friend_ids(db, seller_id)
        edges = _friend_edges_for(db, vf)
        degree = _connection_degree_from_sets(
            seller_id=seller_id, viewer_friends=vf, seller_friends=sf,
            edges_from_viewer_friends=edges, viewer_id=viewer.id,
        )

    return _assemble_circles(school=school, degree=degree)
```

- [ ] **Step 5: Add the school + edge helpers**

Add to `backend/services/circles.py` (near `_load_friend_ids`, ~line 347):
```python
def _friend_edges_for(db: Session, user_ids: set[str]) -> dict[str, set[str]]:
    """For each id in user_ids, its accepted-friend set (one query). Used for
    the 3rd-degree check."""
    edges: dict[str, set[str]] = {uid: set() for uid in user_ids}
    if not user_ids:
        return edges
    rows = (
        db.query(Friendship)
        .filter(
            Friendship.status == "accepted",
            (Friendship.user_id.in_(user_ids)) | (Friendship.friend_id.in_(user_ids)),
        )
        .all()
    )
    for r in rows:
        if r.user_id in edges:
            edges[r.user_id].add(r.friend_id)
        if r.friend_id in edges:
            edges[r.friend_id].add(r.user_id)
    return edges


def _seller_school_for_viewer(
    db: Session, seller_id: str, viewer_circle_ids: set[int]
) -> dict | None:
    """The seller's primary *visible* school as {shortName, fullName, isMine}.

    Visible = a school membership with share_with_mutuals=True. isMine = the
    viewer belongs to the same school community. Prefers a school the viewer
    shares so the matching one is the one shown."""
    rows = (
        db.query(Community, SchoolSeed.short_name)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .outerjoin(SchoolSeed, SchoolSeed.id == Community.school_seed_id)
        .filter(
            CommunityMember.user_id == seller_id,
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind == "school",
        )
        .order_by(Community.id)
        .all()
    )
    if not rows:
        return None
    chosen = None
    for community, short_name in rows:
        is_mine = community.id in viewer_circle_ids
        entry = {
            "shortName": short_name or community.name,
            "fullName": community.name,
            "isMine": is_mine,
        }
        if is_mine:
            return entry          # prefer the shared school
        if chosen is None:
            chosen = entry
    return chosen
```

- [ ] **Step 6: Run the shape tests**

Run: `cd backend && python -m pytest tests/test_circles_insights.py -q`
Expected: PASS (8 passed)

- [ ] **Step 7: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles_insights.py
git commit -m "feat(circles): new enrichment shape — connection degree + always-on school"
```

---

## Task 5: Batch enrichment path (feed N+1 preserved)

**Files:**
- Modify: `backend/services/circles.py` — `seller_circles_for_viewer_batch` (lines ~487-597)
- Test: `backend/tests/test_circles_insights.py`

- [ ] **Step 1: Write the failing integration-ish test**

Append to `backend/tests/test_circles_insights.py` (uses real DB fixtures — skips without Supabase env):
```python
def test_batch_returns_new_shape_for_each_seller(db_session, make_user, test_user):
    seller = make_user(display_name="Seller")
    from services.circles import seller_circles_for_viewer_batch
    out = seller_circles_for_viewer_batch(
        db_session, [seller.id], test_user, viewer_circle_ids=set(),
    )
    assert set(out[seller.id].keys()) == {"connection", "school"}
    assert out[seller.id]["connection"]["degree"] is None  # strangers, no graph
    assert out[seller.id]["school"] is None                 # seller has no school
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python -m pytest tests/test_circles_insights.py::test_batch_returns_new_shape_for_each_seller -q`
Expected: FAIL (KeyError / old shape) — or SKIP if no Supabase env (then verify on a configured machine).

- [ ] **Step 3: Rewrite the batch function**

Replace `seller_circles_for_viewer_batch` body (lines ~521-597) with:
```python
    if not seller_ids:
        return {}

    # --- Visible schools for all sellers in one query ---
    school_rows = (
        db.query(CommunityMember.user_id, Community, SchoolSeed.short_name)
        .join(Community, Community.id == CommunityMember.community_id)
        .outerjoin(SchoolSeed, SchoolSeed.id == Community.school_seed_id)
        .filter(
            CommunityMember.user_id.in_(seller_ids),
            CommunityMember.share_with_mutuals.is_(True),
            Community.kind == "school",
        )
        .order_by(Community.id)
        .all()
    )
    schools_by_seller: dict[str, list[tuple]] = {sid: [] for sid in seller_ids}
    for uid, community, short_name in school_rows:
        if uid in schools_by_seller:
            schools_by_seller[uid].append((community, short_name))

    def pick_school(sid: str) -> dict | None:
        chosen = None
        for community, short_name in schools_by_seller.get(sid, []):
            is_mine = community.id in viewer_circle_ids
            entry = {"shortName": short_name or community.name,
                     "fullName": community.name, "isMine": is_mine}
            if is_mine:
                return entry
            if chosen is None:
                chosen = entry
        return chosen

    # --- Which sellers share mutual friends (consent) ---
    sharing: set[str] = set()
    if seller_map is not None:
        for sid in seller_ids:
            u = seller_map.get(sid)
            if u is not None and bool(u.share_mutual_friends):
                sharing.add(sid)
        missing = [sid for sid in seller_ids if sid not in seller_map]
        if missing:
            for u in db.query(User).filter(User.id.in_(missing)).all():
                if bool(u.share_mutual_friends):
                    sharing.add(u.id)
    else:
        for u in db.query(User).filter(User.id.in_(seller_ids)).all():
            if bool(u.share_mutual_friends):
                sharing.add(u.id)

    # --- Graph slices for degree (only if any seller shares) ---
    viewer_friends: set[str] = set()
    edges: dict[str, set[str]] = {}
    seller_friends_map: dict[str, set[str]] = {sid: set() for sid in sharing}
    if sharing:
        viewer_friends = _load_friend_ids(db, viewer.id)
        edges = _friend_edges_for(db, viewer_friends)
        rows = (
            db.query(Friendship)
            .filter(
                Friendship.status == "accepted",
                (Friendship.user_id.in_(sharing)) | (Friendship.friend_id.in_(sharing)),
            )
            .all()
        )
        for r in rows:
            if r.user_id in seller_friends_map:
                seller_friends_map[r.user_id].add(r.friend_id)
            if r.friend_id in seller_friends_map:
                seller_friends_map[r.friend_id].add(r.user_id)

    result: dict[str, dict] = {}
    for sid in seller_ids:
        degree = None
        if sid in sharing:
            degree = _connection_degree_from_sets(
                seller_id=sid, viewer_friends=viewer_friends,
                seller_friends=seller_friends_map.get(sid, set()),
                edges_from_viewer_friends=edges, viewer_id=viewer.id,
            )
        result[sid] = _assemble_circles(school=pick_school(sid), degree=degree)
    return result
```

- [ ] **Step 4: Run the test**

Run: `cd backend && python -m pytest tests/test_circles_insights.py -q`
Expected: PASS (or SKIP the DB test without env; run the pure tests regardless).

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles_insights.py
git commit -m "feat(circles): batch enrichment to new shape (degree + school), N+1 preserved"
```

---

## Task 6: Settings summary drops neighborhood

**Files:**
- Modify: `backend/services/circles.py` — `get_user_circles_summary` (lines ~255-290)
- Test: `backend/tests/test_circles_insights.py`

- [ ] **Step 1: Write the failing test**

Append:
```python
def test_summary_has_no_neighborhood_key(db_session, test_user):
    from services.circles import get_user_circles_summary
    out = get_user_circles_summary(db_session, test_user)
    assert "neighborhood" not in out
    assert set(out.keys()) == {"schools", "mutualFriends"}
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && python -m pytest tests/test_circles_insights.py::test_summary_has_no_neighborhood_key -q`
Expected: FAIL — current summary returns a `neighborhood` key.

- [ ] **Step 3: Edit `get_user_circles_summary`**

In `get_user_circles_summary`, restrict the query to school kind and drop the neighborhood branch. Replace the function body (lines ~262-290) with:
```python
    rows = (
        db.query(Community, CommunityMember)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == user.id,
            Community.kind == "school",
        )
        .all()
    )
    schools = [
        {"community_id": c.id, "name": c.name, "share": bool(m.share_with_mutuals)}
        for c, m in rows
    ]
    return {
        "schools": schools,
        "mutualFriends": {"share": bool(user.share_mutual_friends)},
    }
```

- [ ] **Step 4: Run the test**

Run: `cd backend && python -m pytest tests/test_circles_insights.py -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite to catch shape regressions**

Run: `cd backend && python -m pytest -q`
Expected: PASS (fix any test asserting the OLD `circles` / summary shape — update those assertions to the new shape; do **not** weaken unrelated tests).

- [ ] **Step 6: Commit**

```bash
git add backend/services/circles.py backend/tests/
git commit -m "feat(circles): settings summary drops neighborhood row"
```

---

## Task 7: School membership visibility backfill

**Files:**
- Create: `supabase/migrations/0018_school_membership_visible.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0018_school_membership_visible.sql`:
```sql
-- Existing school memberships should be visible on listings by default
-- (school becomes always-on per the 2026-06-20 insights redesign).
-- Idempotent: safe to re-run.
UPDATE public.community_members AS cm
   SET share_with_mutuals = TRUE
  FROM public.communities AS c
 WHERE c.id = cm.community_id
   AND c.kind = 'school'
   AND cm.share_with_mutuals IS DISTINCT FROM TRUE;
```

- [ ] **Step 2: Apply it**

Run:
```bash
cd backend && python -c "import os; from pathlib import Path; from dotenv import load_dotenv; load_dotenv(Path('.env')); import psycopg2; c=psycopg2.connect(os.environ['DATABASE_URL']); cur=c.cursor(); cur.execute(open('../supabase/migrations/0018_school_membership_visible.sql').read()); print('rows updated:', cur.rowcount); c.commit(); c.close()"
```
Expected: `rows updated: <N>`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0018_school_membership_visible.sql
git commit -m "feat(circles): backfill school memberships to visible (always-on school)"
```

---

## Task 8: Frontend `ListingCircles` type

**Files:**
- Modify: `frontend/src/lib/types.ts:29-33`

- [ ] **Step 1: Replace the `ListingCircles` interface**

```ts
export interface ListingCircles {
  connection: { degree: 1 | 2 | 3 | null };
  school: { shortName: string; fullName: string; isMine: boolean } | null;
}
```

- [ ] **Step 2: Typecheck (will surface the byline/preview break — expected)**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors in `CircleByline.tsx` and `CirclePreview.tsx` referencing old keys — these are fixed in Tasks 9 & 11.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(circles): new ListingCircles type (connection + school)"
```

---

## Task 9: Rewrite `CircleByline`

**Files:**
- Rewrite: `frontend/src/components/CircleByline.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// frontend/src/components/CircleByline.tsx
import { GraduationCap } from "lucide-react";
import type { ListingCircles } from "../lib/types";

interface CircleBylineProps {
  circles?: ListingCircles;
}

const MEDAL: Record<1 | 2 | 3, { label: string; cls: string }> = {
  1: { label: "1st", cls: "bg-medal-gold text-medal-gold-ink" },
  2: { label: "2nd", cls: "bg-medal-silver text-medal-silver-ink" },
  3: { label: "3rd", cls: "bg-medal-bronze text-medal-bronze-ink" },
};

/** Insight byline: connection medal ribbon (left) + always-on school (right).
 *  Connection blank past 3rd; school bold when it's the viewer's own. */
export function CircleByline({ circles }: CircleBylineProps) {
  const degree = circles?.connection.degree ?? null;
  const school = circles?.school ?? null;
  const medal = degree ? MEDAL[degree] : null;

  return (
    <div className="flex items-center justify-between gap-2 min-h-[2.25rem] mb-1">
      {medal ? (
        <span
          className={`inline-flex items-center pl-2 pr-3 py-1 text-[11px] font-extrabold leading-none ${medal.cls}`}
          style={{ clipPath: "polygon(0 0,100% 0,calc(100% - 7px) 50%,100% 100%,0 100%)" }}
        >
          {medal.label}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}

      {school ? (
        <span
          title={school.fullName}
          className={`inline-flex items-center gap-1 min-w-0 text-xs text-ink ${
            school.isMine ? "font-extrabold" : "font-medium"
          }`}
        >
          <GraduationCap className="size-[15px] shrink-0" />
          <span className="truncate">{school.shortName}</span>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add medal color tokens to the Tailwind theme**

In `frontend/src/index.css` (the `@theme` block where the Electric Violet tokens live — grep for `--color-primary`), add:
```css
  --color-medal-gold: #FBEEC2;
  --color-medal-gold-ink: #8A6A12;
  --color-medal-silver: #E9ECF1;
  --color-medal-silver-ink: #6B717A;
  --color-medal-bronze: #F2DCC7;
  --color-medal-bronze-ink: #8E5A31;
```
(Confirm the file/location with `grep -rn "color-primary" frontend/src/*.css`; match the existing token syntax — `@theme {}` for Tailwind v4.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors in `CircleByline.tsx` (CirclePreview still errors until Task 11).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CircleByline.tsx frontend/src/index.css
git commit -m "feat(circles): medal-ribbon + always-on school byline"
```

---

## Task 10: Location line shows distance

**Files:**
- Modify: `frontend/src/components/ListingCard.tsx:96`

- [ ] **Step 1: Replace the location line**

Replace line 96:
```tsx
        <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
```
with:
```tsx
        <p className="text-xs text-muted line-clamp-1">
          {listing.location}
          {listing.distance_miles != null && (
            <span className="text-line-strong"> · </span>
          )}
          {listing.distance_miles != null && `${listing.distance_miles} mi`}
        </p>
```
(If `text-line-strong` isn't a defined token, use `text-muted`; the separator color is cosmetic.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors (`distance_miles` already on the `Listing` type).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ListingCard.tsx
git commit -m "feat(circles): show coarse distance on the listing location line"
```

---

## Task 11: Update `CirclePreview` (signup + settings)

**Files:**
- Modify: `frontend/src/pages/signup/CirclePreview.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { CircleByline } from "../../components/CircleByline";

interface CirclePreviewProps {
  /** Show a sample connection medal (1st) in the preview. */
  connection?: boolean;
  /** Show a sample school; bold when the viewer "shares" it. */
  school?: boolean;
}

/** Settings/signup preview of how a listing byline will look. */
export function CirclePreview({ connection = false, school = false }: CirclePreviewProps) {
  return (
    <div className="rounded-lg border border-hairline p-3 max-w-[220px]">
      <CircleByline
        circles={{
          connection: { degree: connection ? 1 : null },
          school: school
            ? { shortName: "Columbia", fullName: "Columbia University", isMine: true }
            : null,
        }}
      />
      <div className="aspect-square bg-surface-soft rounded-md" />
      <p className="text-sm font-medium text-ink mt-2">Sample listing</p>
      <p className="text-xs text-muted">Chelsea · 0.4 mi</p>
      <p className="text-base font-semibold text-ink">$48</p>
    </div>
  );
}
```

- [ ] **Step 2: Find and fix all `CirclePreview` call sites**

Run: `cd frontend && grep -rn "CirclePreview" src/`
Expected call sites: `CircleSettings.tsx` and any signup step. Update each to the new props (`connection` / `school`) — e.g. `<CirclePreview connection={mutualOn} school={schoolShareOn} />`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/signup/CirclePreview.tsx frontend/src/
git commit -m "feat(circles): CirclePreview to connection+school shape"
```

---

## Task 12: Settings — remove neighborhood row

**Files:**
- Modify: `frontend/src/pages/MyAccount/CircleSettings.tsx`

- [ ] **Step 1: Update the summary type**

Change the `CircleSummary` interface (line ~22) to drop neighborhood:
```ts
interface CircleSummary {
  schools: CircleSchool[];
  mutualFriends: { share: boolean };
}
```

- [ ] **Step 2: Remove the neighborhood branch in `patchConsent`**

Delete the `if (prev.neighborhood?.community_id === community_id) { ... }` block (lines ~65-70); keep only the schools-mapping branch.

- [ ] **Step 3: Remove the neighborhood row from the rendered rows**

Delete the JSX block that renders the neighborhood toggle row (search for `summary.neighborhood`). Keep the **Connections** (mutualFriends) and **Schools** rows. Update any section copy referencing neighborhood.

- [ ] **Step 4: Update the preview call**

Set the bottom preview to:
```tsx
<CirclePreview connection={summary.mutualFriends.share} school={schoolShareOn} />
```

- [ ] **Step 5: Typecheck + manual smoke**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors.
Then `cd frontend && npm run dev`, open My Account → Settings → Circles: only **Connections** and **Schools** rows appear; toggles flip; the preview reflects them.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MyAccount/CircleSettings.tsx
git commit -m "feat(circles): settings shows Connections + Schools only (no neighborhood)"
```

---

## Task 13: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Backend up + feed shape**

Run the API and hit the feed as an authed user; confirm each listing's `circles` is `{connection:{degree}, school:{shortName,fullName,isMine}|null}` and `distance_miles` is present.
```bash
cd backend && uvicorn main:app --reload  # in one shell
# in another, with a valid token:
curl -s localhost:8000/api/listings -H "Authorization: Bearer <token>" | python -m json.tool | grep -A4 '"circles"' | head
```
Expected: new keys only; no `neighborhood`/`mutualFriends` keys.

- [ ] **Step 2: Visual check in the browser**

`cd frontend && npm run dev`. In the marketplace: a direct friend's card shows a **gold** ribbon; a stranger shows **no ribbon**; school name renders (bold when it's yours); location line reads `Neighborhood · N.N mi`; **no "Your building"** anywhere; long school names show the short name without overflow.

- [ ] **Step 3: Signed-out feed**

Log out; confirm the feed loads, schools still render, no ribbons, no distance, no crash.

- [ ] **Step 4: Commit (if any tweaks were needed)**

```bash
git add -A && git commit -m "fix(circles): e2e verification tweaks"
```

---

## Task 14: QA pass

**Files:** none (qa-tester)

- [ ] Run the `qa-tester` agent against the spec's §11 QA criteria (degree colors, school always-on + bold-when-mine, short-name no-overflow, location-line distance, no building indicator, signed-out feed, settings rows, batch query count, no regression for circle-less users). Produce a pass/fail report to the main session.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §2/§3 connection ribbon → T3,T4,T5,T9; school always-on + short_name → T1,T2,T4,T5,T9; proximity (distance, no building) → T10 (reuses existing `distance_miles`); §5 enrichment shape → T4,T5; §5e consent (school via `share_with_mutuals`, connection via `share_mutual_friends`) → T4,T5,T7; §6 surfaces → T9–T12; §7 data/migration → T1,T2,T7; §8 ranking untouched → no task (intentional); §11 QA → T13,T14. No gaps.
- **Type consistency:** `circles = {connection:{degree:1|2|3|null}, school:{shortName,fullName,isMine}|null}` is identical in `EMPTY_CIRCLES` (T4), `_assemble_circles` (T4), batch (T5), TS type (T8), `CircleByline` (T9), `CirclePreview` (T11). `_connection_degree_from_sets` signature identical across T3/T4/T5.
- **No placeholders:** every code step is complete; the only verify-then-match note is the `index.css` token location (T9 step 2) and `text-line-strong` fallback (T10) — both give an explicit fallback.
