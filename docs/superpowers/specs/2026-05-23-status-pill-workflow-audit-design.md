# Status Pill Workflow Audit — Design Spec

**Date:** 2026-05-23
**Branch:** `chore/status-pill-audit` (will cut from `dev` at the implementation step)
**Status:** Awaiting user review.

## Why this spec exists

The MyAccount status pills accumulated organically across PRs #10 and #12. The audit surfaced ~15 distinct labels and at least four inconsistencies between the Overview compact table and the Listings tab card grid. This spec consolidates: removes dead branches, unifies green pill treatment, recolors the mirror "Awaiting" states for parity, adds missing Draft/Sold branches to the compact table, renames "{N} pending" to "{N} offers", and brings Selling card grid label parity with the compact table.

Out of scope: the bigger labels-simplification options (B/C/D from brainstorming) were considered and explicitly rejected — this spec is the minimal-cleanup pitch (Option A) only.

## Goals

1. Universal green pill treatment: every "happy path / in motion" pill renders `bg-primary-soft text-primary` (light green background + jade font). No more solid jade `bg-primary text-on-primary` for status pills.
2. Universal dot: every pill carries the leading colored dot, including "Pickup in {label}" (today suppressed).
3. Mirror states match colors: "Awaiting buyer" on Selling and "Awaiting seller" on Buying both render amber (`bg-warning/10 text-warning`).
4. Surface parity: Selling Listings tab card grid uses the same status label and color logic as the Selling Overview compact table — same listing, same pill on both surfaces.
5. Add missing Draft and Sold branches to the Selling status logic (both surfaces). Both render muted gray.
6. Rename `"${pendingOrderCount} pending"` to `"${pendingOrderCount} offers"` on Selling.
7. Remove the dead `"Confirmed"` fallback branch in the Selling compact table (unreachable after PR #12).
8. Fix the Buying-side bug where `order.status === "completed"` falls to the default jade in the compact table but renders muted in the card grid.

## Non-goals

- Merging mirror "Awaiting" states into a single "Awaiting confirmation" label (Option B from brainstorming).
- Collapsing terminal failure states (Declined / Withdrawn / Expired / Cancelled by seller) into a single "Cancelled" label (Option B).
- Switching to a 5-label universal vocabulary (Option D).
- Backend changes. Pure FE.

---

## Section 1 — Color system

The final palette has exactly three pill treatments. Status pills must ONLY use one of these three classnames:

```
GREEN: "bg-primary-soft text-primary"
AMBER: "bg-warning/10 text-warning"
MUTED: "bg-surface-strong text-muted"
```

No more `bg-primary text-on-primary` (the solid-jade variant) on status pills. That treatment still exists in the design system for other surfaces (e.g., CTA buttons); it's just removed from status pills specifically.

### Which states use which color

**Green — happy path / in motion (no urgent action):**
- Live (Selling)
- "N offers" (Selling — renamed from "N pending")
- Pickup in {label} (Selling + Buying)
- Pickup ready (Selling + Buying)
- Pending (Buying)

**Amber — waiting on the other party or mild urgency:**
- Awaiting buyer (Selling — recolored from green to amber)
- Awaiting seller (Buying)
- Cancelled by seller (Buying)

**Muted — terminal / inactive:**
- Draft (Selling — new branch + new color)
- Sold (Selling — new branch in compact table)
- Completed (Selling + Buying)
- Expired (Selling + Buying)
- Declined (Buying)
- Withdrawn (Buying)

---

## Section 2 — Universal dot

Every status pill renders the colored dot before the label. Today the Selling compact table and card grid suppress the dot when `isConfirmedTicking` is true (line 2625 + 2713 + the card-grid equivalents):

```tsx
{isConfirmedTicking ? null : <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
{isConfirmedTicking ? `Pickup in ${countdown.label}` : statusLabel}
```

Drop the conditional null. Every pill carries the dot:

```tsx
<span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
{isConfirmedTicking ? `Pickup in ${countdown.label}` : statusLabel}
```

---

## Section 3 — Selling compact table (Overview)

`MyAccountPage.tsx` ~line 2572 (`statusLabel`) and ~line 2618 (pill className).

### New `statusLabel` chain

```tsx
const statusLabel = listing.status === "draft"
  ? "Draft"
  : listing.status === "sold"
    ? "Sold"
    : isCompleted
      ? "Completed"
      : isSellerPickupReady
        ? "Pickup ready"
        : isSellerWaitingForBuyer
          ? "Awaiting buyer"
          : isConfirmedTicking
            ? `Pickup in ${sellerCountdown.label}`
            : hasPendingOrders
              ? `${listing.pendingOrderCount} offers`
              : timeInfo.expired
                ? "Expired"
                : "Live";
```

Changes from current:
- `listing.status === "draft"` branch added at the top (was missing).
- `listing.status === "sold"` branch added second (was missing).
- `sellerOrder?.status === "confirmed" ? "Confirmed"` branch REMOVED (dead code post-PR #12).
- `${listing.pendingOrderCount} pending` → `${listing.pendingOrderCount} offers`.

Also collapse the `isConfirmedTicking` ternary at the render site since the label is now baked into the chain. The `<span>` body becomes simply `{statusLabel}` — no more split between `Pickup in {label}` and `statusLabel`.

### New pill className

```tsx
<span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
  statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
    ? "bg-surface-strong text-muted"
    : statusLabel === "Awaiting buyer"
      ? "bg-warning/10 text-warning"
      : "bg-primary-soft text-primary"
}`}>
  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
  {statusLabel}
</span>
```

Note: the className predicate is now driven by `statusLabel` (string compare) rather than the `cta` enum the prior code used. This is the simplest single-source-of-truth pattern; the `cta` value is still used elsewhere (for the row's click behavior and button rendering) and stays.

---

## Section 4 — Selling Listings tab card grid

`MyAccountPage.tsx` ~line 3149 (`statusLabel`) and ~line 3197 (pill rendering).

### Replace the simpler 5-label logic with the full 9-label logic

The current card grid statusLabel:
```tsx
const statusLabel = isCompleted ? "Completed"
  : timeInfo.expired ? "Expired"
  : listing.status === "draft" ? "Draft"
  : listing.status === "sold" ? "Sold"
  : "Live";
```

Becomes the same chain as Section 3 above (full state coverage including pickup states). Copy the chain verbatim from Section 3 — same listing, same pill, regardless of surface.

### Replace the statusClass logic

The current card grid statusClass:
```tsx
const statusClass = isCompleted || timeInfo.expired || listing.status === "sold"
  ? "bg-surface-strong text-muted"
  : listing.status === "draft"
    ? "bg-warning/10 text-warning"
    : "bg-primary text-on-primary";
```

Becomes the same `statusLabel`-driven predicate as Section 3 (copy verbatim). Critically:
- Draft moves from amber → muted.
- Default branch moves from solid `bg-primary text-on-primary` → `bg-primary-soft text-primary`.
- Awaiting buyer gets the amber treatment.

### Pill rendering

The pill `<span>` at line 3197 — keep its position (absolute top-left on the photo) and size classes, just update the className per the new predicate. Universal dot stays (no `isConfirmedTicking` to suppress here).

---

## Section 5 — Buying compact table + card grid

Both surfaces share the same `statusLabel` logic (currently identical at ~line 2673 and ~line 3293). No label changes — Buying labels stay as-is.

### Pill className changes

Two changes to the Buying className predicate:
1. `order.status === "completed"` must be in the muted bucket (currently in compact table at line 2706 it isn't — falls to default solid jade — a bug). Card grid at line 3302 already includes it; aligning compact table to match.
2. The default branch moves from `bg-primary text-on-primary` (solid jade) to `bg-primary-soft text-primary` (light green) — same unification as Selling.

The new Buying pill className (both surfaces):

```tsx
<span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
  viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || order.status === "completed"
    ? "bg-surface-strong text-muted"
    : viewState === "cancelledBySeller" || viewState === "waitingForOther"
      ? "bg-warning/10 text-warning"
      : "bg-primary-soft text-primary"
}`}>
  <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
  {statusLabel}
</span>
```

Same universal-dot treatment — drop the `isConfirmedTicking ? null : ...` conditional.

### Buying-side card grid `isPending` overlay

The Buying card grid has a special-case "PENDING" overlay treatment at ~line 3318 (uppercase tracked-widest jade pill on the photo). This is OUTSIDE the standard status pill — it's a more prominent "this is a live order" treatment for `order.status === "pending"` orders. Out of scope for this spec — leave as-is.

---

## Section 6 — Verification

1. `npm run typecheck` exit 0.
2. `npm run build` exit 0.
3. Manual smoke on a populated test account:
   - **Selling compact table:** all expected states render with correct color (green for in-motion, amber for "Awaiting buyer", muted for terminal/Draft/Sold). "3 offers" appears where "3 pending" used to. "Pickup in 2h 14m" has the dot.
   - **Selling card grid:** same status pill text and color as the compact table for the same listing. Draft listings show "Draft" muted (was amber). All green pills use light-green background + jade text.
   - **Buying compact table + card grid:** Completed orders render muted gray (compact table no longer shows them solid jade). All green pills unified. "Pickup in {label}" has the dot.
   - **No solid jade pills exist anywhere on these surfaces.** A grep for `bg-primary text-on-primary` in the MyAccountPage table/card pill markup should return zero.

## Tech debt to flag (not fixed here)

- The Buying-side `isPending` jade overlay (~line 3318) uses the solid jade treatment intentionally — it's a different visual element from the inline status pill. If a future polish round wants to harmonize ALL "in-motion" indicators to the new light-green treatment, that overlay can be revisited then. Out of scope here.
- The `cta` enum (`getSellerListingCtaState`) is still used for the Selling row's click and button rendering, even though the new statusLabel chain drives pill color independently. This is intentional — two sources of truth (cta for behavior, statusLabel for display) is messier than one but the existing cta logic is complex enough that collapsing isn't justified by this spec. Future cleanup if it gets in the way.
