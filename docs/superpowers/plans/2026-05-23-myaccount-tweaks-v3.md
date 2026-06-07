# MyAccount Tweaks v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land 6 refinement items on `chore/myaccount-misc-tweaks` after smoke-testing the prior realignment surfaced rough edges. All changes are in one file (`MyAccountPage.tsx`); split across 2 commits for review hygiene.

**Architecture:** Two new commits stacked on top of branch tip `a8fa71d`. Commit 1 is the visual-polish bundle (status pill widths + Communities subheader). Commit 2 is the punchlist refactor (full symmetry + real-time tick + clickable rows + seller bug fix + cleanup of orphaned `onConfirmPickup` prop). No amends, no reset, no force-push.

**Tech Stack:** React 18, TypeScript, Tailwind v4. No new dependencies. No backend changes.

**Spec:** `docs/superpowers/specs/2026-05-23-myaccount-tweaks-v3-design.md` (committed `a8fa71d`).

**Branch state at plan start:** `chore/myaccount-misc-tweaks` is 10 commits ahead of dev (4 prior tweaks + 2 docs + 3 realignment + this spec).

```
a8fa71d docs(myaccount): v3 refinement spec for 6 in-scope items
884dd00 feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade
1ca0d67 feat(myaccount): broaden punchlist to buyer-side pickups within 1h window
9fa74d8 fix(myaccount): right-anchor listings table + lock status column edge
2d6243d docs(myaccount): implementation plan for tweaks realignment
8559516 docs(myaccount): realignment spec for tweaks 1, 3, 4
c95311e style(notifications): fade read notification text to muted
fecd640 fix(myaccount): derive punchlist client-side from loaded data
8d1dad2 feat(myaccount): rank Selling listings by action urgency
66503ac style(myaccount): left-align price/status with tight pairing
```

After this plan: 12 commits ahead of dev.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `frontend/src/pages/MyAccount/MyAccountPage.tsx` | Modify (both tasks) | Grid templates, Communities subheader, punchlist useMemo + dep, PunchlistPanel props + JSX + handler, row-body button wrap, callsite prop changes |

No other files touched. No new dependencies.

---

## Commit Strategy

| # | Subject | Tasks |
|---|---|---|
| 1 (new) | `style(myaccount): drop status column min-widths + standardize Communities subheader` | Task 1 |
| 2 (new) | `refactor(myaccount): punchlist full symmetry + real-time tick + clickable rows + seller bug fix` | Task 2 |

---

## Task 1: Visual polish — status pill widths + Communities subheader

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx`

### Background

**Section 1 (status pill widths):** Current grid template appears 6× in the file:
```
grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)]
```
The min-widths force short pills (e.g., "Live") to sit inside an oversized cell. Drop both min-widths so each pill is content-width.

**Section 6 (Communities subheader):** `MyAccountPage.tsx:2308-2313` uses `<h2>` with label-style classes. Standardize to `<h3>` + `PANEL_TITLE` to match Your Listings / Punchlist.

### Steps

- [ ] **Step 1: Verify the 6 grid-template occurrences**

Run: `grep -n "grid-cols-\[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)\]" frontend/src/pages/MyAccount/MyAccountPage.tsx`

Expected: 6 line numbers (Selling header/skeleton-header/row + Buying header/skeleton-header/row).

- [ ] **Step 2: Replace all 6 occurrences**

For each of the 6 matches, change:

```
grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)]
```

To:

```
grid-cols-[minmax(0,1fr)_max-content_max-content]
```

Use a find-and-replace pass across the file — every instance is the same string, no per-site variation.

- [ ] **Step 3: Update the Communities subheader**

Find `MyAccountPage.tsx` line 2308 — the `<h2>` for "Communities" inside `OverviewCommunitiesRow`. Replace:

```tsx
<h2 className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted">
  Communities
  {!isEmpty && communitiesLoaded && (
    <span className="text-muted font-normal ml-1">({communities.length})</span>
  )}
</h2>
```

With:

```tsx
<h3 className={`text-base ${PANEL_TITLE}`}>
  Communities
  {!isEmpty && communitiesLoaded && (
    <span className="text-muted font-normal text-sm ml-1.5">({communities.length})</span>
  )}
</h3>
```

Changes:
- `<h2>` → `<h3>` (semantic match with sibling panel titles).
- Class string: `text-[11px] font-semibold tracking-[0.18em] uppercase text-muted` → `` `text-base ${PANEL_TITLE}` `` (which expands to `text-base font-semibold text-ink tracking-tight`).
- Inner count `<span>`: gains `text-sm` (so it doesn't shrink relative to the new `text-base` parent) and `ml-1.5` (replacing `ml-1`).

`PANEL_TITLE` is already imported at the top of the file (line 41). No new imports needed.

- [ ] **Step 4: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

- [ ] **Step 5: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
style(myaccount): drop status column min-widths + standardize Communities subheader

Status pill columns no longer enforce a 56px / 108px minimum width
— each pill (and the price) wraps to its actual content. Short
status labels like "Live" no longer sit inside an oversized cell.
The trade-off: the Status column's left edge will shift per row
based on pill content length. User explicitly accepted this — the
column-locked alignment felt artificial when shorter pills had
visible empty space.

Communities subheader changes from a tiny tracked-uppercase label
(<h2>) to the panel-title style (<h3> + PANEL_TITLE) used by Your
Listings and Punchlist. Now visually consistent across the
Overview tab.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> style(myaccount): drop status column min-widths + standardize Communities subheader`

---

## Task 2: Punchlist refactor — symmetry + tick + clickable rows + seller fix

**Files:**
- Modify: `frontend/src/pages/MyAccount/MyAccountPage.tsx` — multiple sites:
  - `punchlist` useMemo (~line 801) — Section 2 (filter) + Section 3 (deps)
  - `<PunchlistPanel ... />` JSX call site (~line 1628) — drop `onConfirmPickup`, add `mySellerOrders` + `openConfirmedOrderSummary`
  - `PunchlistPanel` component (~line 2718) — prop type, cats[0].onAction handler rewrite, row body button wrap

### Background

**Section 2:** seller filter currently requires `.expired === true`. Change to `.diff <= 3600000` for symmetry with buyer.

**Section 3:** punchlist useMemo doesn't depend on `countdownTick`, so labels don't re-render every minute. Add the dep.

**Section 4:** rows are not clickable today — only the CTA button. Wrap the row body in a `<button>`, route to `openConfirmedOrderSummary` (pickups), `openOrderModal` (offers), `openEditListing` (drafts). CTA needs `e.stopPropagation()`.

**Section 5:** seller "Confirm pickup" currently calls `openOrderManagement(listing)` (wrong — pending-orders modal). Move to `openRatingModal(order)` after looking up the seller order in `mySellerOrders`. The `onConfirmPickup` prop becomes orphaned and should be removed.

### Steps

- [ ] **Step 1: Update the `punchlist` useMemo**

Find the useMemo block at ~line 801. Replace its body with:

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

  // Seller and buyer both surface within 1 hour of pickup OR already expired.
  // CTA stays muted ("Pickup in {label}") until expired; activates to
  // "Confirm pickup" → openRatingModal post-expiry.
  const sellerPickups = mySellerOrders
    .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).diff <= 3600000)
    .map((o) => mapOrderToPickup(o, "seller"));

  const buyerPickups = myPurchases
    .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
    .map((o) => mapOrderToPickup(o, "buyer"));

  return {
    pickups_to_confirm: [...sellerPickups, ...buyerPickups],
    offers_to_review: myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0),
    draft_listings: myListings.filter((l) => l.status === "draft"),
    unread_messages: [],
  };
}, [mySellerOrders, myPurchases, myListings, getPickupCountdown, countdownTick]);
```

Changes from the current code:
- Seller filter uses `getPickupCountdown(o).diff <= 3600000` (was `.expired`).
- Deps array adds `countdownTick` at the end.
- Defensive `Number(o.id)` coercion dropped — `OrderData.id` is typed `number`, so just use `o.id`.

If `Number(o.id)` previously wrapped `o.id` in `mapOrderToPickup`, change `order_id: o.id ? Number(o.id) : 0` to `order_id: o.id`.

- [ ] **Step 2: Update the `<PunchlistPanel ... />` JSX call site**

Find the JSX call site at ~line 1628. Replace with:

```tsx
<PunchlistPanel
  punchlist={punchlist}
  punchlistLoaded={punchlistLoaded}
  openOrderModal={openOrderManagement}
  openEditListing={openEditListing}
  openRatingModal={openRatingModal}
  openConfirmedOrderSummary={openConfirmedOrderSummary}
  mySellerOrders={mySellerOrders}
  myPurchases={myPurchases}
/>
```

Changes:
- Drop `onConfirmPickup={...}` entirely.
- Add `openConfirmedOrderSummary={openConfirmedOrderSummary}` for the row-body click on pickups.
- Add `mySellerOrders={mySellerOrders}` so seller orders can be looked up at click time.

`openConfirmedOrderSummary` is already defined at the page level — used by the Buying-table row clicks. `mySellerOrders` is state already in scope.

- [ ] **Step 3: Update the `PunchlistPanel` prop type**

Find `PunchlistPanel`'s signature at ~line 2718. Replace with:

```tsx
function PunchlistPanel({
  punchlist,
  punchlistLoaded,
  openOrderModal,
  openEditListing,
  openRatingModal,
  openConfirmedOrderSummary,
  mySellerOrders,
  myPurchases,
}: {
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
  openOrderModal: (l: MyListing) => void;
  openEditListing: (l: MyListing) => void;
  openRatingModal: (o: OrderData) => void;
  openConfirmedOrderSummary: (listingId: string) => void;
  mySellerOrders: OrderData[];
  myPurchases: OrderData[];
}) {
```

Removed: `onConfirmPickup`.
Added: `openConfirmedOrderSummary`, `mySellerOrders`.

- [ ] **Step 4: Update the `cats[0].onAction` handler for pickups**

Find the `cats` array inside `PunchlistPanel` (~line 2742). Replace the `pickups` entry's `onAction` with:

```tsx
{
  id: "pickups",
  label: "Confirm pickups",
  icon: CalendarCheck,
  items: punchlist?.pickups_to_confirm ?? [],
  cta: "Confirm slot",
  onAction: (item: PunchlistPickup) => {
    // Disabled until slot passes — both roles.
    if (!item.pickup_expired) return;

    if (item.role === "seller") {
      const order = mySellerOrders.find((o) => o.id === item.order_id);
      if (order) openRatingModal(order);
      return;
    }
    // Buyer side
    const order = myPurchases.find((o) => o.id === item.order_id);
    if (order) openRatingModal(order);
  },
},
```

Both roles now route to `openRatingModal` — that's the Section 2 + Section 5 unified behavior.

- [ ] **Step 5: Add a row-body click handler per category**

Inside `PunchlistPanel`, find the item-rendering loop (search for `cat.items.map` or the `<li>` row markup, ~line 2860+).

Add a helper at the top of the `PunchlistPanel` body, BEFORE the return:

```tsx
const handleRowClick = (cat: { id: string }, item: unknown) => {
  if (cat.id === "pickups") {
    const pickup = item as PunchlistPickup;
    openConfirmedOrderSummary(pickup.listing_id);
    return;
  }
  if (cat.id === "offers") {
    openOrderModal(item as MyListing);
    return;
  }
  if (cat.id === "drafts") {
    openEditListing(item as MyListing);
    return;
  }
  // messages — no-op
};
```

- [ ] **Step 6: Wrap each item's row body in a `<button>`**

In the item-rendering loop, find the existing `<li>` that wraps each item. Inside the `<li>`, wrap the row body (everything EXCEPT the CTA button) in a `<button>` element that fires `handleRowClick`:

The current rendering pattern is approximately:

```tsx
<li className={...}>
  {/* item content: image + text */}
  {/* CTA button */}
</li>
```

Change to:

```tsx
<li className={...}>
  <button
    type="button"
    onClick={() => handleRowClick(cat, it)}
    className="flex-1 flex items-center gap-3 text-left cursor-pointer hover:bg-surface-soft transition-colors rounded-md px-2 -mx-2 py-1 -my-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
  >
    {/* existing item content — image + text — UNCHANGED */}
  </button>
  {/* CTA button — UNCHANGED, but ensure its onClick calls e.stopPropagation() (see Step 7) */}
</li>
```

The `<button>` claims the full content width via `flex-1`. The CTA button stays at the trailing edge of the `<li>` and is a sibling, not nested.

Read the existing rendering carefully — the exact JSX structure may differ from the shorthand above. The key principle: row-body becomes a `<button>` with `handleRowClick`; the CTA stays outside that button.

- [ ] **Step 7: Add `e.stopPropagation()` to every CTA click handler**

Find every CTA button inside `PunchlistPanel`'s item loop. They currently look like:

```tsx
<button
  type="button"
  onClick={() => cat.onAction(it)}
  className="..."
>
  {cat.cta}
</button>
```

Change to:

```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); cat.onAction(it); }}
  className="..."
>
  {cat.cta}
</button>
```

This applies to BOTH the muted "Pickup in {label}" disabled CTA AND the active "Confirm pickup" / "Review offer" / "Resume draft" CTAs. Disabled buttons don't fire onClick, but adding `stopPropagation` is defensive and matches the pattern across all three CTA variants.

Specifically: the muted/disabled CTA for the buyer + seller pickup state should look like:

```tsx
<button
  type="button"
  disabled
  className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-surface-strong text-muted text-[11px] font-semibold cursor-not-allowed"
>
  Pickup in {pickup.countdown_label}
</button>
```

(No onClick needed — disabled buttons don't trigger.)

The active CTA for expired pickups:

```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); cat.onAction(pickup); }}
  className={`inline-flex items-center justify-center h-7 px-3 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
>
  Confirm pickup
</button>
```

And the offers/drafts CTAs follow the same pattern (existing — just add `e.stopPropagation()`).

- [ ] **Step 8: Run typecheck**

Run: `cd frontend && npm run typecheck`

Expected: PASS, exit 0.

Likely TS errors to expect:
- If `onConfirmPickup` was destructured from props but not removed from the prop type, you'll get an unused-binding warning. Remove the prop name from the destructure list.
- If `mySellerOrders` was not passed at the call site, you'll get a missing-prop error. Verify Step 2.

- [ ] **Step 9: Run build**

Run: `cd frontend && npm run build`

Expected: PASS, exit 0.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/MyAccount/MyAccountPage.tsx
git commit -m "$(cat <<'EOF'
refactor(myaccount): punchlist full symmetry + real-time tick + clickable rows + seller bug fix

Section 2 — seller filter changes from .expired to .diff <= 3600000
so sellers and buyers surface within the same 1-hour-ahead window.
Both roles get the muted "Pickup in {label}" disabled CTA until the
slot passes.

Section 3 — punchlist useMemo deps gain countdownTick, so labels
refresh every minute alongside the Listings-table countdown.

Section 4 — punchlist row body is now wrapped in a <button> that
routes by category: pickups → openConfirmedOrderSummary, offers →
openOrderModal, drafts → openEditListing. CTAs add e.stopPropagation
so the row-body click doesn't fire alongside.

Section 5 — seller "Confirm pickup" now opens openRatingModal with
the matched OrderData from mySellerOrders. Previously misrouted to
openOrderManagement (the pending-orders modal). The orphaned
onConfirmPickup prop was removed from PunchlistPanel and its
callsite.

PunchlistPanel gains two new props: openConfirmedOrderSummary
(for row-body clicks on pickups) and mySellerOrders (for the seller
lookup at confirm-click time). The defensive Number(o.id) coercion
in mapOrderToPickup is dropped — OrderData.id is already number.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Verify commit landed**

Run: `git log -1 --oneline`

Expected: `<hash> refactor(myaccount): punchlist full symmetry + real-time tick + clickable rows + seller bug fix`

---

## Final verification (after both new commits land)

- [ ] **Final A: Branch state**

Run: `git log dev..HEAD --oneline`

Expected: 12 commits in order (newest at top):
```
<hash>  refactor(myaccount): punchlist full symmetry + real-time tick + clickable rows + seller bug fix
<hash>  style(myaccount): drop status column min-widths + standardize Communities subheader
a8fa71d docs(myaccount): v3 refinement spec for 6 in-scope items
884dd00 feat(notifications): rebuild row anatomy with listing thumb + jade price + pickup line + stronger read fade
1ca0d67 feat(myaccount): broaden punchlist to buyer-side pickups within 1h window
9fa74d8 fix(myaccount): right-anchor listings table + lock status column edge
2d6243d docs(myaccount): implementation plan for tweaks realignment
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

- [ ] **Final C: Manual smoke (user, not implementer)**

Document in PR description so user verifies:
- Status pills wrap to their text content. "Live" pill is narrow; "Pickup in 2h 14m" pill is wider. Pill column edges shift per row.
- Communities subheader matches Your Listings / Punchlist visually.
- A seller-side confirmed order ≤ 1 hour to pickup surfaces in "Confirm pickups" with a muted "Pickup in 47m" disabled CTA. Once expired, CTA activates to "Confirm pickup" → clicking opens the RATING modal (not the pending-orders modal).
- A buyer-side confirmed order behaves identically.
- Watch a punchlist countdown label tick once per minute.
- Click the row body (not the CTA) on a pickup item — opens OrderConfirmSummaryModal.
- Click the row body on an offers item — opens OrderManagementModal.
- Click the row body on a draft item — opens edit-listing flow.
- CTAs still fire their primary action on click without triggering the row-body navigation.

---

## Self-Review

**Spec coverage:**
- Section 1 (status pill widths) → Task 1 Step 2 ✓
- Section 2 (seller/buyer symmetry) → Task 2 Step 1 (filter change) ✓
- Section 3 (real-time tick) → Task 2 Step 1 (deps array) ✓
- Section 4 (clickable rows) → Task 2 Steps 5, 6, 7 ✓
- Section 5 (seller confirm bug) → Task 2 Steps 4 (new handler) + 2/3 (drop orphaned prop) ✓
- Section 6 (Communities subheader) → Task 1 Step 3 ✓

**Placeholder scan:** No TBD/TODO. Each step has concrete code blocks or grep commands.

**Type consistency:**
- `PunchlistPickup` unchanged from prior commits — interface stays, only the filter that produces it changes. ✓
- `mySellerOrders: OrderData[]` and `myPurchases: OrderData[]` consistent across prop type, destructure, and usage. ✓
- `openConfirmedOrderSummary: (listingId: string) => void` consistent between prop type (Task 2 Step 3) and call site (Task 2 Step 2). ✓
- `openRatingModal: (o: OrderData) => void` consistent across both seller and buyer branches in cats[0].onAction. ✓

**Known fragility:** Task 2 Step 6 says "Read the existing rendering carefully — the exact JSX structure may differ." Mitigated because the implementer touches one file and the surrounding structure is bounded.

**No spec gaps found.**
