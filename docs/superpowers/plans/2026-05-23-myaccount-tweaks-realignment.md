# MyAccount Misc Tweaks Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-implement Tweaks 1, 3, and 4 on `chore/myaccount-misc-tweaks` to match the design locked via the brainstorming companion on 2026-05-23. Tweak 2 (sort order, commit `8d1dad2`) stays untouched.

**Architecture:** Three new commits stacked on top of the existing branch tip (`8559516`). Each new commit overwrites the relevant code paths from a prior commit (`66503ac`, `fecd640`, `c95311e`) — the old commits stay in history but their code is superseded. No `git reset --hard`, no force-push, no rebase.

**Tech Stack:** React 18, TypeScript, Tailwind v4, lucide-react. No new dependencies. No backend changes required for landing; backend payload extension to `Notification` is flagged as a follow-up to fully realize Section 3.

**Spec:** `docs/superpowers/specs/2026-05-23-myaccount-tweaks-realignment-design.md` (committed `8559516` on this branch).

**Branch state at plan start:** `chore/myaccount-misc-tweaks` is 5 commits ahead of dev:

```
8559516 docs(myaccount): realignment spec for tweaks 1, 3, 4
c95311e style(notifications): fade read notification text to muted
fecd640 fix(myaccount): derive punchlist client-side from loaded data
8d1dad2 feat(myaccount): rank Selling listings by action urgency
66503ac style(myaccount): left-align price/status with tight pairing
```

After this plan: 3 new commits added on top → 8 commits ahead of dev.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify (Sections 1 + 2) | Listings table grid + status pill text; punchlist useMemo + PunchlistPanel CTA wiring |
| `frontend/src/features/notifications/NotificationsPanel.tsx` | Modify (Section 3) | Notification row markup rebuild |
| `frontend/src/lib/notifications.ts` | Modify (Section 3) | Extend `Notification` type with optional `listing_image`, `listing_price`, `selected_pickup_slots`, `confirmed_time` fields |

No new files. No deletions.

---

## Commit Strategy

| # | Subject | Tasks |
|---|---|---|
| (existing) `8559516` | docs(myaccount): realignment spec for tweaks 1, 3, 4 | — already committed |
| 1 (new) | `fix(myaccount): right-anchor listings table + lock status column edge` | Task 1 |
| 2 (new) | `feat(myaccount): broaden punchlist to buyer-side pickups within 1h window` | Task 2 |
| 3 (new) | `feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade` | Task 3 |

Each new commit:
- Stays on `chore/myaccount-misc-tweaks`
- Is created with `git commit`, NEVER `--amend`
- Builds + typechecks clean on its own

---

## Task 1: Listings table — right-anchor + lock column edges + drop Package icon

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — Selling and Buying tables inside `OverviewListingsPanel`, plus their skeleton-state headers.

### Background

Current grid template (set in commit `66503ac`):
```
grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)]
```
- 6 occurrences in the file (2 tables × 3 markup sites each: header + skeleton header + row).
- Price + Status share a single `auto` cell wrapped in `<div className="flex items-center gap-2">`.
- Confirmed-ticking pill renders `<Package className="size-3" aria-hidden /> {sellerCountdown.label}`.

New target:
```
grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3
```
- Item gets `1fr` and eats remaining width (pushes Price + Status to the right).
- Price column min-56px, grows to content.
- Status column min-108px (room for "Pickup in 2h 14m"), grows to content.
- Column gap reduces from `gap-x-4` to `gap-x-3` everywhere on this grid.
- Each value gets its own grid cell — drop the flex wrapper.
- Confirmed-ticking pill renders `Pickup in {sellerCountdown.label}` text only — no icon.

### Steps

- [ ] **Step 1: Locate the 6 grid-template occurrences**

Run: `grep -n "grid-cols-\[minmax(0,2fr)_auto_minmax(0,1fr)\]" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: 6 line numbers across the Selling/Buying tables + skeletons. Read each one in context to understand the row/header structure.

- [ ] **Step 2: Update the Selling table header**

Find the Selling table header (one of the 6 lines from Step 1, in the Selling branch of the conditional). Replace the entire `<div ...>...</div>` block with:

```tsx
<div className="grid grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
  <span>Item</span>
  <span>Price</span>
  <span>Status</span>
</div>
```

Removed: the flex-pair wrapper for Price + Status, the trailing `<div aria-hidden="true" />` spacer.

- [ ] **Step 3: Update the Selling table row markup**

Find the Selling row `<button>` element. Replace its `className` grid template to match Step 2 and adjust the body:

```tsx
<button
  key={listing.id}
  onClick={/* unchanged */}
  disabled={!isClickable}
  className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
>
  <div className="flex items-center gap-3 min-w-0">
    {/* existing thumbnail + community subtitle + title — UNCHANGED */}
  </div>
  <span className="text-sm font-bold text-ink tabular-nums">${listing.price}</span>
  <span className={`text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
    cta === "expired" || isCompleted
      ? "bg-surface-strong text-muted"
      : cta === "default"
        ? "bg-primary-soft text-primary"
        : "bg-primary text-on-primary"
  }`}>
    {isConfirmedTicking ? null : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
    {isConfirmedTicking ? `Pickup in ${sellerCountdown.label}` : statusLabel}
  </span>
</button>
```

Removed:
- The flex-pair wrapper `<div className="flex items-center gap-2">`.
- The trailing `<div aria-hidden="true" />` spacer.
- `text-right` from the Price span.
- `justify-self-end` from the Status pill span.
- `<Package />` icon usage in the pill (import handled in Step 8).

Kept:
- The dot decoration on non-ticking states.
- All existing color logic.
- Item cell unchanged.

- [ ] **Step 4: Update the Selling table skeleton-state header**

The Selling block has an `isLoadingMyListings && myListings.length === 0` branch that contains its own header markup. Apply the same grid template + simplified column structure to that branch's header — same JSX as Step 2.

- [ ] **Step 5: Update the Buying table header**

Find the Buying table header inside the `listingsTab !== "selling"` branch. Apply the same change as Step 2:

```tsx
<div className="grid grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted uppercase tracking-wider pb-2 border-b border-hairline">
  <span>Item</span>
  <span>Price</span>
  <span>Status</span>
</div>
```

- [ ] **Step 6: Update the Buying table row markup**

Find the Buying row `<button>` element. Replace its body with:

```tsx
<button
  key={order.id}
  onClick={/* unchanged */}
  disabled={!isClickable}
  className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
>
  <div className="flex items-center gap-3 min-w-0">
    {/* existing thumbnail + community subtitle + title — UNCHANGED */}
  </div>
  <span className="text-sm font-bold text-primary tabular-nums">${order.listing_price}</span>
  <span className={`text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
    viewState === "declined" || viewState === "withdrawn" || viewState === "expired"
      ? "bg-surface-strong text-muted"
      : viewState === "cancelledBySeller" || viewState === "waitingForOther"
        ? "bg-warning/10 text-warning"
        : "bg-primary text-on-primary"
  }`}>
    {isConfirmedTicking ? null : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
    {isConfirmedTicking ? `Pickup in ${countdown.label}` : statusLabel}
  </span>
</button>
```

Same removals as Step 3. The Buying price keeps `text-primary` (existing styling); only the alignment classes change.

- [ ] **Step 7: Update the Buying table skeleton-state header**

Same as Step 4 but for the Buying skeleton branch.

- [ ] **Step 8: Drop the `Package` import if no longer used**

Run: `grep -n "Package" frontend/src/pages/MyAccount/MyAccountPage.tsx`

If `Package` is only referenced inside the now-removed pill markup (it was added in commit `4d9c190`), remove it from the `lucide-react` import line at the top of the file. If `Package` is used elsewhere in the file, keep the import.

- [ ] **Step 9: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 10: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
fix(myaccount): right-anchor listings table + lock status column edge

Replace the 3-col grid (2fr / auto / 1fr-spacer) with
[1fr / minmax(56px,max-content) / minmax(108px,max-content)] gap-x-3.
Item eats the row width, pushing Price and Status to the right edge.
Min-widths on Price and Status lock the Status column's left edge at
the same x-position across all rows regardless of pill content
length. Each value gets its own grid cell — no more flex wrapper or
trailing spacer.

Drop the Package icon from the confirmed-and-ticking status pill in
favor of literal "Pickup in {label}" text. Other status states keep
their dot decoration. Applies to both Selling and Buying tables plus
their skeleton-state headers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12: Verify commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> fix(myaccount): right-anchor listings table + lock status column edge`

---

## Task 2: Punchlist — broaden to buyer-side pickups with 1h window

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx`
  - `PunchlistPickup` interface (~line 115)
  - `punchlist` useMemo (~line 799)
  - `PunchlistPanel` component (~line 2680+) — props, cats array, item rendering

### Background

Current `PunchlistPickup` shape:
```tsx
interface PunchlistPickup {
  order_id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  slot: string | null;
}
```

Current `useMemo` only includes seller-side expired-countdown orders.

Need: add buyer-side items, surface within 1 hour of pickup, render muted CTA until expired, route to `openRatingModal` on click when expired.

### Steps

- [ ] **Step 1: Extend the `PunchlistPickup` interface**

Find the `PunchlistPickup` interface (~line 115). Replace with:

```tsx
interface PunchlistPickup {
  order_id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  slot: string | null;
  role: "seller" | "buyer";
  pickup_expired: boolean;
  countdown_label: string;
}
```

- [ ] **Step 2: Update the `punchlist` useMemo to include buyer-side pickups**

Find the `useMemo` (~line 799). Replace its body with:

```tsx
const punchlist = useMemo<PunchlistResponse>(() => {
  const mapOrderToPickup = (o: OrderData, role: "seller" | "buyer"): PunchlistPickup => {
    const countdown = getPickupCountdown(o);
    return {
      order_id: o.id,
      listing_id: o.listing_id,
      listing_title: o.listing_title,
      listing_image: o.listing_image ?? null,
      slot: o.confirmed_time ?? null,
      role,
      pickup_expired: countdown.expired,
      countdown_label: countdown.label,
    };
  };

  const sellerPickups = mySellerOrders
    .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).expired)
    .map((o) => mapOrderToPickup(o, "seller"));

  // Buyer surfaces 1h ahead of pickup; CTA stays muted until expired.
  const buyerPickups = myPurchases
    .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
    .map((o) => mapOrderToPickup(o, "buyer"));

  return {
    pickups_to_confirm: [...sellerPickups, ...buyerPickups],
    offers_to_review: myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0),
    draft_listings: myListings.filter((l) => l.status === "draft"),
    unread_messages: [],
  };
}, [mySellerOrders, myPurchases, myListings, getPickupCountdown]);
```

Note: `myPurchases` is added to the deps array.

- [ ] **Step 3: Extend `PunchlistPanel` props**

Find `PunchlistPanel`'s prop type (~line 2685). Add three new props:

```tsx
function PunchlistPanel({
  punchlist,
  punchlistLoaded,
  onConfirmPickup,
  openOrderModal,
  openEditListing,
  openRatingModal,
  myPurchases,
}: {
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
  onConfirmPickup: (p: PunchlistPickup) => void;
  openOrderModal: (l: MyListing) => void;
  openEditListing: (l: MyListing) => void;
  openRatingModal: (o: OrderData) => void;
  myPurchases: OrderData[];
}) {
```

`openRatingModal` is the existing handler for the rating modal; `myPurchases` provides the order lookup when a buyer-side punchlist item is clicked.

- [ ] **Step 4: Update the `cats` array `pickups.onAction` handler**

Inside `PunchlistPanel`, find the `cats` array (~line 2697). Replace the `pickups` entry's `onAction` with:

```tsx
{
  id: "pickups",
  label: "Confirm pickups",
  icon: CalendarCheck,
  items: punchlist?.pickups_to_confirm ?? [],
  cta: "Confirm slot",
  onAction: (item: PunchlistPickup) => {
    if (item.role === "seller") {
      onConfirmPickup(item);
      return;
    }
    // Buyer side
    if (!item.pickup_expired) return;  // disabled until slot passes
    const order = myPurchases.find((o) => o.id === item.order_id);
    if (order) openRatingModal(order);
  },
},
```

- [ ] **Step 5: Update the JSX call site to pass new props**

Find `<PunchlistPanel ... />` in the page-level component (~line 1609). Add the new props:

```tsx
<PunchlistPanel
  punchlist={punchlist}
  punchlistLoaded={punchlistLoaded}
  onConfirmPickup={handleConfirmPunchlistPickup}
  openOrderModal={openOrderManagement}
  openEditListing={openEditListing}
  openRatingModal={openRatingModal}
  myPurchases={myPurchases}
/>
```

Both `openRatingModal` and `myPurchases` are already defined at the page level (used elsewhere in the same file).

- [ ] **Step 6: Render muted CTA for upcoming buyer pickups**

Find the pickup item rendering inside `PunchlistPanel`. The item-row JSX currently invokes `cat.onAction(it)` via a button. Search for where this happens (likely a `cat.cta` button reference, near `cat.items.map`). Locate the pickup-item branch and replace its action button with:

```tsx
{cat.id === "pickups" && pickup ? (
  pickup.role === "buyer" && !pickup.pickup_expired ? (
    <button
      type="button"
      disabled
      className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-surface-strong text-muted text-[11px] font-semibold cursor-not-allowed"
    >
      Pickup in {pickup.countdown_label}
    </button>
  ) : (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); cat.onAction(pickup); }}
      className={`inline-flex items-center justify-center h-7 px-3 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
    >
      Confirm pickup
    </button>
  )
) : (
  /* existing non-pickup CTA — UNCHANGED */
)}
```

Important: search for the exact existing button JSX inside `PunchlistPanel` first (grep `cat.cta` or `cat.onAction(`) — different layouts may need slight adjustments. Preserve all other category CTAs untouched (offers, drafts, messages).

- [ ] **Step 7: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 8: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
feat(myaccount): broaden punchlist to buyer-side pickups within 1h window

Extend PunchlistPickup with role / pickup_expired / countdown_label
fields. The useMemo now combines seller-side expired-countdown items
with buyer-side items where the countdown is ≤1 hour out (or already
expired).

Buyer-side CTAs render as a disabled "Pickup in {label}" button
until the slot passes, then activate to "Confirm pickup" which opens
the rating modal via lookup against myPurchases. Seller-side CTAs
are unchanged.

PunchlistPanel receives openRatingModal and myPurchases as new
props to support the buyer click handler.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Verify commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> feat(myaccount): broaden punchlist to buyer-side pickups within 1h window`

---

## Task 3: Notification anatomy rebuild

**Files:**
- Modify: `frontend/src/lib/notifications.ts` — extend `Notification` type
- Modify: `frontend/src/features/notifications/NotificationsPanel.tsx` — row markup rebuild + helpers

### Background

Current notification row at `NotificationsPanel.tsx:93–145` uses:
- 36×36 avatar (`related_user_picture`) OR icon-tile fallback
- `text-ink` / `text-muted` color toggle on title and body for read state
- `bg-canvas` (unread) / `bg-surface-soft` (read) row background
- No jade price emphasis, no pickup-window structure

New target:
- 40×40 rounded-md ListingImage slot (or icon-tile fallback when no `listing_image`)
- Title: always `text-ink font-bold`, with `$XXX` matches wrapped in `<span className="text-primary">`
- New pickup row below title (CalendarCheck icon + dot-separated window list) — rendered only when notification has pickup data
- Read state: `bg-surface-strong` row + `opacity-[0.35]` on body wrapper

### Steps

- [ ] **Step 1: Read the existing NotificationRow JSX before editing**

Run: `cat frontend/src/features/notifications/NotificationsPanel.tsx | sed -n '85,180p'`

Capture the exact existing markup — particularly:
- The `FOCUS_RING` constant or className string used by the join-request accept/reject buttons.
- The `countdownDisplay` ref and the address-released countdown badge JSX.
- Any other handlers passed to inner elements that you'll need to preserve.

These must round-trip identically in Step 5.

- [ ] **Step 2: Extend the `Notification` type with optional fields**

Find the `Notification` type in `frontend/src/lib/notifications.ts` (~line 26). Replace with:

```tsx
export type Notification = {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  community_id: number | null;
  related_user_id: string | null;
  related_user_name: string | null;
  related_user_picture: string | null;
  join_request_status: string | null;
  listing_id: string | null;
  created_at: string | null;
  // Optional fields — populated by backend for listing-related notifications.
  // Frontend renders enriched anatomy when present; falls back gracefully when absent.
  listing_image?: string | null;
  listing_price?: string | null;
  selected_pickup_slots?: { date: string; time: string }[] | null;
  confirmed_time?: string | null;
};
```

- [ ] **Step 3: Add the `formatPickupWindows` and `renderTitleWithJadePrice` helpers**

In `frontend/src/features/notifications/NotificationsPanel.tsx`, after the existing `formatRelativeTime` helper (~line 50), add:

```tsx
// Format pickup data for the notification row. Returns null if no data;
// otherwise returns a dot-separated string of pickup windows. If
// confirmed_time is set, that single time wins over the proposed slots.
function formatPickupWindows(n: Notification): string | null {
  if (n.confirmed_time) {
    return n.confirmed_time;
  }
  if (n.selected_pickup_slots && n.selected_pickup_slots.length > 0) {
    return n.selected_pickup_slots
      .map((s) => `${s.date} ${s.time}`)
      .join(" · ");
  }
  return null;
}

// Wrap "$XXX" matches in a jade-colored span so price tokens pop within
// the title. Multiple matches all get wrapped. Returns React nodes — keep
// non-match text as plain strings so font-bold inheritance works.
function renderTitleWithJadePrice(title: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\$\d[\d,]*(?:\.\d{2})?/g;
  let lastIndex = 0;
  for (const match of title.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(title.slice(lastIndex, index));
    }
    parts.push(
      <span key={index} className="text-primary">{match[0]}</span>
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < title.length) {
    parts.push(title.slice(lastIndex));
  }
  return parts;
}
```

- [ ] **Step 4: Update imports**

At the top of `NotificationsPanel.tsx`, update the React import to include `ReactNode`:

```tsx
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
```

Update the lucide-react import to add `CalendarCheck`:

```tsx
import { Bell, X, Check, CheckCircle, CalendarCheck } from "lucide-react";
```

Add the `ListingImage` import below the existing component imports:

```tsx
import { ListingImage } from "../../components/ui/ListingImage";
```

- [ ] **Step 5: Rebuild the notification row JSX**

Find the row JSX inside the `NotificationRow` component (~line 93). Replace the entire `<div ...>` row block (from `<div className="relative flex gap-3 ...">` through its closing `</div>`) with:

```tsx
return (
  <div
    className={`relative flex gap-3 px-4 py-3 border-b border-hairline transition-colors ${
      isUnread ? "bg-canvas" : "bg-surface-strong"
    } ${rowClickable ? "cursor-pointer hover:bg-surface-strong" : "hover:bg-surface-strong"}`}
    onClick={onClick}
  >
    {isUnread && (
      <span
        aria-hidden="true"
        className="absolute top-3 right-3 size-2 rounded-full bg-primary"
      />
    )}

    {/* Icon slot: listing thumbnail (40x40) for listing-related notifications,
        existing avatar/icon tile fallback for non-listing types. */}
    {n.listing_image ? (
      <ListingImage src={n.listing_image} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
    ) : isJoinRequest && n.related_user_picture ? (
      <img
        src={n.related_user_picture}
        alt=""
        className="size-10 rounded-md object-cover shrink-0"
      />
    ) : (
      <div className={`size-10 rounded-md flex items-center justify-center shrink-0 ${visuals.bgClass}`}>
        <Icon className={visuals.iconClass} />
      </div>
    )}

    {/* Body wrapper: read state gets opacity-[0.35]. */}
    <div className={`flex-1 min-w-0 pr-4 ${isUnread ? "" : "opacity-[0.35]"}`}>
      <p className="text-sm font-bold text-ink leading-snug">
        {renderTitleWithJadePrice(n.title)}
      </p>

      {/* Pickup row — rendered only when notification carries pickup data. */}
      {(() => {
        const pickupLabel = formatPickupWindows(n);
        if (!pickupLabel) return null;
        return (
          <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-ink leading-snug">
            <CalendarCheck className="size-3 text-ink shrink-0" aria-hidden />
            <span>{pickupLabel}</span>
          </div>
        );
      })()}

      {/* Existing message line — preserved when distinct from title. */}
      {n.message && n.message !== n.title && (
        <p className="text-sm text-ink line-clamp-2 mt-1">{n.message}</p>
      )}

      <div className="text-xs text-muted-soft mt-1">{formatRelativeTime(n.created_at)}</div>

      {/* Join-request accept/reject buttons — PRESERVE the exact existing
          markup captured in Step 1. The two buttons stay inside this body
          wrapper so they also inherit the opacity-[0.35] read-state fade. */}
      {/* PASTE the existing join-request button block here, unchanged */}

      {/* Address-released countdown badge — PRESERVE the exact existing
          countdownDisplay block captured in Step 1. */}
      {/* PASTE the existing countdownDisplay block here, unchanged */}
    </div>
  </div>
);
```

The two `/* PASTE ... */` sections must be replaced with the exact JSX you captured in Step 1. Do not paraphrase — copy the existing strings verbatim, including the `FOCUS_RING` constant references and any other handlers.

- [ ] **Step 6: Sanity-check the file**

Run: `grep -n "text-muted\|text-body" frontend/src/features/notifications/NotificationsPanel.tsx`

Compare results against the new code. Any remaining matches should be intentional:
- `text-muted-soft` on the timestamp line — keep.
- Any other appearances in code paths NOT touched by Step 5 — keep.

If you find a lingering `text-muted` on the title or body conditional from the prior implementation that you missed, remove it.

- [ ] **Step 7: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

If you see an error about `ReactNode` not exported from `react`, change the helper signatures to use `JSX.Element[]` instead and wrap the returned array in a fragment at call site:

```tsx
function renderTitleWithJadePrice(title: string): JSX.Element[] | string {
  // adjust return shape accordingly
}
```

But the `type ReactNode` import from Step 4 should work without that fallback in React 18.

- [ ] **Step 8: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/notifications.ts frontend/src/features/notifications/NotificationsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade

Replaces the prior text-muted color swap (c95311e) with a full
notification anatomy redesign:

- 40x40 ListingImage in the icon slot for listing-related
  notifications; falls back to the existing icon tile / join-request
  avatar for non-listing types.
- Title is always text-ink font-bold; "$XXX" matches in the title
  string get wrapped in a text-primary (jade) span via client-side
  regex. Multiple matches all wrap.
- New pickup row below the title: CalendarCheck icon + dot-separated
  list of pickup windows from selected_pickup_slots. If
  confirmed_time is set, that single time wins. Renders only when
  the notification carries pickup data.
- Read state: row background bumps from bg-surface-soft to
  bg-surface-strong (#EAEAEA). Body content wrapper drops to
  opacity-[0.35] when read. Icon slot stays full strength.

Extends Notification type with optional listing_image, listing_price,
selected_pickup_slots, confirmed_time fields. Backend needs to
populate these for full enriched rendering; until then, listing
notifications fall back to the icon-tile + no-pickup-row path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Verify commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade`

---

## Final verification (after all three new commits land)

- [ ] **Final A: Branch state**

Run: `git log dev..HEAD --oneline`

Expected: 8 commits in order (newest at top):
```
<hash>  feat(notifications): rebuild row anatomy ...
<hash>  feat(myaccount): broaden punchlist to buyer-side ...
<hash>  fix(myaccount): right-anchor listings table + lock ...
8559516 docs(myaccount): realignment spec for tweaks 1, 3, 4
c95311e style(notifications): fade read notification text to muted
fecd640 fix(myaccount): derive punchlist client-side from loaded data
8d1dad2 feat(myaccount): rank Selling listings by action urgency
66503ac style(myaccount): left-align price/status with tight pairing
```

- [ ] **Final B: Build + typecheck**

```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

Both exit 0.

- [ ] **Final C: Manual smoke (handled by the user, not the implementer)**

Document in the PR description that user should verify:
- Listings table — Status pill's left edge aligns at the same x-position across rows. Pill on confirmed-ticking order reads "Pickup in 2h 14m".
- Punchlist — a buyer-side confirmed order ≤1 hour to pickup surfaces with a muted "Pickup in 47m" disabled CTA; once expired the CTA activates to "Confirm pickup" and opens the rating modal.
- Notification — listing thumbnail visible in the icon slot for listing-related types; `$XXX` in title renders jade; pickup row renders with CalendarCheck + window list when data exists; read state has #EAEAEA background and opacity-0.35 body.

---

## Self-Review

**Spec coverage:**
- Section 1 (listings table) → Task 1 ✓
- Section 2 (punchlist broaden) → Task 2 ✓
- Section 3 (notification rebuild) → Task 3 ✓
- "Approach to landing the change" → Three-commit-stack-on-top approach used ✓

**Placeholder scan:** No TBD/TODO. Each step has concrete code or a concrete command. The two `/* PASTE ... */` markers in Task 3 Step 5 are explicit instructions to copy verbatim from Step 1's read-out — they're a Read-before-Write requirement, not placeholders.

**Type consistency:**
- `PunchlistPickup` shape used identically in Task 2 Step 1 (interface), Step 2 (mapOrderToPickup return), Step 4 (onAction param), Step 6 (rendering). ✓
- `Notification` shape extended in Task 3 Step 2, consumed in Step 5 with the new optional fields. ✓
- `openRatingModal: (o: OrderData) => void` signature used in Task 2 Step 3 (prop type), Step 4 (call site), Step 5 (JSX site). ✓

**One known fragility:** Task 3 Step 5's join-request buttons + countdownDisplay must be pasted verbatim from Step 1's read-out. Mitigated by making Step 1 explicit about capturing them first.

**No spec gaps found.**
