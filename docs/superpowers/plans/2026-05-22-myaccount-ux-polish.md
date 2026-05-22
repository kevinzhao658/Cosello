# MyAccount UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure MyAccount's Selling + Buying tables to a shared 3-column shape, swap the static "Confirmed" status for a live pickup countdown pill, and replace empty-state flicker with shimmer skeletons across MyAccount surfaces (auto-cascading the shimmer upgrade to marketplace + notifications via the shared `Skeleton` primitive).

**Architecture:** Pure frontend change. All data is already fetched today; this PR adds explicit `isLoading*` flags to gate skeleton rendering, rewrites the `ListingsPanel` JSX to share a single grid template across Selling + Buying, swaps the literal `"Confirmed"` status label for a `<Package />` + countdown label, and upgrades the shared `Skeleton.tsx` primitive from `animate-pulse` to a 3s transform-based shimmer (`::before` pseudo-element + Tailwind v4 `@theme` keyframe). Six skeleton components compose the upgraded primitive into shape-matching placeholders for each MyAccount surface.

**Tech Stack:** React 18, TypeScript, Tailwind v4, lucide-react. No new dependencies. No backend changes.

**Spec:** `docs/superpowers/specs/2026-05-22-myaccount-ux-polish-design.md` (committed `351559d` on this branch).

**Branch:** `feature/myaccount-ux-polish` (currently at `351559d`, branched from `dev`). Opens as a PR after PR #9 (tsconfig) merges so `npm run typecheck` is available.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/styles/theme.css` | Modify (`@theme inline` block ~line 168) | Add `--animate-shimmer` token + `@keyframes shimmer` |
| `frontend/src/components/ui/Skeleton.tsx` | Modify (entire file) | Switch primitive from `animate-pulse` to transform-based shimmer |
| `frontend/src/components/ListingRowSkeleton.tsx` | Create | Compact-table row skeleton (3-col grid matching the new Item / Price / Status shape) |
| `frontend/src/components/KpiCardSkeleton.tsx` | Create | KPI tile skeleton (label + value + sub) |
| `frontend/src/components/PunchlistRowSkeleton.tsx` | Create | Punchlist category row skeleton (icon + 2-line text + CTA) |
| `frontend/src/components/FriendRecommendationSkeleton.tsx` | Create | Friend recommendation row skeleton (avatar + name + mutual line + CTA) |
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify | Add `isLoading*` flags + initial-true state, wire them into each `fetch*` function, restructure `ListingsPanel` Selling + Buying JSX to the new 3-col shape, swap status pill to countdown + `<Package />`, gate every loading surface on `isLoading*` to show skeletons during initial fetch |

No new dependencies. No backend changes. No new env vars.

---

## Commit Strategy (3 commits)

| # | Subject | Tasks |
|---|---|---|
| 1 | `chore(ui): upgrade Skeleton primitive to transform-based shimmer` | Tasks 1, 2 |
| 2 | `feat(myaccount): restructure Listings table + Status countdown pill` | Task 3 |
| 3 | `feat(myaccount): skeleton loading across all surfaces` | Tasks 4, 5, 6, 7, 8, 9 |

Each commit independently builds and passes typecheck. Commit 1 immediately upgrades the marketplace shimmer (since `App.tsx` already uses `ListingCardSkeleton` which composes the primitive). Commit 2 lands the table + countdown changes without touching loading state. Commit 3 adds the loading-state machinery + skeleton wiring as one cohesive change.

---

## Task 1: Add shimmer animation token + keyframe to Tailwind theme

**Files:**
- Modify: `frontend/src/styles/theme.css` (inside the `@theme inline { ... }` block around line 99–188 and add a `@keyframes` block alongside the existing ones at the bottom of the file)

**Steps:**

- [ ] **Step 1: Add the `--animate-shimmer` token inside `@theme inline`**

Add this entry to the `@theme inline { ... }` block, immediately after the existing `--animate-save-pulse` line (~line 167):

```css
  /* Skeleton shimmer sweep — a pseudo-element `::before` translates across the
     parent. Gated behind `motion-safe:` at the call site so reduced-motion
     users see a static skeleton. GPU-only transform — zero paint cost. */
  --animate-shimmer: shimmer 3s linear infinite;
```

- [ ] **Step 2: Add the `@keyframes shimmer` block at the bottom of the file**

After the existing `@keyframes save-pulse { ... }` block (~line 266), append:

```css
/* Skeleton shimmer — translates the ::before overlay from off-screen-left to
   off-screen-right. The static element keeps the muted base color; only the
   gradient overlay moves. */
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
```

- [ ] **Step 3: Verify build picks up the new token**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0. No new errors. Tailwind v4 will generate the `animate-shimmer` utility class on demand.

- [ ] **Step 4: Verify typecheck still passes**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. (This task touches CSS only — no TS impact.)

---

## Task 2: Upgrade `Skeleton.tsx` primitive to use shimmer overlay

**Files:**
- Modify: `frontend/src/components/ui/Skeleton.tsx` (entire body)

**Steps:**

- [ ] **Step 1: Rewrite `Skeleton.tsx` to use the `::before` shimmer overlay**

Replace the entire file contents with:

```tsx
import { cn } from "./utils";

type SkeletonProps = {
  className?: string;
};

/**
 * Skeleton primitive. Renders a muted block with a shimmer sweep overlay.
 *
 * Implementation: a `::before` pseudo-element translates across the parent
 * (GPU-composited `transform`, zero paint cost per frame). The base color is
 * `bg-surface-strong`; the sweep is a transparent → white/15 → transparent
 * gradient. Gated behind `motion-safe:` so users with `prefers-reduced-motion`
 * see a static block.
 *
 * Animation token: `--animate-shimmer` in `styles/theme.css`.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-strong",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
        "motion-safe:before:animate-shimmer",
        className,
      )}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 2: Verify the existing skeleton consumers still compile**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. (`ListingCardSkeleton`, `CommunityCardSkeleton`, `NotificationItemSkeleton` import `<Skeleton />` by name — their consumers don't see API changes.)

- [ ] **Step 3: Verify build still passes**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0. Look for `animate-shimmer` in the generated CSS bundle — Tailwind v4 should emit it because the class is used in `Skeleton.tsx`.

- [ ] **Step 4: Visual smoke (optional but recommended)**

Run: `cd frontend && npm run dev`

Open the marketplace home page. Throttle network to "Slow 3G" in DevTools. Confirm the 8 listing-card skeletons show a left-to-right shimmer sweep at ~3s pace (not the old opacity pulse). Hard-reload if Vite has stale styles cached.

- [ ] **Step 5: Commit (Commit 1)**

```bash
git add frontend/src/styles/theme.css frontend/src/components/ui/Skeleton.tsx
git commit -m "$(cat <<'EOF'
chore(ui): upgrade Skeleton primitive to transform-based shimmer

Replace animate-pulse opacity fade with a 3s shimmer sweep implemented
via a `::before` pseudo-element that translates across the parent
element. GPU-composited transform, zero paint cost per frame.

Adds --animate-shimmer token and @keyframes shimmer to theme.css.
Cascades automatically to every existing Skeleton consumer:
ListingCardSkeleton (App.tsx marketplace, MyAccount listings tab),
CommunityCardSkeleton (MyAccount communities), NotificationItemSkeleton.

motion-safe: variant ensures users with prefers-reduced-motion: reduce
see a static skeleton.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Restructure `ListingsPanel` — 3-col Selling + Buying tables + countdown pill

This is the largest single task. It restructures both tables in one component edit and swaps the status pill. Doing it together avoids two passes over the same JSX.

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx`
  - Imports section near the top of the file (add `Package` to the `lucide-react` import)
  - Selling table block (~lines 2436–2527)
  - Buying table block (~lines 2540–2622)

**Reference for the new shape (locked during brainstorming):**
- Grid template: `grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]`
- Item cell: thumbnail + 2-line text stack (community subtitle above item name)
- Community subtitle: `text-[10px] text-muted truncate` (no dot, no chip)
- Price: right-aligned, tabular-nums
- Status: right-aligned pill, unchanged styling except `"Confirmed"` → countdown
- Countdown pill body: `<Package className="size-3" aria-hidden /> {countdown.label}`

**Steps:**

- [ ] **Step 1: Add `Package` to the lucide-react import**

Find the existing `lucide-react` import in `MyAccountPage.tsx` near the top of the file (there will be a multi-icon import line). Add `Package` to the list.

Example (your existing import will look different — only add `Package`, don't reorder):

```tsx
import { ..., Package, ... } from "lucide-react";
```

- [ ] **Step 2: Rewrite the Selling table block**

Find the Selling block (the conditional branch `listingsTab === "selling" ?` inside `ListingsPanel`, ~lines 2424–2527).

Replace the entire `<div className="flex-1 overflow-y-auto">...</div>` block (the table header + rows section, NOT the empty state) with:

```tsx
<div className="flex-1 overflow-y-auto">
  {/* 3-col grid: Item (with community subtitle) / Price / Status.
      Identical to the Buying table below so the two read as one
      visual system. */}
  <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
    <span>Item</span>
    <span className="text-right">Price</span>
    <span className="text-right">Status</span>
  </div>
  <div>
    {sellingRows.map((listing) => {
      const timeInfo = getListingTimeInfo(listing.postedAt);
      const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
      const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
      const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
      const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
      const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
      const isSellerPickupReady = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed;
      const isSellerWaitingForBuyer = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed;
      const isCompleted = sellerOrder?.status === "completed";
      const cta = getSellerListingCtaState({
        timeExpired: timeInfo.expired,
        isSellerWaitingForBuyer: !!isSellerWaitingForBuyer,
        isSellerPickupReady: !!isSellerPickupReady,
        sellerOrderStatus: sellerOrder?.status ?? null,
        hasPendingOrders,
      });

      // Confirmed-and-still-ticking state renders the countdown label
      // with a Package icon. Other states keep their existing labels.
      const isConfirmedTicking = sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired;

      const statusLabel = isCompleted
        ? "Completed"
        : isSellerPickupReady
          ? "Pickup ready"
          : isSellerWaitingForBuyer
            ? "Awaiting buyer"
            : isConfirmedTicking
              ? sellerCountdown.label
              : sellerOrder?.status === "confirmed"
                ? "Confirmed"
                : hasPendingOrders
                  ? `${listing.pendingOrderCount} pending`
                  : timeInfo.expired
                    ? "Expired"
                    : "Live";

      const isClickable = !timeInfo.expired && !isSellerWaitingForBuyer;

      return (
        <button
          key={listing.id}
          onClick={() => {
            if (timeInfo.expired) return;
            if (isSellerPickupReady && sellerOrder) openRatingModal(sellerOrder);
            else if (isSellerWaitingForBuyer) return;
            else if (hasPendingOrders) openOrderModal(listing);
            else if (sellerOrder) openConfirmedOrderSummary(listing.id);
            else openEditListing(listing);
          }}
          disabled={!isClickable}
          className={`w-full grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
        >
          {/* Item cell — thumb + community subtitle (muted) above title. */}
          <div className="flex items-center gap-3 min-w-0">
            <ListingImage src={listing.imageUrl} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
              <p className="text-sm font-semibold text-ink truncate">{formatTitle(listing.brand, listing.name)}</p>
            </div>
          </div>
          <span className="text-sm font-bold text-ink tabular-nums text-right">${listing.price}</span>
          <span className={`justify-self-end text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
            cta === "expired" || isCompleted
              ? "bg-surface-strong text-muted"
              : cta === "default"
                ? "bg-primary-soft text-primary"
                : "bg-primary text-on-primary"
          }`}>
            {isConfirmedTicking ? (
              <Package className="size-3" aria-hidden />
            ) : (
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            )}
            {statusLabel}
          </span>
        </button>
      );
    })}
  </div>
</div>
```

Key changes from the old Selling block:
- Grid template `grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto]` → `grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]`.
- Header dropped `<span>Community</span>` (col 2).
- Row dropped the `<Tooltip>` wrapper + Community cell that used to be col 2.
- Item-cell subtitle changed from `listing.location || "—"` to community name (currently `PLACEHOLDER_COMMUNITY.name` — leave this exactly as it is; the real community wiring is a separate backlog item per the existing inline comment).
- `<span>` wrapping the status pill: dropped the centered dot decoration *when ticking* and replaced with `<Package className="size-3" />`. The dot stays for non-ticking states.
- Status label includes the new `isConfirmedTicking ? sellerCountdown.label : ...` branch.
- Added `justify-self-end` on the status pill so it right-aligns inside its 1fr cell.

- [ ] **Step 3: Rewrite the Buying table block**

Find the Buying block (the other branch in the same conditional, ~lines 2540–2622).

Replace the entire `<div className="flex-1 overflow-y-auto">...</div>` block with:

```tsx
<div className="flex-1 overflow-y-auto">
  {/* 3-col grid: Item (with community subtitle) / Price / Status —
      identical template to the Selling table above. */}
  <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
    <span>Item</span>
    <span className="text-right">Price</span>
    <span className="text-right">Status</span>
  </div>
  <div>
    {myPurchases.map((order) => {
      const countdown = getPickupCountdown(order);
      const viewState = getBuyerOrderViewState({
        status: order.status,
        countdownExpired: countdown.expired,
        hasReviewed: order.buyer_reviewed,
        otherReviewed: order.seller_reviewed,
      });
      const isConfirmedTicking = viewState === "confirmedCountdown";
      const statusLabel = viewState === "declined" ? "Declined"
        : viewState === "withdrawn" ? "Withdrawn"
        : viewState === "expired" ? "Expired"
        : viewState === "cancelledBySeller" ? "Cancelled by seller"
        : viewState === "waitingForOther" ? "Awaiting seller"
        : viewState === "pickupReady" ? "Pickup ready"
        : isConfirmedTicking ? countdown.label
        : order.status === "completed" ? "Completed"
        : "Pending";
      const isClickable = !(viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || viewState === "cancelledBySeller" || viewState === "waitingForOther");
      return (
        <button
          key={order.id}
          onClick={() => {
            if (!isClickable) return;
            if (viewState === "pickupReady") openRatingModal(order);
            else if (order.status === "confirmed") openConfirmedOrderSummary(order.listing_id);
          }}
          disabled={!isClickable}
          className={`w-full grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
        >
          {/* Item cell — thumb + community subtitle above title.
              Seller @handle no longer rendered in the table; still
              available via the order summary modal. */}
          <div className="flex items-center gap-3 min-w-0">
            <ListingImage src={order.listing_image} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
              <p className="text-sm font-semibold text-ink truncate">{order.listing_title}</p>
            </div>
          </div>
          <span className="text-sm font-bold text-primary tabular-nums text-right">${order.listing_price}</span>
          <span className={`justify-self-end text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
            viewState === "declined" || viewState === "withdrawn" || viewState === "expired"
              ? "bg-surface-strong text-muted"
              : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                ? "bg-warning/10 text-warning"
                : "bg-primary text-on-primary"
          }`}>
            {isConfirmedTicking ? (
              <Package className="size-3" aria-hidden />
            ) : (
              <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
            )}
            {statusLabel}
          </span>
        </button>
      );
    })}
  </div>
</div>
```

Key changes from the old Buying block:
- Grid template collapsed from 6 cols to 3 cols (`grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)]`).
- Header dropped `Community`, `Seller`, `Last updated` — only `Item`, `Price`, `Status` remain.
- Row dropped: `Community` cell (Tooltip + chip), `Seller` cell (`@{order.seller_name}`), `Last updated` cell (the IIFE rendering confirmed_time or created_at).
- Item subtitle is now community name (still using `PLACEHOLDER_COMMUNITY.name` per existing pattern).
- Status pill: `Package` icon swaps in when `viewState === "confirmedCountdown"`; label uses `countdown.label`.
- Status pill right-aligned via `justify-self-end`.

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. (Watch for stray unused imports, e.g., if the old code imported something only used by the deleted Last-updated logic — there are none from this set of edits, but verify.)

- [ ] **Step 5: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 6: Visual smoke**

Run: `cd frontend && npm run dev`

In a browser logged into a test account:
- Open MyAccount → Overview.
- Toggle the Selling / Buying segmented control.
- Both tables should show 3 columns with identical grid alignment.
- Item cell shows the community name above the item title (muted small text).
- Status pill for any confirmed-and-still-ticking order shows `<Package /> 2h 14m` (or similar).
- Other status states (Live / Pending / Expired / etc.) keep their existing dot + label.
- No layout shift between rows, no overflow.

- [ ] **Step 7: Commit (Commit 2)**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
feat(myaccount): restructure Listings table + Status countdown pill

Selling and Buying tables now share an identical 3-column shape:
Item / Price / Status. Community name renders as a quiet muted
subtitle above the item title in the Item cell, replacing the prior
location subtitle on Selling and the dedicated Community/Seller/
Last-updated columns on Buying. Seller @handle is still reachable
via the order summary modal.

Status pill for confirmed-but-still-ticking orders now shows
<Package /> + the live countdown label (e.g., "2h 14m") instead of
the static "Confirmed" string. Other status states are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `ListingRowSkeleton`

**Files:**
- Create: `frontend/src/components/ListingRowSkeleton.tsx`

**Steps:**

- [ ] **Step 1: Write the new file**

```tsx
import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one row of the compact Listings table on the Overview tab.
 * Mirrors the 3-col grid template used by both Selling and Buying tables:
 * Item (thumb + 2-line text stack) / Price / Status pill.
 */
export function ListingRowSkeleton() {
  return (
    <div className="w-full grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 items-center py-3 border-b border-hairline-soft">
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton className="size-10 rounded-md shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-2.5 w-1/3" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
      <Skeleton className="justify-self-end h-3.5 w-10" />
      <Skeleton className="justify-self-end h-4 w-14 rounded-full" />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

---

## Task 5: Create `KpiCardSkeleton`

**Files:**
- Create: `frontend/src/components/KpiCardSkeleton.tsx`

**Steps:**

- [ ] **Step 1: Write the new file**

```tsx
import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one KPI tile on the Listings tab (4 per row at xl breakpoint).
 * Matches the real KPI card shape: label / value / sub.
 */
export function KpiCardSkeleton() {
  return (
    <div className="bg-surface-card border border-hairline rounded-md p-4 space-y-2">
      <Skeleton className="h-2 w-3/5" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-2 w-4/5" />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

---

## Task 6: Create `PunchlistRowSkeleton`

**Files:**
- Create: `frontend/src/components/PunchlistRowSkeleton.tsx`

**Steps:**

- [ ] **Step 1: Write the new file**

```tsx
import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one collapsed category row in the Overview Punchlist panel:
 * icon + label + count + CTA placeholder.
 */
export function PunchlistRowSkeleton() {
  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-hairline-soft">
      <Skeleton className="size-7 rounded-md shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2 w-1/4" />
      </div>
      <Skeleton className="h-7 w-20 rounded-md shrink-0" />
    </li>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

---

## Task 7: Create `FriendRecommendationSkeleton`

**Files:**
- Create: `frontend/src/components/FriendRecommendationSkeleton.tsx`

**Steps:**

- [ ] **Step 1: Write the new file**

```tsx
import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one row in the Friends-You-May-Know recommendations list:
 * avatar + name + mutual-friends line + CTA placeholder.
 */
export function FriendRecommendationSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-hairline-soft">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 rounded-md shrink-0" />
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

---

## Task 8: Add `isLoading*` flags to `MyAccountPage` and wire them into the fetchers

This task adds the loading-state machinery without yet changing any render path — that's Task 9. Decoupling lets you typecheck/build between the state additions and the JSX changes.

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx`

**Steps:**

- [ ] **Step 1: Add four new `useState` declarations** near the other `isLoading*` declarations (around line 233 where `isLoadingRecommended` lives, and line 287 where `isLoadingRequests` lives — put these together logically with the other order/stats/listings state)

Add immediately after the `const [_communitiesLoaded, setCommunitiesLoaded] = useState(false);` line (~line 189) and the `const [_punchlistLoaded, setPunchlistLoaded] = useState(false);` line (~line 348):

```tsx
  // Initial-load gates for skeleton rendering. Each defaults to `true`
  // so the very first render of MyAccount shows skeletons rather than
  // "Nothing here yet" empty copy. Flipped to `false` in the `finally`
  // block of the corresponding fetch* function.
  const [isLoadingMyListings, setIsLoadingMyListings] = useState(true);
  const [isLoadingMyOrders, setIsLoadingMyOrders] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
```

(One combined `isLoadingMyOrders` covers both `myPurchases` and `mySellerOrders` since they're populated by a single `fetchAllOrders` call.)

- [ ] **Step 2: Default the two underscore-prefixed flags to skeleton-on at init**

Find these lines (~189 and ~348):

```tsx
const [_communitiesLoaded, setCommunitiesLoaded] = useState(false);
const [_punchlistLoaded, setPunchlistLoaded] = useState(false);
```

Leave them as-is for now (renaming would require finding every read site; instead Task 9 will use `!_communitiesLoaded` and `!_punchlistLoaded` directly to gate skeletons). The underscore prefix stays because we're still not "reading" them as a value — we're checking truthiness for skeleton gating, which is conceptually a different consumer.

Actually — promote them to remove the underscore so they're proper reads:

Change:
```tsx
const [_communitiesLoaded, setCommunitiesLoaded] = useState(false);
```
to:
```tsx
const [communitiesLoaded, setCommunitiesLoaded] = useState(false);
```

And:
```tsx
const [_punchlistLoaded, setPunchlistLoaded] = useState(false);
```
to:
```tsx
const [punchlistLoaded, setPunchlistLoaded] = useState(false);
```

- [ ] **Step 3: Wire `isLoadingMyListings` into `fetchMyListings`**

Find `const fetchMyListings = useCallback(async () => { ... }, [...])` (~line 460). It currently looks roughly like:

```tsx
const fetchMyListings = useCallback(async () => {
  try {
    const res = await apiFetch("/api/me/listings");
    if (res.ok) setMyListings(await res.json());
  } catch (err) {
    console.error("Failed to fetch my listings:", err);
  }
}, [/* deps */]);
```

Update it to set `isLoadingMyListings`:

```tsx
const fetchMyListings = useCallback(async () => {
  setIsLoadingMyListings(true);
  try {
    const res = await apiFetch("/api/me/listings");
    if (res.ok) setMyListings(await res.json());
  } catch (err) {
    console.error("Failed to fetch my listings:", err);
  } finally {
    setIsLoadingMyListings(false);
  }
}, [/* unchanged */]);
```

- [ ] **Step 4: Wire `isLoadingMyOrders` into `fetchAllOrders`**

Find `const fetchAllOrders = useCallback(async () => { ... }, [...])` (~line 416). Apply the same `try/finally` pattern using `setIsLoadingMyOrders`:

```tsx
const fetchAllOrders = useCallback(async () => {
  setIsLoadingMyOrders(true);
  try {
    // existing body unchanged
  } catch (err) {
    // existing handler unchanged
  } finally {
    setIsLoadingMyOrders(false);
  }
}, [/* unchanged */]);
```

(Preserve the existing body exactly — only add the leading `setIsLoadingMyOrders(true);`, wrap in `try/catch/finally` if not already wrapped, and add the `finally` reset.)

- [ ] **Step 5: Wire `isLoadingStats` into `fetchStats`**

Find `const fetchStats = useCallback(async () => { ... }, [...])` (~line 450). Apply the same pattern:

```tsx
const fetchStats = useCallback(async () => {
  setIsLoadingStats(true);
  try {
    const res = await apiFetch("/api/me/stats");
    if (res.ok) setStats(await res.json());
  } catch (err) {
    console.error("Failed to fetch stats:", err);
  } finally {
    setIsLoadingStats(false);
  }
}, [/* unchanged */]);
```

- [ ] **Step 6: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. Verify no "underscore-prefixed unused" warnings appear from the rename — `communitiesLoaded` and `punchlistLoaded` are now expected to be read.

- [ ] **Step 7: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

---

## Task 9: Wire skeletons into every MyAccount render path

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` (multiple sites)

This task adds the skeleton render branches. Pattern at every site: `isLoading ? <Skeletons /> : data.length === 0 ? <EmptyState /> : <Real />`.

**Steps:**

- [ ] **Step 1: Import the new skeleton components**

At the top of `MyAccountPage.tsx`, near the existing component imports, add:

```tsx
import { ListingRowSkeleton } from "../../components/ListingRowSkeleton";
import { ListingCardSkeleton } from "../../components/ListingCardSkeleton";
import { CommunityCardSkeleton } from "../../components/CommunityCardSkeleton";
import { KpiCardSkeleton } from "../../components/KpiCardSkeleton";
import { PunchlistRowSkeleton } from "../../components/PunchlistRowSkeleton";
import { FriendRecommendationSkeleton } from "../../components/FriendRecommendationSkeleton";
```

(If `ListingCardSkeleton` and/or `CommunityCardSkeleton` are already imported elsewhere in the file, don't double-import — verify with a grep first.)

- [ ] **Step 2: Pass loading flags + skeletons into `ListingsPanel` props**

`ListingsPanel` is the component containing the compact Selling/Buying tables. It currently receives `myListings`, `myPurchases`, etc., as props from the page-level component. Extend its prop type and call site.

Find the `ListingsPanel` function signature (~line 2371) and add to its destructured props + the type literal:

```tsx
function ListingsPanel({
  listingsTab,
  setListingsTab,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingMyListings,
  isLoadingMyOrders,
  openEditListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  getListingTimeInfo,
  getPickupCountdown,
  onNavigate,
}: {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  openEditListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  onNavigate: (page: string) => void;
}) {
```

Then find every `<ListingsPanel ... />` JSX call site in the file (grep for `<ListingsPanel`) and pass the two new props:

```tsx
<ListingsPanel
  /* existing props unchanged */
  isLoadingMyListings={isLoadingMyListings}
  isLoadingMyOrders={isLoadingMyOrders}
/>
```

- [ ] **Step 3: Gate the Selling table on `isLoadingMyListings`**

Inside `ListingsPanel`, find the `listingsTab === "selling" ?` branch you rewrote in Task 3. Wrap the existing branch in a loading check:

```tsx
{listingsTab === "selling" ? (
  isLoadingMyListings && myListings.length === 0 ? (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
        <span>Item</span>
        <span className="text-right">Price</span>
        <span className="text-right">Status</span>
      </div>
      {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
    </div>
  ) : myListings.length === 0 ? (
    /* existing empty-state block — unchanged */
    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
      <p className="text-sm text-muted mb-4">No listings yet</p>
      <button
        onClick={() => onNavigate("newlisting")}
        className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
      >
        Create listing
      </button>
    </div>
  ) : (
    /* the populated table block you rewrote in Task 3 — unchanged */
  )
) : (
  /* Buying branch — Step 4 */
)}
```

Key points:
- Skeleton only shows when `isLoadingMyListings && myListings.length === 0` — once data lands (even empty), the empty state takes over.
- The skeleton block reuses the same header markup so the column alignment matches the real table when data arrives.

- [ ] **Step 4: Gate the Buying table on `isLoadingMyOrders`**

Apply the same pattern to the Buying branch:

```tsx
) : (
  isLoadingMyOrders && myPurchases.length === 0 ? (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
        <span>Item</span>
        <span className="text-right">Price</span>
        <span className="text-right">Status</span>
      </div>
      {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
    </div>
  ) : myPurchases.length === 0 ? (
    /* existing "No purchases yet" empty-state block — unchanged */
  ) : (
    /* the populated table block you rewrote in Task 3 — unchanged */
  )
)}
```

- [ ] **Step 5: Gate the Listings-tab KPI grid on `isLoadingStats`**

The KPI grid is at ~line 2887. Find:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
  {(listingsTab === "selling" ? sellingKpis : buyingKpis).map((kpi) => (
    /* existing tile */
  ))}
</div>
```

Wrap the map in a loading gate. The component renders the KPI grid in the page-level component, NOT inside `ListingsPanel` — so `isLoadingStats` is already in scope. Replace with:

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
  {isLoadingStats
    ? Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
    : (listingsTab === "selling" ? sellingKpis : buyingKpis).map((kpi) => (
        /* existing tile unchanged */
      ))}
</div>
```

- [ ] **Step 6: Gate the Listings-tab card grid on `isLoadingMyListings` / `isLoadingMyOrders`**

The card grid for the full Listings tab is at ~line 2919 (Selling) and ~line 3042 (Buying). For Selling:

```tsx
{listingsTab === "selling" ? (
  isLoadingMyListings && filteredListings.length === 0 ? (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
    </div>
  ) : filteredListings.length === 0 ? (
    /* existing "Nothing in this view yet." block — unchanged */
  ) : (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
      {filteredListings.map((listing) => { /* unchanged */ })}
    </div>
  )
) : (
  /* Buying branch — same pattern, swap isLoadingMyOrders + filteredPurchases */
)}
```

Apply the same pattern to the Buying card grid using `isLoadingMyOrders` and `filteredPurchases`.

- [ ] **Step 7: Gate the Communities tile grid on `!communitiesLoaded`**

Find the Communities tile grid (~line 3439 — there's the line with `<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">` followed by `communities.map`). Wrap:

```tsx
{!communitiesLoaded ? (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
    {Array.from({ length: 6 }).map((_, i) => <CommunityCardSkeleton key={i} />)}
  </div>
) : communities.length === 0 ? (
  /* existing empty-state block — unchanged */
) : (
  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
    {communities.map((c) => { /* unchanged */ })}
  </div>
)}
```

(Find the exact existing wrapping by searching for `communities.map` — there may also be a separate "Recommended communities" section near it; the gate applies only to the user's joined-communities grid.)

- [ ] **Step 8: Gate the Punchlist on `!punchlistLoaded`**

The `PunchlistPanel` component receives the `punchlist` prop. Find the `<PunchlistPanel ... />` JSX call site (search `<PunchlistPanel`). Extend its props to include the loaded flag:

In the `PunchlistPanel` signature (~line 2630):

```tsx
function PunchlistPanel({
  punchlist,
  punchlistLoaded,
  onConfirmPickup,
}: {
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
  onConfirmPickup: (p: PunchlistPickup) => void;
}) {
```

In the call site, pass `punchlistLoaded={punchlistLoaded}`.

Inside `PunchlistPanel`, find the `<ul className="space-y-2 flex-1">` block (~line 2692). Wrap the `cats.map(...)` in a loading gate:

```tsx
<ul className="space-y-2 flex-1">
  {!punchlistLoaded
    ? Array.from({ length: 4 }).map((_, i) => <PunchlistRowSkeleton key={i} />)
    : cats.map((cat) => { /* existing — unchanged */ })}
</ul>
```

- [ ] **Step 9: Gate the Friends recommendations on `isLoadingRecommended`**

`isLoadingRecommended` already exists. Find where `recommendedFriends.map(...)` renders (search `recommendedFriends.map` or `isLoadingRecommended` to find the render site). Wrap:

```tsx
{isLoadingRecommended
  ? Array.from({ length: 3 }).map((_, i) => <FriendRecommendationSkeleton key={i} />)
  : recommendedFriends.length === 0
    ? /* existing empty state */
    : recommendedFriends.map((f) => { /* unchanged */ })}
```

- [ ] **Step 10: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0. If you get errors about `isLoading*` being undefined inside `ListingsPanel` or `PunchlistPanel`, you missed passing the prop through at the call site — go back to Steps 2 and 8.

- [ ] **Step 11: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 12: Visual smoke — the critical one**

Run: `cd frontend && npm run dev`

Throttle the browser DevTools network to "Slow 3G" so initial fetches take a few seconds. Hard-reload MyAccount. Verify in order:

1. **Overview tab on first paint:** No "No listings yet" or "Nothing in this view yet" copy is visible. Instead, shimmer skeletons appear in the listings table (4 rows), punchlist (4 rows), and friend recommendations (3 rows).
2. **Listings tab on first paint:** 4 KPI card skeletons, then 4 listing-card skeletons in the grid below.
3. **Communities tab on first paint:** 6 community-tile skeletons.
4. **After data lands:** Skeletons unmount, real content appears. No layout shift.
5. **If a user genuinely has zero listings:** Once `isLoadingMyListings` flips false with an empty array, the "No listings yet" empty state appears correctly.
6. **Marketplace home (App.tsx):** Hard-reload — the 8 listing-card skeletons there should now shimmer (not pulse). This is the cascade from Commit 1.
7. **Reduced motion test:** In DevTools → Rendering → Emulate CSS media `prefers-reduced-motion: reduce`. Reload — skeletons should be static (no shimmer sweep).

- [ ] **Step 13: Commit (Commit 3)**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx \
  frontend/src/components/ListingRowSkeleton.tsx \
  frontend/src/components/KpiCardSkeleton.tsx \
  frontend/src/components/PunchlistRowSkeleton.tsx \
  frontend/src/components/FriendRecommendationSkeleton.tsx
git commit -m "$(cat <<'EOF'
feat(myaccount): skeleton loading across all surfaces

Add four new shape-matching skeleton components (ListingRowSkeleton,
KpiCardSkeleton, PunchlistRowSkeleton, FriendRecommendationSkeleton)
plus isLoadingMyListings, isLoadingMyOrders, isLoadingStats flags in
MyAccountPage. Each fetch* function flips its flag in finally; flags
start true so the first render shows skeletons rather than the
"Nothing here yet" empty copy.

Skeletons gate the Overview listings table (Selling + Buying), the
Listings-tab KPI grid + card grid, the Communities tile grid, the
Punchlist, and the Friend recommendations. Counts: 4 / 4 / 4 / 6 /
4 / 3 placeholders respectively.

Promotes _communitiesLoaded and _punchlistLoaded to non-underscore
names since they're now read by the skeleton gates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all three commits land)

Before opening the PR, run all of these:

1. `cd frontend && npm run typecheck` → exit 0
2. `cd frontend && npm run build` → exit 0
3. `cd frontend && npm run dev` and manually verify:
   - Marketplace home shimmer (cascade from Commit 1)
   - MyAccount Overview tab (Selling + Buying tables, punchlist, friends — all shimmer on first paint, content after)
   - MyAccount Listings tab (KPIs + card grid)
   - MyAccount Communities tab (tile grid shimmer)
   - Confirmed-order pill shows `<Package /> 2h 14m` style on both Selling and Buying
   - Reduced-motion preference suppresses shimmer
4. `git log dev..HEAD --oneline` → expect 4 commits: `351559d` (spec) + 3 implementation commits in the order described above.
5. `git diff dev...HEAD --stat` → should touch only `frontend/src/styles/theme.css`, `frontend/src/components/ui/Skeleton.tsx`, the 4 new skeleton components, and `frontend/src/pages/MyAccount/MyAccountPage.tsx` (plus the spec file from `351559d`).

If anything fails, fix it and amend the relevant commit (do not create a fourth "fix" commit — use `git commit --amend` on the most recent commit, or `git commit --fixup=<sha>` + autosquash for older ones). Do NOT skip hooks.

---

## Self-review (already run)

**Spec coverage:**
- Section 1 (table restructure) → Task 3 ✓
- Section 2 (countdown pill) → Task 3 ✓
- Section 3 (Skeleton primitive shimmer) → Tasks 1, 2 ✓
- Section 4 (new skeleton components + state semantics) → Tasks 4–9 ✓
- Cascade to marketplace/notifications → automatic via Task 2 ✓

**Placeholder scan:** No TBD, no "add error handling," no "similar to Task N." Every code block is complete.

**Type consistency:** `isLoadingMyListings`, `isLoadingMyOrders`, `isLoadingStats` used identically across Tasks 8 and 9. `communitiesLoaded` and `punchlistLoaded` promotion handled in Task 8 Step 2.

**Known gaps:** None.

**One implementer judgment call:** Brutalist Trade palette may have a token equivalent to `white/15` for the shimmer gradient. The plan defaults to `white/15`; if a palette token exists, swap it in. Not a blocker — visually identical at this opacity.
