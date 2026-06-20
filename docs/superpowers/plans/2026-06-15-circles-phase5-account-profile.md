# Circles — Phase 5: My Account + Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users re-edit each circle's visibility and manage their schools (add/remove, max 2) in My Account → Settings, and show a seller's schools on their profile.

**Architecture:** Backend adds a small circles-management API on the existing `routers/circles.py` (read my circles + consent; toggle per-circle consent; toggle the mutual-friends flag; add/remove a school) plus a `remove_user_school` service helper, and extends the profile endpoint to include schools. Frontend adds a self-contained `CircleSettings` panel to the My Account Settings tab (toggles + school autocomplete + live preview, reusing `CirclePreview`), and a schools line to `UserProfilePage`. Verification: backend via pytest; frontend via `npm run typecheck` + `npm run build` + visual check.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres, pytest; React 18, Vite, TypeScript, Tailwind v4, lucide-react.

**Depends on:** Phase 1 (`services/circles.py`, models), Phase 3 (`routers/circles.py`, `useSchoolSearch`, `CirclePreview`, the switch pattern from `CreateCommunityModal`), Phase 4 (`CircleByline`).

---

## File Structure (Phase 5)

- Modify: `backend/services/circles.py` — add `remove_user_school`, `get_user_circles_summary`.
- Modify: `backend/routers/circles.py` — add `GET /api/circles/me`, `PATCH /api/circles/consent`, `PATCH /api/circles/mutual-friends`, `POST /api/circles/schools`, `DELETE /api/circles/schools/{community_id}`.
- Modify: `backend/routers/friends.py` — add `schools` to the `GET /api/friends/profile/{user_id}` response.
- Test: `backend/tests/test_circles_account.py` (new).
- Create: `frontend/src/pages/MyAccount/CircleSettings.tsx` — the Settings → Circles panel.
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — render `<CircleSettings />` in the Settings tab.
- Modify: `frontend/src/pages/UserProfilePage.tsx` — show the schools line.

---

## Task 1: Service helpers — `remove_user_school`, `get_user_circles_summary`

**Files:**
- Modify: `backend/services/circles.py`
- Test: `backend/tests/test_circles_account.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_circles_account.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, SchoolSeed
from services.circles import (
    add_user_school, remove_user_school, get_user_circles_summary,
    set_user_building, set_circle_consent, list_user_schools,
)


def test_remove_user_school_drops_membership(db_session, make_user):
    u = make_user(display_name="R")
    seed = SchoolSeed(name="Fordham University", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)
    school = add_user_school(db_session, u, seed.id)
    remove_user_school(db_session, u, school.id)
    assert list_user_schools(db_session, u.id) == []
    db_session.query(Community).filter(Community.id == school.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_circles_summary_shape(db_session, make_user):
    u = make_user(display_name="Sum")
    b = set_user_building(db_session, u, "1 Main St")
    set_circle_consent(db_session, u.id, b.id, True)
    u.share_mutual_friends = True
    db_session.commit()
    summary = get_user_circles_summary(db_session, u)
    assert summary["building"]["share"] is True
    assert summary["building"]["community_id"] == b.id
    assert summary["schools"] == []
    assert summary["mutualFriends"]["share"] is True
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_circles_account.py -k "remove_user_school or summary" -v`
Expected: FAIL with `ImportError` for `remove_user_school` / `get_user_circles_summary`.

- [ ] **Step 3: Implement the helpers**

```python
# append to backend/services/circles.py
def remove_user_school(db: Session, user: User, community_id: int) -> None:
    """Drop the user's membership in a school circle. Leaves the Community row
    (other users may still be members)."""
    db.query(CommunityMember).filter(
        CommunityMember.user_id == user.id,
        CommunityMember.community_id == community_id,
    ).delete()
    db.commit()


def get_user_circles_summary(db: Session, user: User) -> dict:
    """Shape for My Account: the user's building (if any), schools, and the
    mutual-friends flag, each with its consent state."""
    rows = (
        db.query(Community, CommunityMember)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(
            CommunityMember.user_id == user.id,
            Community.kind.in_(("building", "school")),
        )
        .all()
    )
    building = None
    schools: list[dict] = []
    for community, membership in rows:
        if community.kind == "building":
            building = {
                "community_id": community.id,
                "label": "Same building",
                "share": bool(membership.share_with_mutuals),
            }
        elif community.kind == "school":
            schools.append({
                "community_id": community.id,
                "name": community.name,
                "share": bool(membership.share_with_mutuals),
            })
    return {
        "building": building,
        "schools": schools,
        "mutualFriends": {"share": bool(user.share_mutual_friends)},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_circles_account.py -k "remove_user_school or summary" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/circles.py backend/tests/test_circles_account.py
git commit -m "feat(circles): remove_user_school + get_user_circles_summary"
```

---

## Task 2: Circles-management API

**Files:**
- Modify: `backend/routers/circles.py`
- Test: `backend/tests/test_circles_account.py`

- [ ] **Step 1: Write failing tests**

```python
# append to backend/tests/test_circles_account.py
def test_circles_me_and_consent_and_schools(db_session, make_user, client, override_auth_user):
    u = make_user(display_name="Acct")
    set_user_building(db_session, u, "77 Pine St")
    seed = SchoolSeed(name="Pace University", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)
    override_auth_user(u)

    me = client.get("/api/circles/me").json()
    assert me["building"] is not None and me["building"]["share"] is False
    b_cid = me["building"]["community_id"]

    assert client.patch("/api/circles/consent", json={"community_id": b_cid, "share": True}).status_code == 200
    assert client.get("/api/circles/me").json()["building"]["share"] is True

    assert client.patch("/api/circles/mutual-friends", json={"share": True}).status_code == 200
    assert client.get("/api/circles/me").json()["mutualFriends"]["share"] is True

    added = client.post("/api/circles/schools", json={"seed_id": seed.id})
    assert added.status_code == 200
    s_cid = added.json()["community_id"]
    assert any(s["community_id"] == s_cid for s in client.get("/api/circles/me").json()["schools"])

    assert client.delete(f"/api/circles/schools/{s_cid}").status_code == 200
    assert client.get("/api/circles/me").json()["schools"] == []

    # cleanup
    from services.circles import normalize_address
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.query(Community).filter(Community.name == normalize_address("77 Pine St")).delete()
    db_session.query(Community).filter(Community.school_seed_id == seed.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_add_school_over_cap_returns_400(db_session, make_user, client, override_auth_user):
    u = make_user(display_name="Cap")
    seeds = [SchoolSeed(name=f"Sch {i}", state="NY") for i in range(3)]
    db_session.add_all(seeds); db_session.commit()
    override_auth_user(u)
    assert client.post("/api/circles/schools", json={"seed_id": seeds[0].id}).status_code == 200
    assert client.post("/api/circles/schools", json={"seed_id": seeds[1].id}).status_code == 200
    assert client.post("/api/circles/schools", json={"seed_id": seeds[2].id}).status_code == 400
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.query(Community).filter(Community.school_seed_id.in_([s.id for s in seeds])).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_([s.id for s in seeds])).delete(synchronize_session=False)
    db_session.commit()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_circles_account.py -k "me_and_consent or over_cap" -v`
Expected: FAIL with 404/405 (routes do not exist).

- [ ] **Step 3: Add the endpoints to `routers/circles.py`**

Add imports + Pydantic bodies at the top of `routers/circles.py`:

```python
from fastapi import HTTPException
from pydantic import BaseModel

from services.circles import (
    get_user_circles_summary, set_circle_consent, add_user_school,
    remove_user_school, list_user_schools, TooManySchools,
)
from models import CommunityMember


class ConsentBody(BaseModel):
    community_id: int
    share: bool


class MutualFriendsBody(BaseModel):
    share: bool


class AddSchoolBody(BaseModel):
    seed_id: int
```

Add the routes:

```python
@router.get("/circles/me")
def my_circles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_user_circles_summary(db, current_user)


@router.patch("/circles/consent")
def patch_consent(body: ConsentBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    member = db.query(CommunityMember).filter(
        CommunityMember.user_id == current_user.id,
        CommunityMember.community_id == body.community_id,
    ).first()
    if member is None:
        raise HTTPException(status_code=404, detail="Not a member of that circle")
    set_circle_consent(db, current_user.id, body.community_id, body.share)
    return {"ok": True}


@router.patch("/circles/mutual-friends")
def patch_mutual_friends(body: MutualFriendsBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.share_mutual_friends = body.share
    db.commit()
    return {"ok": True}


@router.post("/circles/schools")
def add_school(body: AddSchoolBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        school = add_user_school(db, current_user, body.seed_id)
    except TooManySchools:
        raise HTTPException(status_code=400, detail="Maximum of 2 schools")
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown school")
    return {"community_id": school.id, "name": school.name, "share": False}


@router.delete("/circles/schools/{community_id}")
def delete_school(community_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    remove_user_school(db, current_user, community_id)
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_circles_account.py -k "me_and_consent or over_cap" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/circles.py backend/tests/test_circles_account.py
git commit -m "feat(circles): My Account circles API (me, consent, mutual-friends, schools)"
```

---

## Task 3: Add `schools` to the profile endpoint

**Files:**
- Modify: `backend/routers/friends.py` (`GET /profile/{user_id}` ~289)
- Test: `backend/tests/test_circles_account.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles_account.py
def test_profile_includes_schools(db_session, make_user, client, override_auth_user):
    seller = make_user(display_name="Seller")
    viewer = make_user(display_name="Viewer")
    seed = SchoolSeed(name="Hunter College", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)
    add_user_school(db_session, seller, seed.id)
    override_auth_user(viewer)
    resp = client.get(f"/api/friends/profile/{seller.id}")
    assert resp.status_code == 200
    assert "Hunter College" in [s["name"] for s in resp.json().get("schools", [])]
    db_session.query(CommunityMember).filter(CommunityMember.user_id == seller.id).delete()
    db_session.query(Community).filter(Community.school_seed_id == seed.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_account.py::test_profile_includes_schools -v`
Expected: FAIL with `KeyError`/empty `schools`.

- [ ] **Step 3: Add schools to the profile response**

In `backend/routers/friends.py`, add the import:

```python
from services.circles import list_user_schools
```

In the `/profile/{user_id}` handler, where the response dict is built, add:

```python
        "schools": [{"name": c.name} for c in list_user_schools(db, user_id)],
```

(Match the existing key style of that endpoint's returned dict; `user_id` is the path param / profile subject.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_account.py::test_profile_includes_schools -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/friends.py backend/tests/test_circles_account.py
git commit -m "feat(circles): profile endpoint returns the user's schools"
```

---

## Task 4: My Account → Settings → Circles panel

**Files:**
- Create: `frontend/src/pages/MyAccount/CircleSettings.tsx`
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` (Settings tab body)

- [ ] **Step 1: Write the panel component**

```tsx
// frontend/src/pages/MyAccount/CircleSettings.tsx
import { useEffect, useState } from "react";
import { Building2, GraduationCap, Users } from "lucide-react";
import { apiFetch } from "../../lib/api";
import { useSchoolSearch, type School } from "../../lib/useSchoolSearch";
import { CirclePreview } from "../signup/CirclePreview";
import { FOCUS_RING } from "./constants";

interface CircleSchool { community_id: number; name: string; share: boolean }
interface CircleSummary {
  building: { community_id: number; label: string; share: boolean } | null;
  schools: CircleSchool[];
  mutualFriends: { share: boolean };
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative w-10 h-5 rounded-full transition-colors ${on ? "bg-primary" : "bg-surface-strong"} ${FOCUS_RING}`}>
      <span className={`absolute top-0.5 size-4 rounded-full bg-canvas transition-transform ${on ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

export function CircleSettings({ token }: { token: string }) {
  const [summary, setSummary] = useState<CircleSummary | null>(null);
  const [query, setQuery] = useState("");
  const results = useSchoolSearch(query, token).filter(
    (r) => !summary?.schools.some((s) => s.name === r.name),
  );

  const load = () => { apiFetch("/api/circles/me").then((r) => r.json()).then(setSummary).catch(() => {}); };
  useEffect(load, []);

  if (!summary) return <p className="text-sm text-muted">Loading circles…</p>;

  const patchConsent = async (community_id: number, share: boolean) => {
    await apiFetch("/api/circles/consent", { method: "PATCH", body: JSON.stringify({ community_id, share }) });
    load();
  };
  const patchMutual = async (share: boolean) => {
    await apiFetch("/api/circles/mutual-friends", { method: "PATCH", body: JSON.stringify({ share }) });
    load();
  };
  const addSchool = async (s: School) => {
    const res = await apiFetch("/api/circles/schools", { method: "POST", body: JSON.stringify({ seed_id: s.id }) });
    if (res.ok) { setQuery(""); load(); }
  };
  const removeSchool = async (community_id: number) => {
    await apiFetch(`/api/circles/schools/${community_id}`, { method: "DELETE" });
    load();
  };

  const schoolFull = summary.schools.length >= 2;

  return (
    <div className="border border-hairline rounded-md p-5 space-y-1">
      <h3 className="text-base font-extrabold text-ink tracking-tight">Circles</h3>
      <p className="text-xs text-muted">
        Opting in will activate your circle when mutuals view your listings. Opting out will leave your circle permanently faded, even if a mutual views your listings.
      </p>

      {/* Building */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline mt-3">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><Building2 className="size-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Building</div>
          <div className="text-xs text-muted">Shown as "Same building".</div>
        </div>
        {summary.building ? (
          <Toggle on={summary.building.share} label="Toggle building visibility"
            onClick={() => patchConsent(summary.building!.community_id, !summary.building!.share)} />
        ) : <span className="text-xs text-muted-soft">No address</span>}
      </div>

      {/* Schools */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><GraduationCap className="size-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Schools</div>
          <div className="text-xs text-muted">Up to 2. Shown to anyone from the same school.</div>
          <div className="flex flex-wrap gap-2 mt-3">
            {summary.schools.map((s) => (
              <span key={s.community_id} className="inline-flex items-center gap-2 text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full pl-3 pr-1.5 py-1">
                {s.name}
                <button type="button" onClick={() => removeSchool(s.community_id)} className="size-[18px] rounded-full bg-surface-strong text-muted hover:text-ink" aria-label="Remove">×</button>
              </span>
            ))}
          </div>
          {!schoolFull && (
            <div className="relative mt-3 max-w-xs">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add a school"
                className="w-full text-sm text-ink px-3 py-2 border border-border-strong rounded-sm bg-canvas" />
              {results.length > 0 && (
                <div className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border border-hairline bg-canvas shadow-overlay">
                  {results.map((r) => (
                    <button key={r.id} type="button" onClick={() => addSchool(r)} className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft">{r.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {schoolFull && <p className="text-[11px] text-muted-soft mt-2">Maximum of 2 schools. Remove one to add another.</p>}
        </div>
        {/* per-school consent: a single toggle controls all school memberships */}
        <Toggle on={summary.schools.some((s) => s.share)} label="Toggle school visibility"
          onClick={() => summary.schools.forEach((s) => patchConsent(s.community_id, !summary.schools.some((x) => x.share)))} />
      </div>

      {/* Mutual friends */}
      <div className="flex items-start gap-3 py-4 border-t border-hairline">
        <span className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center shrink-0"><Users className="size-5" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-ink">Mutual friends</div>
          <div className="text-xs text-muted">Show people you both know on your listings.</div>
        </div>
        <Toggle on={summary.mutualFriends.share} label="Toggle mutual friends visibility"
          onClick={() => patchMutual(!summary.mutualFriends.share)} />
      </div>

      <div className="border-t border-hairline pt-4">
        <p className="text-xs font-semibold text-muted mb-2">How mutuals will see your listings:</p>
        <CirclePreview
          building={!!summary.building?.share}
          school={summary.schools.some((s) => s.share)}
          mutualFriends={summary.mutualFriends.share}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in the Settings tab**

In `MyAccountPage.tsx`, inside the Settings tab body (where `accountTab === "settings"` content renders), add `<CircleSettings token={...} />`. Use the same token source the page already uses for `apiFetch` (if `apiFetch` injects auth itself, pass the token only for `useSchoolSearch`; grep how `useSchoolSearch` consumers get the token — in Phase 3 it came from `pendingToken`. Here, read the active session token the same way other authed pages do, or have `useSchoolSearch` use `apiFetch` instead of raw `fetch`). **Decision:** change `useSchoolSearch` to call `apiFetch("/api/schools/search?q=...")` (which injects auth) and drop the `token` param, so `CircleSettings` needs no token. Update the Phase 3 `SchoolStep` caller accordingly (it passed `pendingToken`; during registration `apiFetch` may not yet have a session — so keep a `token?` override: `useSchoolSearch(query, tokenOverride?)` that uses `apiFetch` when no override is given). Apply that small change to `useSchoolSearch` now.

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 4: Visual check**

Open My Account → Settings. Toggle each circle, add/remove a school (cap at 2), and confirm the "How mutuals will see your listings" preview lights/fades accordingly. Compare against `.superpowers/brainstorm/.../my-account-circles.html`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MyAccount/CircleSettings.tsx frontend/src/pages/MyAccount/MyAccountPage.tsx frontend/src/lib/useSchoolSearch.ts frontend/src/pages/signup/steps/SchoolStep.tsx
git commit -m "feat(circles): My Account Circles settings panel"
```

---

## Task 5: Profile schools line

**Files:**
- Modify: `frontend/src/pages/UserProfilePage.tsx` (identity area; the profile fetch result ~69)

- [ ] **Step 1: Extend the profile type + render the schools line**

In `UserProfilePage.tsx`, add `schools?: { name: string }[]` to the type of the `/api/friends/profile/{userId}` response, then in the identity area (near the name / neighborhood) render:

```tsx
{profile.schools && profile.schools.length > 0 && (
  <span className="inline-flex items-center gap-1.5 text-sm text-ink">
    <GraduationCap className="size-4 text-primary-text" aria-hidden="true" />
    {profile.schools.map((s) => s.name).join(" · ")}
  </span>
)}
```

Add `import { GraduationCap } from "lucide-react";` if not already imported. Place the line alongside the existing neighborhood text with the same separator styling used there.

- [ ] **Step 2: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 3: Visual check**

Open a seller's profile who has schools. Confirm the schools line renders (no verification check — verification was removed). Compare against `.superpowers/brainstorm/.../profile-schools.html` (minus the checkmarks).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/UserProfilePage.tsx
git commit -m "feat(circles): show seller schools on the profile"
```

---

## Task 6: Legacy cleanup + full verification

- [ ] **Step 1: Confirm the legacy community fields have no remaining readers**

Run: `cd frontend && grep -rn "allCommunities\|mutualCommunities\|mutualCommunityNames\|heroCommunity\|PLACEHOLDER_COMMUNITY" src/`
For each hit, confirm it is unused after Phases 4-5. Remove dead references and, if fully unused, drop `allCommunities`/`mutualCommunities`/`mutualCommunityNames` from `Listing` in `types.ts` and `ListingCommunity`/`MutualCommunity` if nothing else imports them. Leave anything still referenced.

- [ ] **Step 2: Backend + frontend gates**

Run: `cd backend && python -m pytest tests/test_circles_account.py tests/test_circles.py -v`
Expected: PASS (or clean SKIP without Supabase env).
Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A
git commit -m "chore(circles): drop legacy community fields with no remaining readers"
```

---

## Self-Review (against the spec)

- **Spec §5c My Account:** three rows with toggles, school add/remove (cap 2), live preview (Task 4); copy matches the approved wording. ✔
- **Spec §5d profile:** schools line, no verification mark (Task 5). ✔
- **Backend support:** `GET /api/circles/me`, consent + mutual-friends PATCH, school add/remove, profile schools (Tasks 1-3), all pytest-covered. ✔
- **Consent semantics:** toggling a row flips `share_with_mutuals` (building/school) or `share_mutual_friends` (user flag); the school row uses one toggle across both school memberships — documented in the component. ✔
- **DRY:** reuses `CirclePreview` (Phase 3 → delegates to `CircleByline` from Phase 4), `useSchoolSearch` (Phase 3), and the switch markup from `CreateCommunityModal`. ✔
- **`useSchoolSearch` token change:** generalized to use `apiFetch` with an optional token override so it works both in registration (pre-session `pendingToken`) and in My Account (active session) — Task 4 Step 2 updates Phase 3's hook + `SchoolStep` caller. ✔
- **No frontend tests:** typecheck + build + visual, stated up front. ✔
- **Legacy cleanup:** removal of the old community fields is gated on confirming no readers remain after Phases 4-5 (Task 6). ✔
