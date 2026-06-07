# MyAccount Tweaks v3 — Refinement Spec

**Date:** 2026-05-23
**Branch:** `chore/myaccount-misc-tweaks` (currently at 9 commits ahead of dev: 4 prior tweaks + 2 docs + 3 realignment commits)
**Status:** Awaiting user review.

## Why this spec exists

User smoke-tested the realignment (commits `9fa74d8`, `1ca0d67`, `884dd00`) and surfaced 6 items that need refinement on this same branch:

| # | Item | Type |
|---|---|---|
| 1 | Status pills should be content-width per row, not column-locked | Refinement of Tweak 1 |
| 2 | Seller punchlist gets the 1-hour-ahead window like buyer (full symmetry) | Refinement of Tweak 2 |
| 3 | Punchlist countdowns tick in real-time (60s interval) | Refinement of Tweak 2 |
| 4 | Punchlist rows clickable → OrderConfirmSummaryModal (or edit-listing for drafts) | Refinement of Tweak 2 |
| 5 | Seller "Confirm pickup" misrouted to pending orders modal — should open RatingModal | Bug fix on Tweak 2 |
| 7 | Communities subheader (`<h2>` label-style) → standardize to `<h3>` + PANEL_TITLE | Visual polish |

Two further items from the same batch are explicitly **out of scope** — split into separate brainstorming sessions:
- #6 default community = user's neighborhood (needs backend product spec)
- #8 dark mode + color blind modes (multi-PR theming initiative)

## Goals

1. Make status pills wrap snugly to their text content; drop the 108px min-width column lock that's leaving empty cell space for short pills.
2. Full seller/buyer symmetry on punchlist pickup items: both surface within 1 hour of pickup, both get the muted-disabled CTA until expiry, both activate to `RatingModal` post-expiry.
3. Wire the punchlist's countdown labels into the existing `countdownTick` interval so they tick in real-time alongside the Listings table countdown.
4. Make the entire punchlist row body clickable (in addition to the CTA), opening `OrderConfirmSummaryModal` for pickups + offers, `openEditListing` for drafts.
5. Fix the seller-side `onConfirmPickup` handler so it opens `RatingModal` for the seller's order, not the pending-orders modal.
6. Match the Communities section's subheader to the rest of MyAccount's panel titles.

## Non-goals

- Item 6 (neighborhood-default community) — separate spec later.
- Item 8 (dark mode + color blind modes) — separate spec later.
- Any backend changes. All five refinements are pure frontend.

---

## Section 1 — Status pills wrap to content

### Current state (after `9fa74d8`)

```
grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3
```

The `minmax(108px,max-content)` on the Status column forces a minimum 108px slot. Short pills like "Live" or "Sold" sit flush-left inside a 108px cell — visible whitespace to their right. Long pills like "Pickup in 2h 14m" fill the cell naturally.

### New state

Drop the min-widths entirely:

```
grid-cols-[minmax(0,1fr)_max-content_max-content] gap-x-3
```

- Item: `minmax(0,1fr)` — unchanged, eats remaining width.
- Price: `max-content` — wraps to the price text width.
- Status: `max-content` — wraps to the pill's actual content width.

Result: each pill is exactly as wide as its text. Pills no longer share a column edge across rows — the Status column's left edge shifts per row based on Status content length. User explicitly accepted this trade-off: the column-locked alignment we had before felt artificial when shorter pills had visible empty space.

### Applies to both tables + skeleton headers

Same 6 sites as before (Selling header + skeleton + row; Buying header + skeleton + row).

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — six grid-template strings.

---

## Section 2 — Full seller/buyer symmetry on punchlist pickups

### Current state (after `1ca0d67`)

```tsx
const sellerPickups = mySellerOrders
  .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).expired)
  .map((o) => mapOrderToPickup(o, "seller"));

const buyerPickups = myPurchases
  .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
  .map((o) => mapOrderToPickup(o, "buyer"));
```

Seller filter requires `countdown.expired === true` — items only surface post-pickup. Buyer filter uses the `≤ 1 hour` window.

### New state

Sellers and buyers use the same `diff <= 3600000` filter:

```tsx
const sellerPickups = mySellerOrders
  .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).diff <= 3600000)
  .map((o) => mapOrderToPickup(o, "seller"));

const buyerPickups = myPurchases
  .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
  .map((o) => mapOrderToPickup(o, "buyer"));
```

### CTA behavior — same for both roles

Inside `PunchlistPanel`'s pickup rendering:
- If `!pickup.pickup_expired`: render a disabled button reading `Pickup in {pickup.countdown_label}` (muted styling, `cursor-not-allowed`). Regardless of role.
- If `pickup.pickup_expired`: render the active `Confirm pickup` button. Click routes via the `cats[0].onAction` handler.

### Handler routing in `cats[0].onAction`

Both roles route to `openRatingModal`:

```tsx
onAction: (item: PunchlistPickup) => {
  if (!item.pickup_expired) return;  // disabled until slot passes (both roles)
  if (item.role === "seller") {
    const order = mySellerOrders.find((o) => o.id === item.order_id);
    if (order) openRatingModal(order);
    return;
  }
  // Buyer side
  const order = myPurchases.find((o) => o.id === item.order_id);
  if (order) openRatingModal(order);
},
```

The seller branch now looks up the order in `mySellerOrders` and calls `openRatingModal`. This implements Section 5 (the bug fix) inline since the same handler covers both routes.

### `PunchlistPanel` prop changes

`PunchlistPanel` now needs `mySellerOrders: OrderData[]` in addition to the existing `myPurchases: OrderData[]`. Pipe it through at the JSX call site (~line 1628).

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — useMemo filter + PunchlistPanel props + cats[0].onAction handler.

---

## Section 3 — Real-time countdown ticking on the punchlist

### Current state

`countdown_label` is captured at memo time inside `mapOrderToPickup`. It does not re-render on the interval that's already running for the Listings table countdowns.

### Existing tick infrastructure

`MyAccountPage.tsx:366-372`:
```tsx
const [countdownTick, setCountdownTick] = useState(0);
useEffect(() => {
  const timer = setInterval(() => setCountdownTick((p) => p + 1), 60000);
  return () => clearInterval(timer);
}, []);
```

This already ticks `countdownTick` every 60 seconds. The Listings table countdowns use this via the `getPickupCountdown` call (which reads `Date.now()` at render time).

### Fix

Add `countdownTick` to the `useMemo` dependency array so the memo re-runs every minute:

```tsx
const punchlist = useMemo<PunchlistResponse>(() => {
  /* ...existing body... */
}, [mySellerOrders, myPurchases, myListings, getPickupCountdown, countdownTick]);
```

That single dep addition causes the memo to recompute every minute, refreshing the `countdown_label` snapshots on each pickup item. The disabled-state button label updates live alongside.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — one-line dep addition to the punchlist useMemo.

---

## Section 4 — Clickable punchlist rows

### Current state

Inside `PunchlistPanel`, each item is rendered inside a `<li>` that's NOT a button. Only the CTA button at the end of the row reacts to clicks. The rest of the row is dead space.

### New state

Wrap each item's row body in a `<button>` (cleaner accessibility than `<li>` + manual keyboard wiring). Clicking the row body opens:

| Category | Click target | Why |
|---|---|---|
| `pickups` (seller + buyer) | `openConfirmedOrderSummary(item.listing_id)` | The order is confirmed (that's the bucket's gate). The summary modal renders pickup time, address release, role-appropriate context. |
| `offers` | `openOrderModal(listing)` | Offers are PENDING orders — `OrderConfirmSummary` doesn't have data to render for unconfirmed orders. `OrderManagementModal` shows the pending-offers list for the listing, which is the right context. |
| `drafts` | `openEditListing(item)` | Drafts have no order yet — edit-listing flow is the only meaningful destination. |
| `messages` | No-op | No items render today. |

The CTA button keeps its existing primary action (Confirm pickup / Review offer / Resume draft) via `cat.onAction`. Click handlers on the CTA must call `e.stopPropagation()` so the row-body click doesn't ALSO fire.

**Note on `offers` choice:** during brainstorming, the user picked "OrderConfirmSummary modal" for both pickups and offers. On review, that modal isn't designed for pending orders — it expects `confirmed_time` and address-release state which don't exist pre-confirmation. Routing offers to `OrderManagementModal` is the pragmatic match for the user's stated intent ("centralized context modal per row"). Flag for confirmation during spec review.

### Handler addition

`PunchlistPanel` needs `openConfirmedOrderSummary: (listingId: string) => void` as a new prop. It's already in scope at the page level (used by the Buying-table row clicks). Pipe it through. `openOrderModal` (which routes to `openOrderManagement`) is already a prop.

### Visual treatment

- The row gets `cursor-pointer hover:bg-surface-soft transition-colors` to telegraph clickability.
- Keyboard accessibility: if you wrap in `<button>`, native semantics; if you keep `<li>`, add `role="button"` + `tabIndex={0}` + `onKeyDown` for Enter/Space.

Recommendation: wrap each item row in a `<button>` element. Cleaner accessibility, no manual keyboard wiring.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — `PunchlistPanel` prop type, JSX call site, item-row markup.

---

## Section 5 — Seller "Confirm pickup" bug fix

Already covered inside Section 2's `cats[0].onAction` rewrite (seller branch looks up `mySellerOrders` and calls `openRatingModal`).

The page-level `<PunchlistPanel onConfirmPickup={...}>` callsite (`MyAccountPage.tsx:1631-1634`) currently wires:

```tsx
onConfirmPickup={(p) => {
  const listing = myListings.find((l) => l.id === p.listing_id);
  if (listing) openOrderManagement(listing);
}}
```

This was wrong from the start — `openOrderManagement` opens the OrderManagementModal (pending-offers list), not the rating flow.

Section 2's rewrite of `cats[0].onAction` makes the page-level `onConfirmPickup` prop unused for the seller flow. The seller branch now calls `openRatingModal` directly inside `cats[0].onAction`. The `onConfirmPickup` prop becomes orphaned — remove it from the `PunchlistPanel` prop type, remove the callsite prop pass, remove the seller call from inside cats[0].onAction's first branch.

Wait — actually re-read Section 2's new handler: the seller branch calls `openRatingModal(order)` directly. So `onConfirmPickup` is no longer called anywhere. The prop is orphaned and should be removed.

### Cleanup

- Drop `onConfirmPickup: (p: PunchlistPickup) => void` from `PunchlistPanel`'s prop type.
- Drop `onConfirmPickup={...}` from the JSX call site.
- Drop any internal `onConfirmPickup(item)` calls from cats[0].onAction (Section 2's new handler doesn't use it).

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — prop type, callsite, handler body.

---

## Section 6 — Communities subheader standardization

### Current state

`MyAccountPage.tsx:2308-2313`:

```tsx
<h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted">
  Communities
  {!isEmpty && communitiesLoaded && (
    <span className="text-muted font-normal ml-1">({communities.length})</span>
  )}
</h2>
```

Tiny uppercase tracked label style. Doesn't match Your Listings / Punchlist panel titles.

### Reference style

`MyAccountPage.tsx:2493` (Your Listings) and `:2825` (Punchlist):

```tsx
<h3 className={`text-base ${PANEL_TITLE}`}>Your listings</h3>
<h3 className={`text-base ${PANEL_TITLE}`}>Punchlist</h3>
```

Where `PANEL_TITLE = "font-semibold text-ink tracking-tight"` from `constants.ts:21`.

### New state

```tsx
<h3 className={`text-base ${PANEL_TITLE}`}>
  Communities
  {!isEmpty && communitiesLoaded && (
    <span className="text-muted font-normal text-sm ml-1.5">({communities.length})</span>
  )}
</h3>
```

Changes:
- `<h2>` → `<h3>` (semantic match with siblings).
- Label-style classes → `text-base ${PANEL_TITLE}`.
- Count chip inside: kept, but bump from inherited `text-[11px]` to explicit `text-sm` so it doesn't shrink to nothing now that the parent is `text-base`. Add `ml-1.5` for consistent spacing.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx:2308-2313`.

---

## Out of scope (explicitly deferred)

- Item 6 — default community = user's neighborhood. Separate spec: backend stores user neighborhood at signup; service layer auto-creates or auto-joins a community for that neighborhood; UI surfaces it as the default selection in the sell flow + community feed. Probably 2-3 PRs once specced.
- Item 8 — dark mode + color blind modes. Separate spec: Tailwind v4 `@theme` light/dark/color-blind variants, settings UI for mode toggle, persistence (localStorage + optional user profile), accessibility audit across all components. Multi-PR initiative.

---

## Approach to landing the change

Single new commit on top of the existing branch tip. Don't amend prior commits, don't reset. The branch will be 10 commits ahead of dev after this lands.

Commit message:

```
fix(myaccount): v3 refinement — content-width pills, full pickup symmetry, real-time tick, clickable rows, seller-confirm bug, communities subheader
```

(Subject is long; that's fine for a refinement commit that bundles 6 small adjustments. Alternative: split into 2 commits if review prefers — one for pills+subheader (visual polish), one for punchlist refactor (behavior). But all six items are tightly intertwined in the same file edit pass — single commit is cleaner.)

---

## Verification (acceptance criteria)

1. `npm run typecheck` exit 0.
2. `npm run build` exit 0.
3. Manual smoke:
   - **Listings table:** A row with "Live" status has a pill that's content-width (~50px wide), NOT 108px. Scan vertically — Status pills will NOT share a left edge across rows; each is its own width.
   - **Punchlist:** A seller-side confirmed order ≤ 1 hour to pickup surfaces with a muted "Pickup in 47m" disabled CTA. Once expired, CTA activates to "Confirm pickup" → clicking opens the rating modal (NOT the pending-orders modal). Same flow as buyer side.
   - **Punchlist countdown ticks:** Watch a punchlist countdown label change once per minute. Match: the Listings table countdown on the same order ticks in sync.
   - **Punchlist row click:** Clicking the row body (not the CTA button) opens the OrderConfirmSummary modal for pickups + offers; opens the edit-listing flow for drafts.
   - **Communities subheader:** "Communities" matches "Your listings" and "Punchlist" — same size, weight, color, casing.

## Tech debt to flag (not fixed)

- `mapOrderToPickup` still uses `o.id ? Number(o.id) : 0` defensive coercion. `OrderData.id` is typed `number`; the ternary is dead code. Worth simplifying when next touched.
- The dropped `onConfirmPickup` prop from `PunchlistPanel` is a small interface narrowing. No external callers depend on it — only the local JSX in `MyAccountPage.tsx`. Safe to remove.
- `OverviewCommunitiesRow`'s subheader is still labeled `Your communities` in the `aria-label` (line 2304). After matching the visible heading text, consider updating the aria-label to "Communities" for consistency, but only if it doesn't already work for screen-reader semantics.
