# Neighborhood Default Community — PR 2 (Frontend + Alignment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle PR 2's frontend work onto PR #15's branch alongside a backend reconciliation migration so the FE/BE neighborhood lists become a single source of truth — eliminating the drift discovered between `backend/constants/neighborhoods.py` (30 entries) and `frontend/src/lib/neighborhoods.ts` (43 entries). After this PR, FE has no local list — it fetches from `GET /api/communities/neighborhoods` at mount, with the BE acting as the only source of truth.

**Architecture:** One reconciliation migration (`0008`) expands the BE list to match the existing FE's 43 entries (renames 5 mismatched ones, adds 14 FE-only ones, drops "Union Square" which is BE-only). FE deletes its local list entirely. New `useNeighborhoods()` hook fetches the canonical list once with module-level caching. SignUpPage + MyAccountPage's profile-edit modal consume the hook. App.tsx + AuthContext drop `"neighborhood"` pseudo-id special-cases (the user's real neighborhood community now appears naturally in `mine-with-neighborhood`). Marketplace filter sends real community id. Sell wizard pre-selects the neighborhood community.

**Tech Stack:** React 18, TypeScript, Tailwind v4, Vite. Backend changes: one SQL migration. No new FE dependencies.

**Spec:** `docs/superpowers/specs/2026-05-24-neighborhood-default-community-design.md` (committed `32d1979` on this branch).

**Branch state at plan start:** `chore/neighborhood-default-community` is 9 commits ahead of dev (PR #15 already open). After this plan: branch grows to ~15-17 commits; PR #15 expands in scope from "backend foundation" to "backend foundation + alignment + frontend".

---

## Drift discovery

Before this plan, `backend/constants/neighborhoods.py` had 30 entries; `frontend/src/lib/neighborhoods.ts` had 43. The lists diverge on naming (5 entries) and coverage (FE has 14 BE-only adds; BE has 1 FE-only entry "Union Square"). User chose: take the FE's list as canonical. Migration 0008 aligns BE to match.

| FE form (canonical) | BE current (to update) |
|---|---|
| Clinton (Hell's Kitchen) | Hell's Kitchen |
| Flatiron District | Flatiron |
| Gramercy Park | Gramercy |
| Nolita | NoLita |
| Theater District | Times Square |

**FE-only — INSERT 14 new rows:** Battery Park City, Carnegie Hill, Civic Center, Hamilton Heights, Hudson Heights, Lenox Hill, Lincoln Square, Marble Hill, NoMad, Stuyvesant Town, Sutton Place, Tudor City, Turtle Bay, Yorkville.

**BE-only — DELETE:** Union Square.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `supabase/migrations/0008_align_neighborhood_communities.sql` | Create | Reconcile BE Community rows to match FE's 43. UPDATE 5 renamed, DELETE Union Square (no real members), INSERT 14 missing. |
| `backend/constants/neighborhoods.py` | Modify | Replace the 30-entry list with the 43-entry canonical list matching the FE. |
| `frontend/src/lib/neighborhoods.ts` | Delete | No more FE-local list. Source of truth lives in BE. |
| `frontend/src/lib/useNeighborhoods.ts` | Create | React hook that fetches `/api/communities/neighborhoods` once, module-level cache, returns `{ list, isLoading, error }`. |
| `frontend/src/pages/SignUpPage.tsx` | Modify | Replace local-list usage with `useNeighborhoods()`. Add loading + error states. |
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify (~lines 44, 1406-1411) | Same — replace local-list usage with `useNeighborhoods()` for the profile-edit modal. |
| `frontend/src/contexts/AuthContext.tsx` | Modify (~line 134) | No code change needed for the picker work; flagged here in case the `needsOnboarding` gate semantics shift. Actually unchanged in this PR. |
| `frontend/src/App.tsx` | Modify (~lines 130-131, 624, 673, 678) | Drop `"neighborhood"` pseudo-id branches. `publicCommunities` / `privateCommunities` state narrows `id` to `number`. Marketplace filter sends real community id. Calls `/api/communities/mine` (NOT `/mine-with-neighborhood`, which still exists in this PR — that deletion is PR 3). |

Wait — `/api/communities/mine-with-neighborhood` is still alive in PR 1. It now returns the user's neighborhood community as a real Community row (no virtual id) because the user is auto-joined via Section 2 of PR 1. App.tsx can keep calling `/mine-with-neighborhood` for now; the response shape no longer has the pseudo-id. Or simplify to `/api/communities/mine`. **For this PR: keep calling `/mine-with-neighborhood` to minimize change surface — its response just no longer contains the virtual entry.** PR 3 deletes the endpoint entirely.

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/features/sell-wizard/...` | Modify | Pre-check the user's neighborhood community in the community selector. Mark non-removable. |
| `frontend/src/pages/MyAccount/modals/EditProfileModal.tsx` (or wherever profile-neighborhood edit lives) | Modify | Add confirmation modal "You'll leave [old] and join [new]" before submitting the change. |

---

## Commit Strategy

8 commits land on `chore/neighborhood-default-community`:

| # | Subject |
|---|---|
| 1 | `feat(backend): align neighborhood communities to FE canonical list` |
| 2 | `chore(frontend): drop local neighborhoods constant + add useNeighborhoods hook` |
| 3 | `feat(frontend): SignUpPage uses /api/communities/neighborhoods` |
| 4 | `feat(frontend): MyAccountPage profile-edit uses /api/communities/neighborhoods` |
| 5 | `chore(frontend): drop "neighborhood" pseudo-id from App.tsx + state types` |
| 6 | `feat(frontend): marketplace filter sends real community id` |
| 7 | `feat(frontend): sell wizard pre-selects neighborhood community` |
| 8 | `feat(frontend): profile change-neighborhood confirmation modal` |

---

## Task 1: BE alignment migration

**Files:**
- Create: `supabase/migrations/0008_align_neighborhood_communities.sql`
- Modify: `backend/constants/neighborhoods.py`

### Steps

- [ ] **Step 1: Replace `backend/constants/neighborhoods.py`**

```python
"""Canonical Manhattan neighborhood list.

Source of truth for two consumers:
- supabase/migrations/0007_neighborhood_communities.sql + 0008_align_*.sql
  (pre-seed Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods endpoint)

The FE consumes the list ONLY via the endpoint — there is no FE-local
list anymore (frontend/src/lib/neighborhoods.ts deleted in PR 2).

When extending to additional cities, append to the list and add a
follow-up migration that INSERTs the new rows.
"""

MANHATTAN_NEIGHBORHOODS: list[str] = [
    "Battery Park City",
    "Carnegie Hill",
    "Chelsea",
    "Chinatown",
    "Civic Center",
    "Clinton (Hell's Kitchen)",
    "East Harlem",
    "East Village",
    "Financial District",
    "Flatiron District",
    "Gramercy Park",
    "Greenwich Village",
    "Hamilton Heights",
    "Harlem",
    "Hudson Heights",
    "Inwood",
    "Kips Bay",
    "Lenox Hill",
    "Lincoln Square",
    "Little Italy",
    "Lower East Side",
    "Marble Hill",
    "Midtown East",
    "Midtown West",
    "Morningside Heights",
    "Murray Hill",
    "NoHo",
    "NoMad",
    "Nolita",
    "Roosevelt Island",
    "SoHo",
    "Stuyvesant Town",
    "Sutton Place",
    "Theater District",
    "Tribeca",
    "Tudor City",
    "Turtle Bay",
    "Two Bridges",
    "Upper East Side",
    "Upper West Side",
    "Washington Heights",
    "West Village",
    "Yorkville",
]
```

- [ ] **Step 2: Verify count**

Run: `cd backend && python3 -c "from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS; print(len(MANHATTAN_NEIGHBORHOODS))"`

Expected: `43`

- [ ] **Step 3: Write `supabase/migrations/0008_align_neighborhood_communities.sql`**

```sql
-- 0008_align_neighborhood_communities.sql
-- Align BE neighborhood communities to the FE-canonical list.
-- - UPDATE 5 renamed communities (Hell's Kitchen → Clinton (Hell's Kitchen), etc.)
-- - DELETE 1 BE-only community (Union Square) — no real members exist
-- - INSERT 14 missing communities
-- Idempotent: re-running this migration after it lands is a no-op.

BEGIN;

-- Step 1: UPDATE the 5 renamed communities (keep their id + member rows).
UPDATE public.communities
SET name = 'Clinton (Hell''s Kitchen)', neighborhood = 'Clinton (Hell''s Kitchen)', invite_code = 'NBHD-CLINTON'
WHERE invite_code = 'NBHD-HELLS-KITCHEN';

UPDATE public.communities
SET name = 'Flatiron District', neighborhood = 'Flatiron District', invite_code = 'NBHD-FLATIRON-DISTRICT'
WHERE invite_code = 'NBHD-FLATIRON';

UPDATE public.communities
SET name = 'Gramercy Park', neighborhood = 'Gramercy Park', invite_code = 'NBHD-GRAMERCY-PARK'
WHERE invite_code = 'NBHD-GRAMERCY';

UPDATE public.communities
SET name = 'Nolita', neighborhood = 'Nolita', invite_code = 'NBHD-NOLITA-V2'
WHERE invite_code = 'NBHD-NOLITA';

UPDATE public.communities
SET name = 'Theater District', neighborhood = 'Theater District', invite_code = 'NBHD-THEATER-DISTRICT'
WHERE invite_code = 'NBHD-TIMES-SQUARE';

-- Step 2: DELETE the BE-only Union Square community (members table cascades via FK? Verify.
-- If no cascade, delete community_members rows first.)
DELETE FROM public.community_members
WHERE community_id IN (
    SELECT id FROM public.communities WHERE invite_code = 'NBHD-UNION-SQUARE'
);
DELETE FROM public.communities WHERE invite_code = 'NBHD-UNION-SQUARE';

-- Step 3: INSERT the 14 missing FE-canonical communities.
INSERT INTO public.communities (name, description, neighborhood, pickup_address, zip_code, image, is_public, invite_code, created_by, created_at)
VALUES
  ('Battery Park City',  NULL, 'Battery Park City',  NULL, NULL, NULL, TRUE, 'NBHD-BATTERY-PARK',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Carnegie Hill',      NULL, 'Carnegie Hill',      NULL, NULL, NULL, TRUE, 'NBHD-CARNEGIE-HILL',    '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Civic Center',       NULL, 'Civic Center',       NULL, NULL, NULL, TRUE, 'NBHD-CIVIC-CENTER',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hamilton Heights',   NULL, 'Hamilton Heights',   NULL, NULL, NULL, TRUE, 'NBHD-HAMILTON-HTS',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Hudson Heights',     NULL, 'Hudson Heights',     NULL, NULL, NULL, TRUE, 'NBHD-HUDSON-HTS',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lenox Hill',         NULL, 'Lenox Hill',         NULL, NULL, NULL, TRUE, 'NBHD-LENOX-HILL',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Lincoln Square',     NULL, 'Lincoln Square',     NULL, NULL, NULL, TRUE, 'NBHD-LINCOLN-SQUARE',   '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Marble Hill',        NULL, 'Marble Hill',        NULL, NULL, NULL, TRUE, 'NBHD-MARBLE-HILL',      '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('NoMad',              NULL, 'NoMad',              NULL, NULL, NULL, TRUE, 'NBHD-NOMAD',            '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Stuyvesant Town',    NULL, 'Stuyvesant Town',    NULL, NULL, NULL, TRUE, 'NBHD-STUYVESANT-TOWN',  '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Sutton Place',       NULL, 'Sutton Place',       NULL, NULL, NULL, TRUE, 'NBHD-SUTTON-PLACE',     '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Tudor City',         NULL, 'Tudor City',         NULL, NULL, NULL, TRUE, 'NBHD-TUDOR-CITY',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Turtle Bay',         NULL, 'Turtle Bay',         NULL, NULL, NULL, TRUE, 'NBHD-TURTLE-BAY',       '00000000-0000-0000-0000-000000000001'::uuid, NOW()),
  ('Yorkville',          NULL, 'Yorkville',          NULL, NULL, NULL, TRUE, 'NBHD-YORKVILLE',        '00000000-0000-0000-0000-000000000001'::uuid, NOW())
ON CONFLICT (invite_code) DO NOTHING;

-- Step 4: Auto-join system user to the 14 new communities (mirror 0007's pattern).
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

- [ ] **Step 4: Apply the migration**

Same pattern as PR 1's migrations — apply via `psql "$DATABASE_URL" -f supabase/migrations/0008_align_neighborhood_communities.sql` or via the Supabase dashboard SQL editor if `psql` permissions are insufficient.

- [ ] **Step 5: Verify the alignment**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM communities WHERE created_by = '00000000-0000-0000-0000-000000000001'::uuid;"
```

Expected: `43` (was 30, added 14, removed 1 Union Square = 43).

```bash
psql "$DATABASE_URL" -c "SELECT name FROM communities WHERE created_by = '00000000-0000-0000-0000-000000000001'::uuid ORDER BY name LIMIT 10;"
```

Expected: starts with `Battery Park City`, `Carnegie Hill`, `Chelsea`, `Chinatown`, `Civic Center`, `Clinton (Hell's Kitchen)`, `East Harlem`, `East Village`, `Financial District`, `Flatiron District`.

- [ ] **Step 6: Update the seed-vs-constants test in `backend/tests/test_neighborhood_community.py`**

The bonus test from PR 1 (`test_seed_migration_covers_full_canonical_list`) compares the BE-seeded communities to `MANHATTAN_NEIGHBORHOODS`. It should still pass against the expanded 43-entry list. Run:

```bash
cd backend && pytest tests/test_neighborhood_community.py::test_seed_migration_covers_full_canonical_list -v
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_align_neighborhood_communities.sql backend/constants/neighborhoods.py
git commit -m "$(cat <<'EOF'
feat(backend): align neighborhood communities to FE canonical list

Bridges the drift between backend/constants/neighborhoods.py (30
entries shipped in 0007) and frontend/src/lib/neighborhoods.ts (43
entries — what users have been picking through the existing FE).
User decision: take the FE list as canonical.

Migration 0008:
- UPDATE 5 communities renamed to match FE form (Hell's Kitchen ->
  Clinton (Hell's Kitchen), Flatiron -> Flatiron District, Gramercy
  -> Gramercy Park, NoLita -> Nolita, Times Square -> Theater
  District). Updates name + neighborhood + invite_code in place,
  preserving ids and existing CommunityMember rows.
- DELETE Union Square (BE-only, no real members existed).
- INSERT 14 missing FE-only neighborhoods.
- Auto-join system user as owner of each new community.

backend/constants/neighborhoods.py now mirrors the FE list verbatim
(43 entries). Will become single source of truth once the FE list
is deleted in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Drop FE local list + add `useNeighborhoods()` hook

**Files:**
- Delete: `frontend/src/lib/neighborhoods.ts`
- Create: `frontend/src/lib/useNeighborhoods.ts`

### Steps

- [ ] **Step 1: Create the hook**

```tsx
// frontend/src/lib/useNeighborhoods.ts
//
// Fetch the canonical Manhattan neighborhood list from
// /api/communities/neighborhoods once per app session, cached
// module-level so subsequent mounts get the list synchronously.
//
// There is no FE-local fallback. If the API call fails, the consumer
// should render an error state and prompt the user to retry — this
// is intentional, so the FE can never drift from the BE list.
import { useState, useEffect } from "react";

let cachedList: readonly string[] | null = null;
let cachedListPromise: Promise<readonly string[]> | null = null;

async function fetchNeighborhoods(): Promise<readonly string[]> {
  if (cachedList) return cachedList;
  if (cachedListPromise) return cachedListPromise;

  cachedListPromise = fetch("/api/communities/neighborhoods")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch neighborhoods (${res.status})`);
      return res.json();
    })
    .then((data: string[]) => {
      cachedList = Object.freeze([...data]);
      return cachedList;
    })
    .catch((err) => {
      cachedListPromise = null;  // allow retry
      throw err;
    });

  return cachedListPromise;
}

export interface UseNeighborhoodsResult {
  list: readonly string[] | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useNeighborhoods(): UseNeighborhoodsResult {
  const [list, setList] = useState<readonly string[] | null>(cachedList);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedList);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (cachedList && retryToken === 0) {
      // Already have cached data and not retrying
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchNeighborhoods()
      .then((data) => {
        if (!cancelled) {
          setList(data);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  return {
    list,
    isLoading,
    error,
    retry: () => setRetryToken((n) => n + 1),
  };
}
```

- [ ] **Step 2: Delete `frontend/src/lib/neighborhoods.ts`**

```bash
git rm frontend/src/lib/neighborhoods.ts
```

- [ ] **Step 3: Run typecheck to surface unresolved imports**

Run: `cd frontend && npm run typecheck`

Expected: 2 errors — one in `SignUpPage.tsx` line 6, one in `MyAccountPage.tsx` line 44 (both reference the deleted module).

- [ ] **Step 4: Commit (with intentionally-broken state — fixed in Tasks 3 + 4)**

Skip this commit and bundle the deletion with Tasks 3 and 4. The deletion alone leaves the typecheck red.

Adjust: don't delete the file yet. Tasks 3 and 4 will delete it as part of their changes. Skip Step 2 and Step 4 here.

- [ ] **Step 5: Commit the hook only**

```bash
git add frontend/src/lib/useNeighborhoods.ts
git commit -m "$(cat <<'EOF'
chore(frontend): add useNeighborhoods hook for canonical list

frontend/src/lib/useNeighborhoods.ts fetches
/api/communities/neighborhoods once per app session with a
module-level cache. Consumers get { list, isLoading, error, retry }.

No fallback list — if the API call fails, the consumer renders an
error state. This is intentional: the FE has no local list anymore,
preventing drift from the BE source of truth.

The existing FE list at frontend/src/lib/neighborhoods.ts stays
in place for this commit; deletion happens alongside Tasks 3 and 4
that consume the new hook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: SignUpPage uses the new hook

**Files:**
- Modify: `frontend/src/pages/SignUpPage.tsx`

### Steps

- [ ] **Step 1: Update SignUpPage to consume `useNeighborhoods`**

Replace the existing imports:

```tsx
import { MANHATTAN_NEIGHBORHOODS } from "../lib/neighborhoods";
```

with:

```tsx
import { useNeighborhoods } from "../lib/useNeighborhoods";
```

Inside the component (above the existing `useState` calls):

```tsx
const { list: neighborhoodsList, isLoading: isLoadingNeighborhoods, error: neighborhoodsError, retry: retryNeighborhoods } = useNeighborhoods();
const neighborhoods = neighborhoodsList ?? [];
```

Replace the `MANHATTAN_NEIGHBORHOODS` references (lines 27, 32, 35) with `neighborhoods`:

```tsx
const isValidNeighborhood = neighborhoods.some(
  (n) => n.toLowerCase() === neighborhood.trim().toLowerCase()
);

const filtered = neighborhood.trim()
  ? neighborhoods.filter((n) =>
      n.toLowerCase().includes(neighborhood.trim().toLowerCase())
    )
  : neighborhoods;
```

- [ ] **Step 2: Add loading + error states to the signup form**

In the JSX, wrap the neighborhood `<Input>` and its suggestion-dropdown rendering with a conditional:

```tsx
{isLoadingNeighborhoods ? (
  <div className="text-sm text-muted py-3 flex items-center gap-2">
    <Loader2 className="size-4 animate-spin" />
    Loading neighborhoods…
  </div>
) : neighborhoodsError ? (
  <div className="text-sm text-error py-3">
    Couldn't load neighborhoods: {neighborhoodsError}.{" "}
    <button
      type="button"
      onClick={retryNeighborhoods}
      className="underline text-primary hover:text-primary-hover"
    >
      Retry
    </button>
  </div>
) : (
  /* existing neighborhood input + suggestions JSX */
)}
```

The submit button (`handleRegister`) also needs to be disabled while neighborhoods are loading — extend the existing `disabled` prop with `|| isLoadingNeighborhoods`.

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS for `SignUpPage.tsx`. May still fail in `MyAccountPage.tsx` (line 44) — fix in Task 4. Or if the FE list isn't deleted yet, both pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SignUpPage.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): SignUpPage uses /api/communities/neighborhoods

Replaces the local MANHATTAN_NEIGHBORHOODS constant with the new
useNeighborhoods() hook. Adds loading + error states to the
neighborhood input; submit button disabled while loading. Error
state offers a Retry button.

After this commit + Task 4, the frontend/src/lib/neighborhoods.ts
file becomes unused and can be deleted (Task 4 final step).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: MyAccountPage profile-edit uses the new hook + delete the FE-local list

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` (~lines 44, 1406-1411)
- Delete: `frontend/src/lib/neighborhoods.ts`

### Steps

- [ ] **Step 1: Update the import in MyAccountPage**

Replace line 44:

```tsx
import { MANHATTAN_NEIGHBORHOODS } from "../../lib/neighborhoods";
```

with:

```tsx
import { useNeighborhoods } from "../../lib/useNeighborhoods";
```

- [ ] **Step 2: Use the hook in the component**

Near the other `useState`/`useEffect` calls inside `MyAccountPage`, add:

```tsx
const { list: neighborhoodsList, isLoading: isLoadingNeighborhoodsList, error: neighborhoodsListError } = useNeighborhoods();
const neighborhoods = neighborhoodsList ?? [];
```

Replace the `MANHATTAN_NEIGHBORHOODS` references at lines 1406 and 1410-1411 with `neighborhoods`. Match exactly the SignUpPage pattern.

- [ ] **Step 3: Add loading + error states to the profile-edit neighborhood input**

The profile-edit modal sits around line 1400+. Find the neighborhood input section (the `editNeighborhood` state). Add the same loading/error wrapper as Task 3 Step 2.

If the neighborhood list fails to load in the profile edit context, the user can't change their neighborhood, but they can dismiss the edit modal — so the failure is non-blocking globally. Keep the form interactive for OTHER fields (display name, pickup address, etc.) even when the neighborhood list is unavailable.

Concretely:

```tsx
{/* Inside the edit-neighborhood section */}
{isLoadingNeighborhoodsList ? (
  <div className="text-sm text-muted py-2 flex items-center gap-2">
    <Loader2 className="size-4 animate-spin" />
    Loading neighborhoods…
  </div>
) : neighborhoodsListError ? (
  <div className="text-sm text-error py-2">
    Couldn't load neighborhoods. Other fields still editable.
  </div>
) : (
  /* existing neighborhood input + suggestions JSX */
)}
```

- [ ] **Step 4: Delete the FE-local list**

```bash
git rm frontend/src/lib/neighborhoods.ts
```

- [ ] **Step 5: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. No remaining imports of the deleted module.

Run: `grep -rn "MANHATTAN_NEIGHBORHOODS\|lib/neighborhoods" frontend/src --include="*.ts" --include="*.tsx"`

Expected: zero matches.

- [ ] **Step 6: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx frontend/src/lib/neighborhoods.ts
git commit -m "$(cat <<'EOF'
feat(frontend): MyAccountPage profile-edit uses /api/communities/neighborhoods

Same pattern as SignUpPage — useNeighborhoods() hook replaces the
local MANHATTAN_NEIGHBORHOODS constant. Loading + error states added
to the neighborhood input in the profile-edit modal. Other fields
in the modal remain editable when the neighborhood list fails to
load (non-blocking failure).

Final consumer migrated. The local frontend/src/lib/neighborhoods.ts
constant is now deleted. Single source of truth: /api/communities/neighborhoods.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Drop `"neighborhood"` pseudo-id from App.tsx + state types

**Files:**
- Modify: `frontend/src/App.tsx` (~lines 130-131, 624 area)

### Steps

- [ ] **Step 1: Narrow the state types**

Find lines 130-131:

```tsx
const [publicCommunities, setPublicCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
const [privateCommunities, setPrivateCommunities] = useState<{ id: string | number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
```

Replace `string | number` with `number`:

```tsx
const [publicCommunities, setPublicCommunities] = useState<{ id: number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
const [privateCommunities, setPrivateCommunities] = useState<{ id: number; name: string; neighborhood?: string; is_public?: boolean }[]>([]);
```

After PR 1's changes, the backend's `mine-with-neighborhood` endpoint returns ONLY real Community rows (`id: number`); no virtual entries. Narrowing the type catches any lingering pseudo-id consumer at typecheck time.

- [ ] **Step 2: Run typecheck to surface usages**

Run: `cd frontend && npm run typecheck`

Expected: errors at App.tsx lines 673 and 678 (the `"neighborhood"` pseudo-id usage). Possibly more.

- [ ] **Step 3: Remove the pseudo-id branches**

Find line 673:

```tsx
if (selectedMarketCommunities.includes("neighborhood") && user?.neighborhood) {
  params.set("neighborhood", user.neighborhood);
}
```

The `selectedMarketCommunities` array now contains only numbers. The `.includes("neighborhood")` check is dead. Remove the block entirely (it's wrapped in some larger filter-building logic — preserve the rest of that logic).

Find line 678:

```tsx
if (user?.neighborhood) params.set("neighborhood", user.neighborhood);
```

This is the OTHER place that sends a `neighborhood` query param. After PR 1, the BE marketplace filter no longer special-cases `"neighborhood"` — but the BE still handles the `neighborhood` query param for the existing FE-driven filter logic. **Keep this line for now;** PR 3 removes the BE-side handling.

Actually, looking at it more carefully — line 678 is independent of the pseudo-id and serves a different purpose (the marketplace's `community=neighborhood` filter). Since the FE no longer SETS `community=neighborhood`, the `params.set("neighborhood", ...)` line is dead. Remove it.

But CAREFUL: read the surrounding lines to confirm what `params` is being built for. The marketplace API may accept a `neighborhood=Chinatown` param independently of `community=...`. If so, the param has independent meaning — leave it. The implementer needs to trace this carefully.

For safety: read App.tsx lines 670-685 in full, understand the param-building logic, and remove ONLY the dead branch (line 673's `.includes("neighborhood")` check). Leave line 678 if it has independent value, remove if confirmed dead.

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 5: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
chore(frontend): drop "neighborhood" pseudo-id from App.tsx state types

Narrows publicCommunities + privateCommunities state shape from
`id: string | number` to `id: number`. Removes the dead
selectedMarketCommunities.includes("neighborhood") branch in the
marketplace-filter URL builder. After PR 1, the user's neighborhood
community comes back from the API as a real numeric id — there's
no pseudo-id anymore.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Marketplace filter sends real community id

**Files:**
- Modify: `frontend/src/App.tsx` — wherever the community filter chip / sidebar lives

### Steps

- [ ] **Step 1: Locate the marketplace community filter UI**

The marketplace has a community filter chip / sidebar that lets users filter listings by community. Grep for `selectedMarketCommunities` to find the filter state + the chip rendering:

```bash
grep -n "selectedMarketCommunities\|setSelectedMarketCommunities" frontend/src/App.tsx | head -20
```

Inspect the chip UI. The user's neighborhood community should appear as a chip option. Today it likely renders with `id: "neighborhood"` (pseudo-id) because PR 1's `mine-with-neighborhood` previously returned that virtual entry.

After PR 1, `mine-with-neighborhood` returns the real Community (numeric id). The chip rendering should still work since the chip UI presumably loops over the community list and renders each by id+name.

- [ ] **Step 2: Verify the filter sends the real id**

Read the filter-build logic. Confirm:
- When the user selects their neighborhood community chip, the chip's value is the real numeric id.
- The marketplace API call sends `community=42` (numeric), not `community=neighborhood`.

If the URL-build logic still includes any `"neighborhood"` string special-case (post Task 5 cleanup), remove it.

This task is mostly verification work plus any small remaining cleanup.

- [ ] **Step 3: Run typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 4: Commit (only if changes were made; otherwise skip)**

If Task 5 already removed all the pseudo-id branches and the filter UI naturally works with the new real-id state, this task is a no-op and the commit gets skipped. The branch state at this point already correctly sends real community ids to the marketplace API.

If changes are needed (e.g., the chip UI had its own conditional that's now dead), commit:

```bash
git add frontend/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): marketplace filter sends real community id

[describe specific changes made]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Sell wizard pre-selects neighborhood community

**Files:**
- Modify: `frontend/src/features/sell-wizard/` — community selector component

### Steps

- [ ] **Step 1: Locate the community selector in the sell wizard**

```bash
grep -rn "publicCommunities\|community.*selector\|communities.*map" frontend/src/features/sell-wizard/ --include="*.tsx" | head -10
```

Identify the component that renders the list of communities the user can attach a listing to.

- [ ] **Step 2: Pre-select the neighborhood community**

The user's neighborhood community appears in `publicCommunities` (from `mine-with-neighborhood`). The component already iterates this list. Make the user's neighborhood community pre-checked by default, AND non-removable (disabled checkbox that's always-on).

Identification: the neighborhood community is the one whose `neighborhood` field matches `user.neighborhood`. Or — if the API returns a discriminator field — check that. Otherwise, lookup by `user.neighborhood`.

Concrete code change:

```tsx
const userNeighborhoodCommunityId = publicCommunities.find(
  (c) => c.neighborhood === user?.neighborhood
)?.id;

// In the chip-render loop:
{publicCommunities.map((c) => {
  const isNeighborhood = c.id === userNeighborhoodCommunityId;
  return (
    <label key={c.id} className="...">
      <input
        type="checkbox"
        checked={isNeighborhood || selectedCommunityIds.includes(c.id)}
        disabled={isNeighborhood}
        onChange={() => toggleCommunity(c.id)}
      />
      {c.name}
      {isNeighborhood && <span className="text-[10px] text-muted ml-1">(default — your neighborhood)</span>}
    </label>
  );
})}
```

- [ ] **Step 3: Verify the listing-creation request still includes the neighborhood community id**

The submission already sends `selectedCommunityIds` (or equivalent). Since the neighborhood community is now pre-checked and disabled, the user's selection always includes it.

Bonus check: the backend ALSO auto-attaches the neighborhood community at `main.py:1102-1106` (PR 1 work). Even if the FE somehow doesn't send it, the BE re-attaches. Defense in depth.

- [ ] **Step 4: Run typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/sell-wizard/
git commit -m "$(cat <<'EOF'
feat(frontend): sell wizard pre-selects neighborhood community

The user's neighborhood community (resolved by matching
user.neighborhood against the publicCommunities list) is now
pre-checked and non-removable in the sell wizard's community
selector. Mirrors the backend auto-attach behavior so the user
sees exactly where their listing will appear without surprise.

A small "(default — your neighborhood)" annotation surfaces the
pre-selection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Profile change-neighborhood confirmation modal

**Files:**
- Modify: `frontend/src/pages/MyAccount/modals/EditProfileModal.tsx` (or wherever profile edit lives — confirmed earlier the edit modal is in MyAccountPage.tsx; verify the actual file)

### Steps

- [ ] **Step 1: Locate the profile-neighborhood-change submit handler**

```bash
grep -n "PUT.*profile\|editNeighborhood\|saveProfile" frontend/src/pages/MyAccount/MyAccountPage.tsx | head -10
```

Find the handler that submits the profile form. It likely posts to `PUT /api/auth/profile`.

- [ ] **Step 2: Detect a neighborhood change**

Compare `editNeighborhood` (the new value from the form) to `user.neighborhood` (the current value). If they're different AND the user has any existing listings, show the confirmation modal before submitting.

Pseudocode:

```tsx
const isNeighborhoodChanging = editNeighborhood.trim() !== (user?.neighborhood ?? "");

const handleSave = async () => {
  if (isNeighborhoodChanging) {
    setShowNeighborhoodChangeConfirm(true);
    return;
  }
  // existing submit logic
};

const handleConfirmAndSave = async () => {
  setShowNeighborhoodChangeConfirm(false);
  // existing submit logic
};
```

- [ ] **Step 3: Add the confirmation modal JSX**

```tsx
{showNeighborhoodChangeConfirm && (
  <ModalShell open onClose={() => setShowNeighborhoodChangeConfirm(false)} z={60}>
    <div className="bg-canvas border border-hairline rounded-md max-w-md w-full mx-4 p-6">
      <h3 className="text-base font-semibold text-ink mb-2">Change neighborhood?</h3>
      <p className="text-sm text-body leading-relaxed">
        You'll leave the <strong>{user?.neighborhood ?? "—"}</strong> community
        and join <strong>{editNeighborhood}</strong>. Your existing listings
        stay tagged to {user?.neighborhood ?? "your previous neighborhood"}.
      </p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={() => setShowNeighborhoodChangeConfirm(false)}
          className="h-9 px-4 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirmAndSave}
          className="h-9 px-4 rounded-md bg-primary text-on-primary hover:bg-primary-hover text-sm font-semibold"
        >
          Confirm
        </button>
      </div>
    </div>
  </ModalShell>
)}
```

- [ ] **Step 4: Run typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): profile change-neighborhood confirmation modal

Before submitting a profile update that changes the user's
neighborhood, show a confirmation modal:

  "You'll leave [old neighborhood] and join [new]. Your existing
   listings stay tagged to [old neighborhood]."

The "existing listings stay tagged" claim is accurate because
Listing.communities is captured at posting time, not at view time —
backend membership swap (PR 1) doesn't retroactively rewrite past
listings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification + PR update

- [ ] **Final A: All checks green**

```bash
cd backend && pytest -v
cd frontend && npm run typecheck && npm run build
```

All exit 0.

- [ ] **Final B: Commit log**

```bash
git log dev..HEAD --oneline | wc -l
```

Expected: 17 (2 docs + 6 PR 1 implementation + 1 PR 1 tech-debt cleanup + 8 PR 2 commits).

- [ ] **Final C: Update PR #15**

```bash
git push origin chore/neighborhood-default-community
gh pr edit 15 --title "feat(communities): neighborhood default community — backend + frontend" --body "[updated body covering both PR 1 and PR 2 scope]"
```

The PR body update should reference the spec, both plans, and the QA verdict from PR 1 + a fresh QA pass on PR 2.

---

## Self-Review

**Spec coverage:**
- Spec Section 4A (onboarding picker) → Task 3 ✓
- Spec Section 4B (App.tsx + AuthContext cleanup) → Task 5 ✓
- Spec Section 4C (marketplace filter) → Task 6 ✓
- Spec Section 4D (sell wizard pre-select) → Task 7 ✓
- Spec Section 4E (profile change-neighborhood) → Task 8 ✓
- Spec Section 4F (dedicated community page) → out of scope per spec ("page already works via existing routes") ✓
- Reconciliation (drift discovery) → Task 1 ✓ (added beyond original spec, mandated by discovery)
- New `useNeighborhoods` hook (single source of truth enforcement) → Task 2 ✓ (added beyond original spec; user-chosen drift-prevention)
- PR 3 scope (listing creation cutover + backfill + main.py cleanup + endpoint delete + re-pick prompt) → out of scope here ✓ (separate PR)

**Placeholder scan:** No TBD/TODO. Task 6 has a conditional ("commit only if changes are needed") — that's not a placeholder, it's a real instruction depending on Task 5's outcome.

**Type consistency:** `useNeighborhoods` returns `{ list, isLoading, error, retry }` consistently across Tasks 2-4. `selectedCommunityIds` shape is `number[]` after Task 5's narrowing.

**Known fragility:**
- Task 5 Step 3's instruction about line 678 ("read surrounding context to confirm dead vs alive") requires care from the implementer. If they remove the line incorrectly, the marketplace filter loses functionality. Mitigation: the instruction explicitly says "be safe" and recommends a default of "keep if unsure."
- Task 7 assumes the sell wizard's community selector iterates `publicCommunities` directly. If it uses a different data source, the implementer needs to trace; the broad grep in Step 1 surfaces this.

**No spec gaps for PR 2's scope.**
