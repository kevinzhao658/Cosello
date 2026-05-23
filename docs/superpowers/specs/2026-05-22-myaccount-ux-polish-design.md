# MyAccount UX Polish — Design Spec

**Date:** 2026-05-22
**Branch:** `feature/myaccount-ux-polish` (off `dev`, opened after PR #9 typecheck merges)
**Status:** Awaiting user spec review.

---

## Goals

1. Make the Selling and Buying tables on the Overview tab structurally identical so users don't perceive them as different lists.
2. Surface live pickup countdown in the Status column when a seller has confirmed a time slot, instead of the static "Confirmed" label.
3. Replace the empty-state flicker across MyAccount loading surfaces with skeleton placeholders so users don't think their account is empty during initial fetch.
4. Upgrade the shared `Skeleton` primitive from pulse to shimmer so the marketplace and all other consumers of the primitive get the new look for free.

## Non-goals

- Replacing full-page `Loader2` spinners on UserProfilePage, ListingDetailModal, or OrderManagementModal. Those use a different loading pattern; leave them alone for this PR.
- Replacing in-button `Loader2` action spinners (Decline / Confirm pickup / Save changes / etc.). They indicate a submit-in-flight, not initial load.
- Touching the card-grid view of the Listings tab (the full grid with KPIs / filters at line 2860+) beyond the shimmer-upgrade that comes for free with the Skeleton primitive change.
- New backend endpoints. All data is already fetched today.

---

## Section 1 — Listings table restructure (Selling + Buying)

### Current state

Two adjacent tables on the Overview tab with different column counts and orders:

- **Selling** (`MyAccountPage.tsx:2441`): 4 cols — Item / Community / Price / Status. Grid: `grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto]`. Item subtitle = `listing.location`.
- **Buying** (`MyAccountPage.tsx:2545`): 6 cols — Item / Price / Community / Seller / Last updated / Status. Grid: `grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto_auto]`. Item has no subtitle.

### New state — both tables identical

3 columns, identical grid template, identical row markup pattern:

```
grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]
```

**Item cell** (col 1):

```
[36px thumbnail]  [community name — small, muted, truncate]
                  [item title — semibold ink, truncate]
```

- Community renders above the item title as a quiet subtitle.
- No colored dot, no chip, no accent — plain `text-[10px] text-muted truncate` on the community line.
- Item title: `text-sm font-semibold text-ink truncate`.
- Replaces the existing `listing.location` subtitle on Selling rows. Location is no longer displayed in the table view.

**Price cell** (col 2): right-aligned, `text-sm font-bold text-ink tabular-nums text-right`. Same styling as today.

**Status cell** (col 3): right-aligned pill. Styling and color logic unchanged. Label changes per Section 2.

### Removed from Buying

- `Last updated` column (was using `order.confirmed_time ?? order.created_at`).
- `Seller` column (was `@order.seller_name`). The seller handle is still visible via the trust band in the card-grid view and the order summary modal — losing it from this compact table is acceptable.
- `Price` column relocates from col 2 to col 2 of the new 3-col grid (it stays in the same logical position relative to Status).

### Removed from Selling

- The dedicated `Community` column (Community now lives as the subtitle in the Item cell).
- The `listing.location` subtitle (replaced by Community).

### Files touched

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — the `ListingsPanel` component around lines 2370–2627.

### Open questions

None.

---

## Section 2 — Countdown pill in Status column

### Current state

When `sellerOrder.status === "confirmed"` (Selling) or `viewState === "confirmedCountdown"` (Buying), the status pill displays the literal string `"Confirmed"`.

### New state

Pill renders the live countdown instead:

```tsx
<span className="...existing pill classes...">
  <Package className="size-3" aria-hidden />
  {sellerCountdown.label}  // e.g., "2h 14m", "1d 3h"
</span>
```

- Icon: `<Package />` from `lucide-react`, `size-3` (12px).
- Label: existing `getPickupCountdown(order).label` value — no new helper needed.
- Pill background/text color: unchanged (`bg-primary text-on-primary`).
- Re-renders every minute via the existing `countdownTick` interval (`MyAccountPage.tsx:365–368`). No new timer needed.

### Other states unchanged

Live / Pending / Pickup ready / Awaiting buyer / Awaiting seller / Cancelled by seller / Declined / Withdrawn / Expired / Completed — all keep their existing labels and styles.

### Accessibility

- Add `aria-hidden` on the icon (decorative; the label conveys the time).
- Optionally wrap the pill in a `<Tooltip>` with full text like "2 hours, 14 minutes until pickup" if the label gets aggressively abbreviated. Decide during implementation; not a blocker.

### Files touched

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — `ListingsPanel` (Selling + Buying status-label switches around lines 2465–2477 and 2562–2570).

### Open questions

None.

---

## Section 3 — Skeleton primitive upgrade (pulse → shimmer)

### Current state

`frontend/src/components/ui/Skeleton.tsx`:

```tsx
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-surface-strong", className)} aria-hidden="true" />;
}
```

`animate-pulse` is Tailwind's built-in opacity-fade. Used today by `ListingCardSkeleton` (App.tsx marketplace, MyAccount listings tab), `CommunityCardSkeleton` (MyAccount communities), and `NotificationItemSkeleton` (notifications panel).

### New state

Replace pulse with a transform-based shimmer at 3s linear duration:

```tsx
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-strong",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
        "before:animate-shimmer",
        className,
      )}
      aria-hidden="true"
    />
  );
}
```

- Implementation uses a pseudo-element (`::before`) that translates across the skeleton — GPU-composited (`transform`), zero paint cost during animation.
- Tailwind v4 keyframe added in `frontend/src/index.css` via `@theme`:

  ```css
  @theme {
    --animate-shimmer: shimmer 3s linear infinite;
  }
  @keyframes shimmer {
    100% { transform: translateX(200%); }
  }
  ```

- The gradient color uses `white/15` (semi-transparent white) so it works on both light and dark surfaces. Adjust to a theme token if a brutalist-palette equivalent exists.
- `motion-safe:` should wrap the shimmer animation so users with `prefers-reduced-motion: reduce` see a static skeleton.

### Cascading effect (zero new code needed)

Updating the primitive automatically upgrades:

- `ListingCardSkeleton` — used in `App.tsx:1864` marketplace grid (8 placeholders) and in the new MyAccount card-grid skeleton work below.
- `CommunityCardSkeleton` — already used in MyAccount community tile grid.
- `NotificationItemSkeleton` — `NotificationsPanel.tsx`.

### Files touched

- `frontend/src/components/ui/Skeleton.tsx`
- `frontend/src/index.css` (Tailwind v4 `@theme` block)

### Open questions

- If the brutalist Trade palette has a specific shimmer-highlight token, use that instead of `white/15`. Default to `white/15` if no token exists.

---

## Section 4 — New skeleton components + state semantics

### Surfaces requiring new skeleton components

| Surface | Component | Count | Shape source |
|---|---|---|---|
| Overview compact listings table (Selling + Buying) | `ListingRowSkeleton` (new) | 4 | mirrors the new 3-col row from Section 1 |
| Overview Punchlist panel | `PunchlistRowSkeleton` (new) | 4 | collapsed category row: icon + 2-line text + CTA |
| Overview KPI cards | `KpiCardSkeleton` (new) | 4 | label + value + sub |
| Overview Friends-You-May-Know | `FriendRecommendationSkeleton` (new) | 3 | avatar + name + mutual line + CTA |
| Listings tab card grid | `ListingCardSkeleton` (existing, no changes) | 8 | existing |
| Communities tile grid | `CommunityCardSkeleton` (existing, no changes) | 6 | existing |

All new components are thin compositions over the upgraded `Skeleton` primitive — no per-component animation logic, just shape.

### Loading-state semantics

Today the page can't tell "still fetching" from "fetched, genuinely empty." Add explicit loading flags:

| State | Today | New |
|---|---|---|
| `myListings` | `MyListing[]`, starts `[]` | + `isLoadingMyListings: boolean`, starts `true` |
| `myPurchases` | `OrderData[]`, starts `[]` | + `isLoadingMyPurchases: boolean`, starts `true` |
| `mySellerOrders` | `OrderData[]`, starts `[]` | + `isLoadingMySellerOrders: boolean`, starts `true` |
| `stats` | `Stats \| null` | + `isLoadingStats: boolean`, starts `true` |
| `communities` | `CommunityData[]` + `_communitiesLoaded` (already exists, underscore-prefixed) | rename `_communitiesLoaded` → `communitiesLoaded`, use as `!loaded` for skeleton gating |
| `punchlist` | `PunchlistResponse \| null` + `_punchlistLoaded` (already exists) | rename `_punchlistLoaded` → `punchlistLoaded`, same pattern |
| `recommendedFriends` | already has `isLoadingRecommended` | no change needed |

### Render logic per surface

```tsx
{isLoading ? (
  <SurfaceSkeleton count={N} />
) : data.length === 0 ? (
  <ExistingEmptyState />
) : (
  <ExistingRealContent />
)}
```

Each `fetch*` function sets its corresponding `isLoading*` to `true` before the request and `false` in `finally`. Initial state: all loading flags start `true` so the very first render shows skeletons (not empty state).

### Files touched

- `frontend/src/components/ListingRowSkeleton.tsx` (new)
- `frontend/src/components/PunchlistRowSkeleton.tsx` (new)
- `frontend/src/components/KpiCardSkeleton.tsx` (new)
- `frontend/src/components/FriendRecommendationSkeleton.tsx` (new)
- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — add loading flags, update fetch functions, wire skeletons into the render paths for: ListingsPanel (Selling + Buying), PunchlistPanel, KPI grid, FriendsYouMayKnow panel, Communities tile grid.

### Open questions

None.

---

## Out of scope (explicitly deferred)

- Full-page / full-modal `Loader2` spinner replacement on `UserProfilePage`, `ListingDetailModal`, `OrderManagementModal`. Separate PR if pursued.
- Empty-state copy refinements ("No listings yet" / "Nothing in this view yet" — current copy stays).
- Sort/filter on the new 3-col Selling/Buying tables.
- New backend endpoints, new fields on existing endpoints.
- The card-grid view of the Listings tab beyond the automatic shimmer cascade from the primitive change.

---

## Verification (acceptance criteria)

Before opening the PR, all of these must be true:

1. `npm run build` exit 0, zero errors.
2. `npm run typecheck` exit 0, zero errors (depends on PR #9 having merged so the script exists).
3. Selling and Buying tables on the Overview tab render with identical 3-column grids.
4. Status pill on a confirmed order shows `<Package /> {label}` instead of "Confirmed", and the label updates each minute.
5. Hard-reload the page — every MyAccount surface (listings table, listings card grid, KPI cards, communities, punchlist, friends recommendations) shows shimmer skeletons during the initial fetch, NOT the "Nothing here yet" empty state.
6. After data lands, skeletons unmount and real content takes over without layout shift.
7. Marketplace grid in `App.tsx` shows shimmer skeletons during initial listings fetch (cascaded from the primitive change), not pulse.
8. `prefers-reduced-motion: reduce` users see static skeletons (no shimmer animation).
9. No regression to any other surface using the Skeleton primitive (notifications panel, etc.).

---

## PR plan

- Branch: `feature/myaccount-ux-polish` off `dev`.
- Opens after PR #9 (tsconfig) merges so the typecheck gate is in place.
- Single PR bundling Sections 1–4 (user-approved on 2026-05-22).
- Coworkers dispatch: frontend-dev → qa-tester (sequential, per CLAUDE.md). No backend-dev involvement.
- Commit shape suggestion (frontend-dev decides between Option A and B):
  - **Option A (recommended):** 3 commits — `chore(ui): upgrade Skeleton primitive to shimmer`, `feat(myaccount): restructure Listings table + Status countdown pill`, `feat(myaccount): skeleton loading across all surfaces`.
  - **Option B:** 1 combined commit if the diff stays small enough to review at once.

---

## Related context

- Existing pulse skeleton primitive: `frontend/src/components/ui/Skeleton.tsx`.
- Marketplace skeleton consumer: `frontend/src/App.tsx:1860–1866` (8 ListingCardSkeleton).
- Notifications skeleton consumer: `frontend/src/features/notifications/NotificationsPanel.tsx`.
- Tailwind v4 `@theme` reference: project already uses this pattern in `frontend/src/index.css`.
- Brutalist Trade palette tokens: `frontend/src/index.css` `@theme` block.
