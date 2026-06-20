# Circles — Phase 3: Registration Wizard Implementation Plan (REVISED 2026-06-17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **This revision supersedes the original Phase 3 plan.** An earlier Phase 3 shipped a 4-step wizard with a per-circle Yes/No consent clicker (commits `75e03c5`, `22e1f2c`, `1ffa04b`, `bc7f62c`, `15bdc3e`, `eb0d79e`, `f76355b`). Extensive design iteration replaced that with a sell-wizard-styled flow and a **default-on / disclosed-inline** consent model. This plan **revises the existing code** to the final design. **Authoritative visual + behavior reference:** `docs/superpowers/specs/references/2026-06-17-registration-flow.reference.html` (a complete, interactive vanilla-JS mock — match its markup, copy, gating, reveals, and in-place interactions exactly).

**Goal:** Rebuild registration as a sell-wizard-styled wizard (Name → Location → School → Review → Welcome) with typed headlines, a back button, gated steps, progressive field reveals, full state persistence, pronouns, up-to-2 school pills, and a default-on consent model disclosed inline.

**Architecture:** Backend — extend `register` to capture `pronouns`, derive the building circle, accept up to 2 schools, and **default all circle consent to true** (no per-circle consent input); add `users.pronouns`; extend the Mapbox geocode to return city/state/neighborhood. Frontend — rewrite `SignUpWizard` + step components to the sell-wizard chrome (reusing the existing `TypedHeadline`), lifting all field state to the container so nothing resets across Back/Edit. Verification: backend pytest; frontend `npm run typecheck` + `npm run build` + visual check vs. the reference.

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, Supabase Postgres, pytest; React 18, Vite, TypeScript, Tailwind v4, lucide-react.

**Depends on:** Phase 1 (`services/circles.py`: `set_user_building`, `add_user_school`, `set_circle_consent`, `search_schools`, `list_user_schools`, `TooManySchools`). Phase 4 (`CircleByline`) is NOT required here.

---

## File Structure

- Create: `supabase/migrations/0014_user_pronouns.sql` — `users.pronouns`.
- Modify: `backend/models.py` — `User.pronouns`.
- Modify: `backend/routers/auth.py` — `RegisterRequest` (add `pronouns`, drop the three `share_*` fields), `register()` (set consent true by default).
- Modify: `frontend/src/lib/mapboxSearch.ts` — `AddressSuggestion` gains `city`, `state`, `neighborhood`; populate from the geocode feature context.
- Modify: `frontend/src/pages/signup/SignUpWizard.tsx` — full rewrite to the new chrome + state container.
- Modify: `frontend/src/pages/signup/steps/{NameStep,LocationStep,SchoolStep,WelcomeStep}.tsx`; create `ReviewStep.tsx`; delete `CirclesStep.tsx`.
- Keep: `frontend/src/components/TypedHeadline.tsx` (exists), `frontend/src/lib/useSchoolSearch.ts` (exists), `frontend/src/pages/signup/CirclePreview.tsx` (no longer used in registration — retained for Phase 5 My Account).
- Test: `backend/tests/test_circles_register.py` (update).

---

## Task 1: Migration + model — `users.pronouns`

**Files:** Create `supabase/migrations/0014_user_pronouns.sql`; Modify `backend/models.py`; Test `backend/tests/test_circles_register.py`

- [ ] **Step 1: Write the migration**

```sql
-- Optional self-reported pronouns captured at registration.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(40);
```

- [ ] **Step 2: Apply it** — paste into the Supabase SQL editor (idempotent), or `supabase db push` now that history is reconciled.

- [ ] **Step 3: Add the model column** — in `backend/models.py`, on `User` (after `share_mutual_friends`):

```python
    pronouns = Column(String(40), nullable=True)
```

- [ ] **Step 4: Write a failing test** (append to `backend/tests/test_circles_register.py`):

```python
def test_user_model_has_pronouns():
    from models import User
    assert hasattr(User, "pronouns")
```

- [ ] **Step 5: Run** `cd backend && python -m pytest tests/test_circles_register.py::test_user_model_has_pronouns -v` → PASS.

- [ ] **Step 6: Commit** `feat(circles): users.pronouns column + migration 0014`.

---

## Task 2: Revise `register` — pronouns + default-on consent

The earlier `register` accepted `school_seed_ids`, `share_building`, `share_school`, `share_mutual_friends`. The new model: **no per-circle consent input** — consent defaults to true; add `pronouns`.

**Files:** Modify `backend/routers/auth.py`; Test `backend/tests/test_circles_register.py`

- [ ] **Step 1: Replace the consent test** with one asserting default-on behavior:

```python
def test_register_defaults_consent_on_and_captures_pronouns(db_session, make_user, client, override_auth_user):
    user = make_user(display_name="Pre")
    seed = SchoolSeed(name="New York University", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)
    override_auth_user(user)
    resp = client.post("/api/auth/register", json={
        "display_name": "Maya Rodriguez", "neighborhood": "Chelsea",
        "pickup_address": "123 W 21st St", "zip_code": "10011",
        "pronouns": "she/her", "school_seed_ids": [seed.id],
    })
    assert resp.status_code == 200, resp.text
    db_session.expire_all()
    u = db_session.query(User).filter(User.id == user.id).first()
    assert u.pronouns == "she/her"
    assert u.share_mutual_friends is True                       # default-on
    b = db_session.query(Community).join(CommunityMember, CommunityMember.community_id==Community.id)\
        .filter(CommunityMember.user_id==user.id, Community.kind=="building").first()
    bm = db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id, CommunityMember.community_id==b.id).first()
    assert bm.share_with_mutuals is True                        # default-on
    schools = list_user_schools(db_session, user.id)
    sm = db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id, CommunityMember.community_id==schools[0].id).first()
    assert sm.share_with_mutuals is True                        # default-on
    db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id).delete()
    db_session.query(Community).filter(Community.id.in_([b.id, schools[0].id])).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id==seed.id).delete(); db_session.commit()
```

- [ ] **Step 2: Run it** → FAIL (RegisterRequest rejects `pronouns` / consent not defaulted).

- [ ] **Step 3: Update `RegisterRequest`** — remove `share_building`, `share_school`, `share_mutual_friends`; add `pronouns`:

```python
    pronouns: Optional[str] = Field(None, max_length=40)
    school_seed_ids: list[int] = []
```

- [ ] **Step 4: Update `register()`** — replace the consent-flag block with default-on logic:

```python
    existing.pronouns = req.pronouns
    existing.share_mutual_friends = True  # default-on (see spec section 3)
    if req.pickup_address:
        building = set_user_building(db, existing, req.pickup_address)
        if building is not None:
            set_circle_consent(db, existing.id, building.id, True)
    for seed_id in (req.school_seed_ids or [])[:2]:
        try:
            school = add_user_school(db, existing, seed_id)
        except (TooManySchools, ValueError):
            continue
        set_circle_consent(db, existing.id, school.id, True)
    db.commit()
```

- [ ] **Step 5: Run** the register tests → PASS, then `tests/test_circles_register.py tests/test_circles.py` → green.

- [ ] **Step 6: Commit** `feat(circles): register captures pronouns; consent defaults on`.

---

## Task 3: Extend the Mapbox geocode to return city/state/neighborhood

**Files:** Modify `frontend/src/lib/mapboxSearch.ts`

- [ ] **Step 1:** Add to the `AddressSuggestion` interface: `city?: string; state?: string; neighborhood?: string;` (it already carries `label`/`zip`).
- [ ] **Step 2:** In `searchAddresses` (and `reverseGeocodeAddress` if it builds the same shape) populate them from the Mapbox feature `context` array — `place` → `city`, `region`/`region`'s short code → `state`, `neighborhood` → `neighborhood` — following the existing `postcode` → `zip` extraction pattern.
- [ ] **Step 3:** `cd frontend && npm run typecheck` → clean.
- [ ] **Step 4: Commit** `feat(circles): address suggestions carry city/state/neighborhood`.

---

## Task 4: Rewrite the registration wizard (frontend)

Translate the reference mock (`docs/superpowers/specs/references/2026-06-17-registration-flow.reference.html`) into React. Match its markup, Electric-Violet styling, copy, gating, reveals, and in-place interactions exactly. No frontend test runner — verify with `npm run typecheck` + `npm run build` after each sub-step and a visual pass at the end.

**Files:** `frontend/src/pages/signup/SignUpWizard.tsx` (rewrite), `steps/NameStep.tsx`, `steps/LocationStep.tsx`, `steps/SchoolStep.tsx`, `steps/ReviewStep.tsx` (new), `steps/WelcomeStep.tsx` (keep), delete `steps/CirclesStep.tsx`.

- [ ] **Step 1: Wizard shell + chrome.** `SignUpWizard` owns ALL field state (lifted so nothing resets): `firstName, lastName, pronouns, address, city, state, neighborhood, zip, addrSelected, schools: School[], termsAccepted`. Steps `["name","location","school","review"]`; on success show `WelcomeStep`. Chrome: back button (ringed chevron, hidden on step 0), per-step icon chip (User/Building2/GraduationCap; none on review), `<TypedHeadline text={headline} />` (re-keyed by step so it re-types on navigation), centered `max-w-md`, **no progress bar**, no modal card. Headlines: `What's your name?` / `Where are you based?` / `What school are you from?` / `Does everything look good?`.

- [ ] **Step 2: Per-step gating.** Continue is disabled (faded) with a hint when incomplete:
  - name → both first+last non-empty ("Enter your first and last name to continue")
  - location → `addrSelected` ("Select your address to continue")
  - school → always enabled (optional)
  - review → `termsAccepted`; button label "Create profile" ("Agree to the Terms & Conditions to continue")

- [ ] **Step 3: NameStep.** Labeled First/Last (controlled → wizard state). Optional **Pronouns** `<select>` (she/her, he/him, they/them, she/they, he/they, Prefer not to say) that **renders only when both names are non-empty**. Icon chip = `User`.

- [ ] **Step 4: LocationStep.** Labeled Street-address `AddressAutocompleteInput`. On `onSelect(s)` store `address=s.label, zip=s.zip, city=s.city, state=s.state, neighborhood=s.neighborhood, addrSelected=true`. Reveal read-only City/State/Neighborhood/ZIP **only after a selection** (carried geocode values). The building **disclosure shows at all times** (spec §3 copy). Icon chip = `Building2`.

- [ ] **Step 5: SchoolStep.** Labeled search via `useSchoolSearch`; selecting appends to `schools` (max 2; dedupe by id). Selected schools render as **pills below the search bar**; at 2 the search input is hidden (no max-note). Each pill has a remove ×. School disclosure shows. Icon chip = `GraduationCap`.

- [ ] **Step 6: ReviewStep.** Headline "Does everything look good?". Summary card: Name row (`First Last` + pronouns appended in muted weight when set and not "Prefer not to say"), Location row (`{neighborhood} · {address}`), Schools row (joined names or "None added") — each with an **Edit** pencil button calling `onEdit(stepIndex)`. A single **Terms & Conditions** checkbox (links to T&C + Privacy) gating "Create profile". Checkbox toggles **in place** (local state) — no whole-step re-render. No share-circle checkbox, no preview byline.

- [ ] **Step 7: Submit + Welcome.** "Create profile" (terms accepted) → POST `/api/auth/register` with `{ display_name: `${firstName} ${lastName}`, neighborhood, pickup_address: address, zip_code: zip, pronouns: pronouns||undefined, school_seed_ids: schools.map(s=>s.id) }` (no consent fields). On success call `onComplete(user)` to finalize the session **without navigating**, then show `WelcomeStep`; "Start selling" → `onStartSelling` (`setPage("newlisting")`), "Browse for now" → `onBrowse` (`setPage("market")`). Keep the App.tsx wiring from `eb0d79e` (onComplete does not navigate).

- [ ] **Step 8: Persistence.** State lives in the container; steps are controlled, so Back/Edit restore every field. Verify navigating backward/forward and via Edit — nothing resets.

- [ ] **Step 9: Delete `CirclesStep.tsx`** and its imports. Confirm `CirclePreview.tsx` has no remaining importer in the signup flow (it stays for Phase 5).

- [ ] **Step 10: Typecheck + build** → both pass.

- [ ] **Step 11: Visual check** vs. the reference: Name (pronouns reveals, Continue gates) → Location (address reveal, disclosure always shown, gates) → School (pills below search, cap at 2) → Review (Edit jumps, pronouns shown, Terms gates, in-place toggle) → Welcome (Start selling). Back/Edit preserve state.

- [ ] **Step 12: Commit** `feat(circles): rebuild registration wizard in the sell-wizard chrome (final design)`.

---

## Task 5: Full verification

- [ ] **Backend:** `cd backend && set -a && source .env && set +a && python -m pytest tests/test_circles_register.py tests/test_circles.py -v` → green (phone-collision flake excluded).
- [ ] **Frontend:** `cd frontend && npm run typecheck && npm run build` → both pass.

---

## Self-Review (against the spec)

- **Spec §5a chrome:** typed headline, back button, no progress bar, icon chips, `max-w-md`, persistence (Task 4 Steps 1, 8). ✔
- **Spec §5a steps:** Name (gated + pronoun reveal), Location (address reveal + always-on disclosure + gated), School (pills below search, up to 2), Review (Edit + Terms, in-place toggle) (Task 4 Steps 3–6). ✔
- **Spec §3 consent default-on:** register sets `share_with_mutuals=true` + `share_mutual_friends=true`; no client consent input (Task 2). ✔
- **Pronouns:** column (Task 1), captured in register (Task 2), shown on review (Task 4 Step 6). ✔
- **Mapbox city/state/neighborhood:** Task 3 feeds the Location reveal (Task 4 Step 4). ✔
- **Reference fidelity:** the committed reference HTML is the authoritative markup/copy/behavior; Task 4 translates it. ✔
- **Cleanup:** old per-circle `CirclesStep` deleted; `CirclePreview` retained for Phase 5 only (Task 4 Step 9). ✔
- **No frontend tests:** verification is typecheck + build + visual, stated up front. ✔
