# Circles — Phase 3: Registration Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segment registration into a 4-step wizard (Name → Location → School → Circles consent) that captures the building, school, and mutual-friends circles + consent, ending on a Welcome screen that pushes into the sell wizard.

**Architecture:** Backend first: extend `POST /api/auth/register` to derive the building circle from the address, add up to 2 school circles, and persist per-circle consent (using the Phase 1 `services/circles.py` helpers); add a `GET /api/schools/search` endpoint for the autocomplete. Frontend: refactor `SignUpPage.tsx` from a single form into a stepped wizard holding shared form state, with one component per step and a final Welcome step. Verification: backend via pytest; frontend via `npm run typecheck` + `npm run build` (no frontend test runner exists) plus a visual check against the approved mockups in `.superpowers/brainstorm/`.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres, pytest; React 18, Vite, TypeScript, Tailwind v4, lucide-react.

**Depends on:** Phase 1 (`services/circles.py`: `set_user_building`, `search_schools`, `add_user_school`, `set_circle_consent`, `TooManySchools`; `users.share_mutual_friends`). Phase 2 is not required for registration but should land first so new accounts immediately produce correct feed signals.

---

## File Structure (Phase 3)

- Modify: `backend/routers/auth.py` — extend `RegisterRequest` + `register()` to capture circles & consent.
- Create: `backend/routers/circles.py` — `GET /api/schools/search`.
- Modify: `backend/main.py` — register the new `circles` router.
- Test: `backend/tests/test_circles_register.py` (new).
- Create: `frontend/src/lib/useSchoolSearch.ts` — debounced school autocomplete hook.
- Create: `frontend/src/pages/signup/SignUpWizard.tsx` — stepped container (replaces the body of `SignUpPage`).
- Create: `frontend/src/pages/signup/steps/NameStep.tsx`, `LocationStep.tsx`, `SchoolStep.tsx`, `CirclesStep.tsx`, `WelcomeStep.tsx`.
- Create: `frontend/src/pages/signup/CirclePreview.tsx` — the fixed three-slot byline preview (shared with later phases' visual language).
- Modify: `frontend/src/pages/SignUpPage.tsx` — becomes a thin wrapper that renders `SignUpWizard`.

---

## Task 1: Extend the register endpoint (backend)

**Files:**
- Modify: `backend/routers/auth.py` (`RegisterRequest` model; `register()` ~102-133)
- Test: `backend/tests/test_circles_register.py`

- [ ] **Step 1: Write a failing test**

```python
# backend/tests/test_circles_register.py
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, SchoolSeed, User
from services.circles import list_user_schools


def test_register_captures_building_school_and_consent(
    db_session, make_user, client, override_auth_user
):
    # A fresh authed user whose public.users row exists but profile is bare.
    user = make_user(display_name="Pre")
    seed = SchoolSeed(name="New York University", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)

    override_auth_user(user)
    resp = client.post("/api/auth/register", json={
        "display_name": "Maya Rodriguez",
        "neighborhood": "Chelsea",
        "pickup_address": "123 W 21st St",
        "zip_code": "10011",
        "school_seed_ids": [seed.id],
        "share_building": True,
        "share_school": False,
        "share_mutual_friends": True,
    })
    assert resp.status_code == 200, resp.text

    db_session.expire_all()
    refreshed = db_session.query(User).filter(User.id == user.id).first()
    assert refreshed.share_mutual_friends is True

    schools = list_user_schools(db_session, user.id)
    assert {s.name for s in schools} == {"New York University"}

    building = (
        db_session.query(Community)
        .join(CommunityMember, CommunityMember.community_id == Community.id)
        .filter(CommunityMember.user_id == user.id, Community.kind == "building")
        .first()
    )
    assert building is not None
    b_member = db_session.query(CommunityMember).filter(
        CommunityMember.user_id == user.id, CommunityMember.community_id == building.id
    ).first()
    assert b_member.share_with_mutuals is True   # opted in
    s_member = db_session.query(CommunityMember).filter(
        CommunityMember.user_id == user.id,
        CommunityMember.community_id == schools[0].id,
    ).first()
    assert s_member.share_with_mutuals is False  # opted out

    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.user_id == user.id).delete()
    db_session.query(Community).filter(Community.id.in_([building.id, schools[0].id])).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_register.py -v`
Expected: FAIL (RegisterRequest rejects the new fields, or building/consent not persisted).

- [ ] **Step 3: Extend `RegisterRequest` and `register()`**

In `backend/routers/auth.py`, add fields to the `RegisterRequest` pydantic model:

```python
    school_seed_ids: list[int] = []
    share_building: bool = False
    share_school: bool = False
    share_mutual_friends: bool = False
```

Add imports near the top of `auth.py`:

```python
from services.circles import set_user_building, add_user_school, set_circle_consent, TooManySchools
```

In `register()`, after the existing `set_user_neighborhood(...)` block and before `db.refresh(existing)`, insert:

```python
    # Mutual-friends consent is a user-level flag.
    existing.share_mutual_friends = bool(req.share_mutual_friends)

    # Building circle, derived from the address; consent per req.share_building.
    if req.pickup_address:
        building = set_user_building(db, existing, req.pickup_address)
        if building is not None:
            set_circle_consent(db, existing.id, building.id, req.share_building)

    # School circles (max 2, enforced by add_user_school); consent per req.share_school.
    for seed_id in (req.school_seed_ids or [])[:2]:
        try:
            school = add_user_school(db, existing, seed_id)
        except (TooManySchools, ValueError):
            continue
        set_circle_consent(db, existing.id, school.id, req.share_school)

    db.commit()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_register.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/auth.py backend/tests/test_circles_register.py
git commit -m "feat(circles): register endpoint captures building, schools, consent"
```

---

## Task 2: `GET /api/schools/search` endpoint (backend)

**Files:**
- Create: `backend/routers/circles.py`
- Modify: `backend/main.py` (register the router)
- Test: `backend/tests/test_circles_register.py`

- [ ] **Step 1: Write a failing test**

```python
# append to backend/tests/test_circles_register.py
def test_schools_search_endpoint(db_session, client, authed_client):
    seeds = [SchoolSeed(name="Boston University", state="MA"),
             SchoolSeed(name="Boston College", state="MA")]
    db_session.add_all(seeds); db_session.commit()
    ids = [s.id for s in seeds]
    resp = authed_client.get("/api/schools/search", params={"q": "boston"})
    assert resp.status_code == 200
    names = {r["name"] for r in resp.json()}
    assert {"Boston University", "Boston College"} <= names
    assert all({"id", "name"} <= set(r) for r in resp.json())
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_circles_register.py::test_schools_search_endpoint -v`
Expected: FAIL with 404 (route does not exist).

- [ ] **Step 3: Create the router and register it**

```python
# backend/routers/circles.py
"""Circle-related read endpoints (school autocomplete; My Account toggles land
in Phase 5)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import User
from services.circles import search_schools

router = APIRouter(prefix="/api", tags=["circles"])


@router.get("/schools/search")
def schools_search(
    q: str = Query("", min_length=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [
        {"id": s.id, "name": s.name, "state": s.state}
        for s in search_schools(db, q)
    ]
```

In `backend/main.py`, near where other routers are included (search for `app.include_router(`), add:

```python
from routers import circles as circles_router
app.include_router(circles_router.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_circles_register.py::test_schools_search_endpoint -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routers/circles.py backend/main.py backend/tests/test_circles_register.py
git commit -m "feat(circles): GET /api/schools/search for the registration autocomplete"
```

---

## Task 3: School search hook + Circle preview component (frontend)

**Files:**
- Create: `frontend/src/lib/useSchoolSearch.ts`
- Create: `frontend/src/pages/signup/CirclePreview.tsx`

- [ ] **Step 1: Write the school-search hook**

```typescript
// frontend/src/lib/useSchoolSearch.ts
import { useEffect, useState } from "react";

export interface School {
  id: number;
  name: string;
  state: string | null;
}

/** Debounced search against /api/schools/search. Returns [] for an empty query. */
export function useSchoolSearch(query: string, token: string): School[] {
  const [results, setResults] = useState<School[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schools/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        setResults((await res.json()) as School[]);
      } catch {
        /* aborted or network error — leave prior results */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, token]);
  return results;
}
```

- [ ] **Step 2: Write the circle preview component**

```tsx
// frontend/src/pages/signup/CirclePreview.tsx
import { Building2, GraduationCap, Users } from "lucide-react";

export interface CirclePreviewProps {
  building: boolean;
  school: boolean;
  mutualFriends: boolean;
}

/** The fixed three-slot byline used across registration, feed, account, and
 *  profile. Lit (violet) when shared; faded otherwise. No tooltips here. */
export function CirclePreview({ building, school, mutualFriends }: CirclePreviewProps) {
  const slot = (on: boolean) =>
    `inline-flex items-center justify-center transition-[color,opacity] ${
      on ? "text-primary opacity-100" : "text-muted-soft opacity-30"
    }`;
  return (
    <div className="flex items-center justify-evenly h-6">
      <span className={slot(building)}><Building2 className="size-[18px]" /></span>
      <span className={slot(school)}><GraduationCap className="size-[18px]" /></span>
      <span className={slot(mutualFriends)}><Users className="size-[18px]" /></span>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/useSchoolSearch.ts frontend/src/pages/signup/CirclePreview.tsx
git commit -m "feat(circles): school-search hook + circle preview byline component"
```

---

## Task 4: Step components (frontend)

Each step is a controlled presentational component; the wizard (Task 5) owns state. Visual reference: `.superpowers/brainstorm/.../registration-flow.html`.

**Files:**
- Create: `frontend/src/pages/signup/steps/NameStep.tsx`, `LocationStep.tsx`, `SchoolStep.tsx`, `CirclesStep.tsx`, `WelcomeStep.tsx`

- [ ] **Step 1: Define the shared step types and write `NameStep`**

```tsx
// frontend/src/pages/signup/steps/NameStep.tsx
import { Input } from "../../../components/ui/input";

export interface NameStepProps {
  firstName: string;
  lastName: string;
  onFirst: (v: string) => void;
  onLast: (v: string) => void;
}

export function NameStep({ firstName, lastName, onFirst, onLast }: NameStepProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">What's your name?</h2>
      <p className="text-sm text-muted">This is how buyers and sellers will know you.</p>
      <Input placeholder="First" value={firstName} onChange={(e) => onFirst(e.target.value)} />
      <Input placeholder="Last" value={lastName} onChange={(e) => onLast(e.target.value)} />
    </div>
  );
}
```

- [ ] **Step 2: Write `LocationStep`** (address autocomplete + neighborhood confirm; neighborhood prefilled from the address's ZIP when derivable)

```tsx
// frontend/src/pages/signup/steps/LocationStep.tsx
import { AddressAutocompleteInput } from "../../../components/AddressAutocompleteInput";
import { LocationCombobox } from "../../../components/LocationCombobox";

export interface LocationStepProps {
  address: string;
  zip: string;
  neighborhood: string;
  neighborhoods: string[];
  onAddress: (v: string) => void;
  onSelectAddress: (label: string, zip: string) => void;
  onZip: (v: string) => void;
  onNeighborhood: (v: string) => void;
}

export function LocationStep(p: LocationStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">Where are you based?</h2>
      <p className="text-sm text-muted">We use this to group nearby listings and set your building.</p>
      <AddressAutocompleteInput
        id="signup-address"
        placeholder="Street address"
        value={p.address}
        onChangeText={p.onAddress}
        onSelect={(s) => p.onSelectAddress(s.label, s.zip)}
      />
      <p className="text-[10px] text-muted-soft leading-relaxed">
        Your address always stays private, unless you choose to share it with mutuals or confirmed buyers.
      </p>
      <div>
        <label className="block text-xs text-muted mb-1.5 font-semibold">Neighborhood</label>
        <LocationCombobox id="signup-neighborhood-zip" value={p.zip} onChange={p.onZip} />
      </div>
    </div>
  );
}
```

(Neighborhood text is set by the wizard from the chosen address/ZIP; the `LocationCombobox` confirms the ZIP and the Manhattan gate is enforced in the wizard. If you later expose a Mapbox `reverseGeocodeAddress` neighborhood, set it via `onNeighborhood` on select.)

- [ ] **Step 3: Write `SchoolStep`** (search → select chips, max 2, skippable)

```tsx
// frontend/src/pages/signup/steps/SchoolStep.tsx
import { useState } from "react";
import { Input } from "../../../components/ui/input";
import { useSchoolSearch, type School } from "../../../lib/useSchoolSearch";

export interface SchoolStepProps {
  token: string;
  selected: School[];
  onAdd: (s: School) => void;
  onRemove: (id: number) => void;
}

export function SchoolStep({ token, selected, onAdd, onRemove }: SchoolStepProps) {
  const [query, setQuery] = useState("");
  const results = useSchoolSearch(query, token).filter(
    (r) => !selected.some((s) => s.id === r.id),
  );
  const full = selected.length >= 2;
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">Add your school</h2>
      <p className="text-sm text-muted">We use this to connect you with other students or alumni from your university.</p>
      {!full && (
        <div className="relative">
          <Input placeholder="Search your school" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border border-border-strong bg-canvas shadow-overlay">
              {results.map((r) => (
                <button key={r.id} type="button"
                  onClick={() => { onAdd(r); setQuery(""); }}
                  className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {selected.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-2 text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full pl-3 pr-1.5 py-1">
            {s.name}
            <button type="button" onClick={() => onRemove(s.id)}
              className="size-[18px] rounded-full bg-surface-strong text-muted hover:text-ink" aria-label="Remove">×</button>
          </span>
        ))}
      </div>
      {full && <p className="text-[11px] text-muted-soft">Maximum of 2 schools. Remove one to add another.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write `CirclesStep`** (Yes/No per circle the user has + live `CirclePreview`)

```tsx
// frontend/src/pages/signup/steps/CirclesStep.tsx
import { CirclePreview } from "../CirclePreview";

export type Consent = { building: boolean | null; school: boolean | null; mutualFriends: boolean | null };

export interface CirclesStepProps {
  hasSchool: boolean;
  consent: Consent;
  onAnswer: (key: keyof Consent, value: boolean) => void;
}

const ASK: Record<keyof Consent, string> = {
  building: "Show to neighbors from your building",
  school: "Show to students from your school",
  mutualFriends: "Show to people we both know",
};

export function CirclesStep({ hasSchool, consent, onAnswer }: CirclesStepProps) {
  const keys = (["building", "school", "mutualFriends"] as (keyof Consent)[]).filter(
    (k) => k !== "school" || hasSchool,
  );
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-extrabold text-ink tracking-tight">Would you like mutuals to view your circles?</h2>
      <p className="text-sm text-muted">Sharing a circle reveals it only when others in the same circle are viewing your listings.</p>
      {keys.map((k) => (
        <div key={k} className="border border-border-strong rounded-sm p-4">
          <p className="text-sm font-semibold text-body mb-3">{ASK[k]}</p>
          <div className="flex gap-3">
            {[true, false].map((val) => (
              <button key={String(val)} type="button" onClick={() => onAnswer(k, val)}
                className={`flex-1 text-center rounded-sm border py-2.5 text-sm font-bold ${
                  consent[k] === val
                    ? "border-primary bg-primary-soft text-primary-text"
                    : "border-border-strong text-ink"
                }`}>
                {val ? "Yes" : "No"}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="text-xs font-semibold text-muted mb-2">How mutuals will see your listings:</p>
        <CirclePreview
          building={consent.building === true}
          school={consent.school === true}
          mutualFriends={consent.mutualFriends === true}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write `WelcomeStep`** (Start-selling primary CTA)

```tsx
// frontend/src/pages/signup/steps/WelcomeStep.tsx
import { Check } from "lucide-react";
import { Button } from "../../../components/ui/button";

export interface WelcomeStepProps {
  firstName: string;
  onStartSelling: () => void;
  onBrowse: () => void;
}

export function WelcomeStep({ firstName, onStartSelling, onBrowse }: WelcomeStepProps) {
  return (
    <div className="text-center flex flex-col items-center">
      <div className="size-14 rounded-full bg-primary text-on-primary flex items-center justify-center mb-4">
        <Check className="size-7" />
      </div>
      <h2 className="text-xl font-extrabold text-ink tracking-tight">You're in{firstName ? `, ${firstName}` : ""}</h2>
      <p className="text-sm text-muted mt-1 mb-5">Got something to sell? List your first item in under a minute.</p>
      <Button onClick={onStartSelling} className="w-full">Start selling</Button>
      <button onClick={onBrowse} className="text-sm font-semibold text-muted hover:text-ink mt-3">Browse for now</button>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/signup/steps/
git commit -m "feat(circles): registration step components (name, location, school, circles, welcome)"
```

---

## Task 5: Wizard container + register payload (frontend)

**Files:**
- Create: `frontend/src/pages/signup/SignUpWizard.tsx`
- Modify: `frontend/src/pages/SignUpPage.tsx` (becomes a thin wrapper)

- [ ] **Step 1: Write the wizard container**

```tsx
// frontend/src/pages/signup/SignUpWizard.tsx
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { AuthUser } from "../../contexts/AuthContext";
import { useNeighborhoods } from "../../lib/useNeighborhoods";
import { NYC_ZIP_SET } from "../../lib/nycZips";
import type { School } from "../../lib/useSchoolSearch";
import { NameStep } from "./steps/NameStep";
import { LocationStep } from "./steps/LocationStep";
import { SchoolStep } from "./steps/SchoolStep";
import { CirclesStep, type Consent } from "./steps/CirclesStep";
import { WelcomeStep } from "./steps/WelcomeStep";

export interface SignUpWizardProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;     // finalize auth/session
  onStartSelling: () => void;               // route into the sell wizard
  onBrowse: () => void;                      // route into the marketplace
  onCancel: () => void;
}

const STEPS = ["name", "location", "school", "circles"] as const;

export function SignUpWizard({ pendingToken, onComplete, onStartSelling, onBrowse, onCancel }: SignUpWizardProps) {
  const { list: neighborhoodsList } = useNeighborhoods();
  const neighborhoods = neighborhoodsList ?? [];

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [zip, setZip] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [schools, setSchools] = useState<School[]>([]);
  const [consent, setConsent] = useState<Consent>({ building: null, school: null, mutualFriends: null });

  const validNeighborhood = neighborhoods.some((n) => n.toLowerCase() === neighborhood.trim().toLowerCase());

  const stepValid = (): boolean => {
    switch (STEPS[step]) {
      case "name": return !!firstName.trim() && !!lastName.trim();
      case "location": return validNeighborhood && NYC_ZIP_SET.has(zip);
      case "school": return true; // optional
      case "circles": {
        const keys: (keyof Consent)[] = ["building", "mutualFriends", ...(schools.length ? (["school"] as (keyof Consent)[]) : [])];
        return keys.every((k) => consent[k] !== null);
      }
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pendingToken}` },
        body: JSON.stringify({
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          neighborhood: neighborhood.trim(),
          pickup_address: address.trim() || undefined,
          zip_code: zip,
          school_seed_ids: schools.map((s) => s.id),
          share_building: consent.building === true,
          share_school: consent.school === true,
          share_mutual_friends: consent.mutualFriends === true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(data.detail);
      }
      onComplete((await res.json()) as AuthUser);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (!stepValid()) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else submit();
  };

  return (
    <section className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 bg-canvas">
      <div className="w-full max-w-sm bg-canvas border border-hairline rounded-md p-8 shadow-card">
        {done ? (
          <WelcomeStep firstName={firstName.trim()} onStartSelling={onStartSelling} onBrowse={onBrowse} />
        ) : (
          <>
            <div className="flex gap-1.5 mb-6">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1 w-6 rounded-full ${i <= step ? "bg-primary" : "bg-hairline"}`} />
              ))}
            </div>

            {STEPS[step] === "name" && <NameStep firstName={firstName} lastName={lastName} onFirst={setFirstName} onLast={setLastName} />}
            {STEPS[step] === "location" && (
              <LocationStep
                address={address} zip={zip} neighborhood={neighborhood} neighborhoods={neighborhoods}
                onAddress={setAddress}
                onSelectAddress={(label, z) => { setAddress(label); setZip(z); }}
                onZip={setZip} onNeighborhood={setNeighborhood}
              />
            )}
            {STEPS[step] === "school" && (
              <SchoolStep token={pendingToken} selected={schools}
                onAdd={(s) => setSchools((prev) => (prev.length < 2 ? [...prev, s] : prev))}
                onRemove={(id) => setSchools((prev) => prev.filter((s) => s.id !== id))} />
            )}
            {STEPS[step] === "circles" && (
              <CirclesStep hasSchool={schools.length > 0} consent={consent}
                onAnswer={(k, v) => setConsent((prev) => ({ ...prev, [k]: v }))} />
            )}

            {error && <p className="text-sm text-error mt-3">{error}</p>}

            <Button onClick={next} disabled={!stepValid() || submitting} className="w-full mt-6 disabled:opacity-40">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : step === STEPS.length - 1 ? "Finish" : "Continue"}
            </Button>
            <div className="flex justify-between mt-3 text-sm">
              <button onClick={() => (step > 0 ? setStep(step - 1) : onCancel())} className="text-muted hover:text-ink">
                {step > 0 ? "Back" : "Cancel"}
              </button>
              {STEPS[step] === "school" && (
                <button onClick={() => setStep(step + 1)} className="text-muted hover:text-ink">Skip for now</button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Reduce `SignUpPage.tsx` to a wrapper**

The wizard needs `onStartSelling` / `onBrowse`. `SignUpPage` currently only gets `pendingToken`, `onComplete`, `onCancel`. Thread the two navigation callbacks from the parent (wherever `<SignUpPage>` is rendered — `App.tsx`) down. Minimal wrapper:

```tsx
// frontend/src/pages/SignUpPage.tsx
import type { AuthUser } from "../contexts/AuthContext";
import { SignUpWizard } from "./signup/SignUpWizard";

interface SignUpPageProps {
  pendingToken: string;
  onComplete: (user: AuthUser) => void;
  onCancel: () => void;
  onStartSelling: () => void;
  onBrowse: () => void;
}

export default function SignUpPage(props: SignUpPageProps) {
  return <SignUpWizard {...props} />;
}
```

In `App.tsx`, pass `onStartSelling={() => { setTradeMode("sell"); setPage("home"); }}` and `onBrowse={() => { setTradeMode("buy"); setPage("market"); }}` to `<SignUpPage>` (match the existing trade-mode/page setters used elsewhere in `App.tsx`).

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Visual check**

Run the app (`/run` or `npm run dev`), trigger the signup flow, and walk all four steps + welcome. Confirm: progress dots advance, Continue is gated per step, Skip appears only on School, the circles preview lights on Yes, and Start selling routes into the sell wizard. Compare against `.superpowers/brainstorm/.../registration-flow.html`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/signup/SignUpWizard.tsx frontend/src/pages/SignUpPage.tsx frontend/src/App.tsx
git commit -m "feat(circles): 4-step registration wizard + welcome/start-selling"
```

---

## Task 6: Full verification

- [ ] **Step 1: Backend tests**

Run: `cd backend && python -m pytest tests/test_circles_register.py tests/test_circles.py -v`
Expected: PASS (or clean SKIP without Supabase env).

- [ ] **Step 2: Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

---

## Self-Review (against the spec)

- **Spec §5a 4-step flow:** Name (Task 4), Location with address→ZIP + Manhattan gate (Task 4/5), School search+select max-2+skip (Tasks 2-5), Circles consent clicker conditional on owned circles (Tasks 4-5), Welcome→Start-selling (Tasks 4-5). ✔
- **Spec §3 consent:** forced choice — Continue gated until every owned circle is answered (`stepValid` for `circles`); default null (no pre-selection); persisted via the extended register endpoint (Task 1). ✔
- **Spec §2 building:** derived from address in `register()` via `set_user_building` (Task 1). School: `school_seed_ids` → `add_user_school` (cap 2) (Task 1). Mutual friends: `share_mutual_friends` user flag (Task 1). ✔
- **Address disclosure copy** and all step copy match the approved mockups. ✔
- **No frontend tests:** verification is `typecheck` + `build` + visual check (documented up front; no fabricated test runner). ✔
- **Type consistency:** `School`, `Consent`, `CirclePreviewProps`, the register payload keys (`school_seed_ids`, `share_building`, `share_school`, `share_mutual_friends`) match the backend `RegisterRequest` fields from Task 1 exactly. ✔
- **Deferred:** the `CirclePreview` here shows consent-on slots only; the *feed* lit/faded-with-tooltips byline and the My Account/profile surfaces are Phases 4-5. The component is intentionally shared so Phase 4 can extend it (add tooltips + counts) rather than duplicate. ✔
- **Risk noted:** neighborhood auto-derive is best-effort (ZIP-driven + combobox confirm); a true Mapbox reverse-geocode-to-neighborhood can be wired via `onNeighborhood` later without changing the wizard contract. ✔
