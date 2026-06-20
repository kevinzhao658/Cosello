# Circles — Phase 4: Marketplace Feed Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the listing card's single hero-community byline with the fixed three-slot circle byline (building · school · mutual friends) driven by the per-viewer `circles` field from Phase 2.

**Architecture:** Add the `circles` shape to the `Listing` type, build one canonical `CircleByline` component (lit = a shared/revealed circle, with a hover tooltip and an inline mutual-friends count; faded = not shared, uniform, no tooltip), drop it into `ListingCard` in place of the `heroCommunity` byline, and remove the `heroCommunity`/`PLACEHOLDER_COMMUNITY` plumbing from `App.tsx`. The Phase 3 `CirclePreview` is refactored to delegate to `CircleByline` (DRY). Verification: `npm run typecheck` + `npm run build` + visual check (no frontend test runner).

**Tech Stack:** React 18, Vite, TypeScript, Tailwind v4, lucide-react.

**Depends on:** Phase 2 (the `/api/listings` `circles` field) and Phase 3 (`CirclePreview` exists).

---

## File Structure (Phase 4)

- Modify: `frontend/src/lib/types.ts` — add `ListingCircles` + `Listing.circles`.
- Create: `frontend/src/components/CircleByline.tsx` — the canonical fixed three-slot byline.
- Modify: `frontend/src/pages/signup/CirclePreview.tsx` — delegate to `CircleByline` (DRY).
- Modify: `frontend/src/components/ListingCard.tsx` — use `CircleByline`; drop `heroCommunity` prop and the community-byline block.
- Modify: `frontend/src/App.tsx` — remove `heroCommunity` computation + prop; drop the now-unused `PLACEHOLDER_COMMUNITY` import if nothing else uses it.

---

## Task 1: Add the `circles` shape to the `Listing` type

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add the interface and field**

In `frontend/src/lib/types.ts`, add above `export interface Listing`:

```typescript
export interface ListingCircles {
  building: { shared: boolean; label: string };
  school: { shared: boolean; label: string };
  mutualFriends: { count: number };
}
```

Add to `interface Listing` (next to `allCommunities`):

```typescript
  circles?: ListingCircles;
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "feat(circles): add ListingCircles to the Listing type"
```

---

## Task 2: `CircleByline` component

**Files:**
- Create: `frontend/src/components/CircleByline.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/CircleByline.tsx
import { Building2, GraduationCap, Users } from "lucide-react";
import type { ListingCircles } from "../lib/types";

interface CircleBylineProps {
  circles?: ListingCircles;
  /** Show hover tooltips on lit slots (feed/profile). Off for the consent preview. */
  tooltips?: boolean;
}

interface SlotProps {
  lit: boolean;
  label: string;
  count?: number;
  tooltips: boolean;
  children: React.ReactNode; // the icon
}

function Slot({ lit, label, count, tooltips, children }: SlotProps) {
  return (
    <span
      className={`relative group inline-flex items-center gap-1 transition-[color,opacity] ${
        lit ? "text-primary opacity-100" : "text-muted-soft opacity-30"
      }`}
    >
      {children}
      {lit && typeof count === "number" && count > 0 && (
        <span className="text-[11px] font-bold text-primary-text">{count}</span>
      )}
      {lit && tooltips && (
        <span className="pointer-events-none absolute bottom-[140%] left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-[10px] font-semibold text-on-primary opacity-0 transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </span>
  );
}

/** Fixed three positions (building · school · mutual friends), evenly
 *  distributed. Lit when the viewer shares a revealed circle with the seller;
 *  faded otherwise. Faded slots are uniform and carry no tooltip. */
export function CircleByline({ circles, tooltips = true }: CircleBylineProps) {
  const building = circles?.building.shared ?? false;
  const school = circles?.school.shared ?? false;
  const friendCount = circles?.mutualFriends.count ?? 0;

  return (
    <div className="flex items-center justify-evenly h-6 mb-1.5">
      <Slot lit={building} label={circles?.building.label ?? "Same building"} tooltips={tooltips}>
        <Building2 className="size-[17px]" />
      </Slot>
      <Slot lit={school} label={circles?.school.label || "School"} tooltips={tooltips}>
        <GraduationCap className="size-[17px]" />
      </Slot>
      <Slot lit={friendCount > 0} label={`${friendCount} mutual friends`} count={friendCount} tooltips={tooltips}>
        <Users className="size-[17px]" />
      </Slot>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CircleByline.tsx
git commit -m "feat(circles): CircleByline fixed three-slot component"
```

---

## Task 3: Refactor `CirclePreview` to delegate to `CircleByline` (DRY)

**Files:**
- Modify: `frontend/src/pages/signup/CirclePreview.tsx`

- [ ] **Step 1: Replace the body with a delegation**

`CirclePreview` (Phase 3) takes booleans for the consent preview (no tooltips). Re-express it on top of `CircleByline`:

```tsx
// frontend/src/pages/signup/CirclePreview.tsx
import { CircleByline } from "../../components/CircleByline";

export interface CirclePreviewProps {
  building: boolean;
  school: boolean;
  mutualFriends: boolean;
}

/** Consent-preview variant: lit/faded only, no tooltips. */
export function CirclePreview({ building, school, mutualFriends }: CirclePreviewProps) {
  return (
    <CircleByline
      tooltips={false}
      circles={{
        building: { shared: building, label: "Same building" },
        school: { shared: school, label: "" },
        mutualFriends: { count: mutualFriends ? 1 : 0 },
      }}
    />
  );
}
```

Note: the consent preview maps `mutualFriends` boolean to `count: 1` purely so the slot lights; the count digit is hidden because `tooltips` being off does not suppress the count — so pass a count that lights but reads cleanly. Since the registration preview should not show a number, set the friends slot via `mutualFriends ? 1 : 0` only if the count digit is acceptable; if not, keep `CirclePreview`'s own simple render. **Decision:** the registration consent preview should NOT show a count digit. Therefore keep `CircleByline`'s count display gated and pass the boolean through a dedicated path:

Adjust `CircleByline` `Slot` so the count only renders when `count` is provided AND greater than zero (already the case), and in `CirclePreview` pass no count by using a separate prop. Simplest: give `CircleByline` an optional `friendsAsCount` behavior is overkill — instead, in `CirclePreview`, render `CircleByline` with `circles.mutualFriends.count` set to `mutualFriends ? 0 : 0` is wrong. **Final decision:** add an optional `showFriendCount` prop to `CircleByline` (default true); `CirclePreview` passes `showFriendCount={false}` and `count: mutualFriends ? 1 : 0`.

Update `CircleByline` props/Slot accordingly:

```tsx
// in CircleByline.tsx — add to CircleBylineProps:
  /** Render the numeric mutual-friends count beside the icon. Default true. */
  showFriendCount?: boolean;
// thread showFriendCount (default true) into the friends <Slot count=...>:
//   <Slot ... count={showFriendCount ? friendCount : undefined} ... >
// and light the friends slot on friendCount > 0 regardless.
```

So the friends `Slot` receives `lit={friendCount > 0}` always, but `count` is `undefined` when `showFriendCount` is false (icon lights, no digit). Then `CirclePreview` calls:

```tsx
    <CircleByline tooltips={false} showFriendCount={false}
      circles={{
        building: { shared: building, label: "Same building" },
        school: { shared: school, label: "" },
        mutualFriends: { count: mutualFriends ? 1 : 0 },
      }} />
```

- [ ] **Step 2: Apply the `showFriendCount` change in `CircleByline.tsx`**

Edit `CircleByline` to add `showFriendCount = true` to the destructured props and change the friends slot to `count={showFriendCount ? friendCount : undefined}`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/signup/CirclePreview.tsx frontend/src/components/CircleByline.tsx
git commit -m "refactor(circles): CirclePreview delegates to CircleByline"
```

---

## Task 4: Use `CircleByline` in `ListingCard`

**Files:**
- Modify: `frontend/src/components/ListingCard.tsx` (props ~6-20; byline block ~42-56)

- [ ] **Step 1: Replace the community byline with `CircleByline`**

In `ListingCard.tsx`:
- Add the import: `import { CircleByline } from "./CircleByline";`
- Remove `heroCommunity` from `ListingCardProps` and from the destructured params.
- Remove the now-unused imports `import type { ... ListingCommunity } from "../lib/types"` (keep `Listing`) and `import type { PLACEHOLDER_COMMUNITY } from "../lib/listings"` if they become unused (check with `grep -n "ListingCommunity\|PLACEHOLDER_COMMUNITY" src/components/ListingCard.tsx` after editing).
- Replace the entire community-byline block:

```tsx
      {/* Community byline — above the photo */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {heroCommunity.image ? (
          <img src={heroCommunity.image} alt="" aria-hidden="true" className="size-5 rounded-full object-cover shrink-0" />
        ) : (
          <span aria-hidden="true" className="size-5 rounded-full bg-primary shrink-0 inline-flex items-center justify-center text-on-primary text-[9px] font-bold">
            {heroCommunity.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-xs font-medium text-body line-clamp-1">{heroCommunity.name}</span>
      </div>
```

with:

```tsx
      {/* Circle byline — fixed three slots above the photo */}
      <CircleByline circles={listing.circles} />
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: errors at the `ListingCard` call site in `App.tsx` (still passing `heroCommunity`) — that is fixed in Task 5. The component file itself should be internally consistent.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ListingCard.tsx
git commit -m "feat(circles): ListingCard renders the CircleByline"
```

---

## Task 5: Remove `heroCommunity` plumbing from `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx` (heroCommunity computation + the `<ListingCard heroCommunity=...>` prop, ~1576-1590)

- [ ] **Step 1: Delete the computation and prop**

In `App.tsx`, find the `const heroCommunity = ...` assignment (it resolves a mutual community then `?? listing.allCommunities?.[0] ?? PLACEHOLDER_COMMUNITY`) and delete the whole assignment. Then delete the `heroCommunity={heroCommunity}` line from the `<ListingCard ... />` props.

- [ ] **Step 2: Drop the unused import**

Run: `grep -n "PLACEHOLDER_COMMUNITY" src/App.tsx`
If the only remaining hit is the import line, remove `PLACEHOLDER_COMMUNITY` from that import statement. If it is still referenced elsewhere, leave it.

- [ ] **Step 3: Typecheck and build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both succeed (no remaining `heroCommunity` references).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(circles): drop heroCommunity plumbing from the feed"
```

---

## Task 6: Verify end to end

- [ ] **Step 1: Frontend gates**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both pass.

- [ ] **Step 2: Visual check against the mockup**

Run the app and view the feed as a logged-in user who shares a building (and/or has mutual friends) with at least one seller who opted in. Confirm:
- Every card shows three evenly-spaced icons; shared ones are violet, the rest faded.
- Hovering a lit icon shows its tooltip; the mutual-friends slot shows an inline count when lit.
- A card where you share nothing shows three faded icons (no tooltip, no "Cosello" placeholder).
- Logged-out (`/api/listings/public`): all three slots faded on every card (no viewer).
Compare against `.superpowers/brainstorm/.../marketplace-feed-c.html`.

---

## Self-Review (against the spec)

- **Spec §4 display grammar:** fixed three slots, even distribution, lit = revealed mutual with tooltip + friend count, faded = uniform/no-tooltip (Tasks 2, 4). ✔
- **Spec §5b feed:** `ListingCard` consumes the Phase 2 `circles` field; `heroCommunity`/`PLACEHOLDER_COMMUNITY` removed (Tasks 4, 5). ✔
- **DRY:** one `CircleByline`, reused by the registration `CirclePreview` (Task 3) — no duplicated slot styling/markup. ✔
- **No frontend tests:** typecheck + build + visual check, stated up front. ✔
- **Type consistency:** `ListingCircles` (Task 1) matches the backend `circles` shape from Phase 2 Task 2 (`building`/`school` `{shared,label}`, `mutualFriends.{count}`); `CircleByline` props and `CirclePreview`'s delegation use it consistently. ✔
- **Cleanup deferred (noted):** `Listing.allCommunities` / `mutualCommunities` and the backend fields that feed them are now unused by the feed but may still be read by the profile/detail surfaces — remove only after Phase 5 confirms no readers, so this phase leaves them in place. ✔
- **Spec §5d profile + §5c My Account:** out of scope here — Phase 5. The shared `CircleByline` is what the profile's listing grid will reuse. ✔
