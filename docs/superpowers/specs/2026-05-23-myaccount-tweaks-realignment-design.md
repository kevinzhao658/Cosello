# MyAccount Misc Tweaks — Realignment Spec

**Date:** 2026-05-23
**Branch:** `chore/myaccount-misc-tweaks` (currently 4 commits on it: `66503ac`, `8d1dad2`, `fecd640`, `c95311e`, none pushed)
**Status:** Awaiting user review.

## Why this spec exists

The prior batch landed 4 commits but three of them missed the mark on smoke test:
- Tweak 1 (price/status alignment) — Price + Status sit too far left and the Status pill column doesn't lock its left edge across rows, so longer/shorter pills shift the column position per-row.
- Tweak 3 (punchlist) — Filters are too narrow; user expects buyer-side pickup actions surfaced too, with a 1-hour-ahead window.
- Tweak 4 (notification fade) — Color-only `text-muted` swap is too subtle; need stronger contrast AND a richer notification anatomy (listing thumbnail, jade price, CalendarCheck icon, multiple pickup windows, darker read row).

Tweak 2 (Selling listings sort order) is unchanged from the prior batch — keeping `8d1dad2` as-is.

## Goals

1. Rebuild the Listings table so Price + Status sit anchored to the right with locked-left-edge column alignment across all rows. Drop the box icon from the countdown pill in favor of literal text "Pickup in {label}".
2. Broaden the punchlist to cover buyer-side pickups with a 1-hour-ahead surface window. Keep 4 categories (Pickups / Offers / Drafts / Messages-placeholder).
3. Rebuild the notification row anatomy: listing thumbnail, bold-ink-black title with jade-green price, CalendarCheck icon inline with full pickup-window list, dramatically stronger read-state contrast.

## Non-goals

- Re-doing Tweak 2 (sort order). Keep commit `8d1dad2` intact.
- Backend changes. All data needed is already on the client (listing thumbnails are in `OrderData.listing_image`, `MyListing.imageUrl`, and the notification payload likely already carries one — to verify during implementation).
- A separate messages endpoint. The "Respond to messages" punchlist category stays as an empty-state placeholder.

---

## Section 1 — Listings table: right-anchored, column-locked

### Current state (`66503ac`)

```
grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)]
```
- Item 2fr, Price+Status flex pair (auto), trailing 1fr spacer.
- Price + Status are inside a `flex items-center gap-2` div together → variable-width auto column → status pill's x-position shifts per row.

### New state

```
grid-cols-[minmax(0,1fr)_minmax(56px,max-content)_minmax(108px,max-content)] gap-x-3
```

- Col 1 — Item: `minmax(0,1fr)`. Eats remaining width, pushing the other two columns to the right edge of the row.
- Col 2 — Price: `minmax(56px,max-content)`. Min 56px (fits `$XX,XXX`), grows to content if needed.
- Col 3 — Status: `minmax(108px,max-content)`. Min 108px (fits the longest status label including the new `Pickup in 2h 14m`), grows if needed.
- Column gap: `gap-x-3` (12px) between all three columns.
- All cells left-align: Price loses `text-right`, Status pill loses `justify-self-end`.
- Item title truncation stays (`min-w-0 truncate`).
- No flex wrapper around Price + Status anymore — each is its own grid cell.

The min-widths lock the left edge of the Status column across all rows: short pills ("Live") and long pills ("Pickup in 2h 14m") start at the same x-position. Longer pills overflow into the `max-content` budget without shifting their neighbor.

### Status pill — drop the icon, use text

In the current branch (`66503ac`), the confirmed-and-ticking pill renders `<Package /> {countdown.label}`. Change to literal text only:

```tsx
{isConfirmedTicking ? `Pickup in ${sellerCountdown.label}` : statusLabel}
```

No `<Package />` import needed for the table anymore. Other state pills keep their `size-1.5 rounded-full bg-current` dot decoration.

### Applies to both tables

Same grid template + same pill change in:
- Selling table header + row (`OverviewListingsPanel`).
- Buying table header + row.
- Their corresponding skeleton states.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` only.

---

## Section 2 — Punchlist broadened to buyer-side

### Current state (`fecd640`)

```tsx
const punchlist = useMemo<PunchlistResponse>(() => ({
  pickups_to_confirm: mySellerOrders
    .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).expired)
    .map((o) => ({...})),
  offers_to_review: myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0),
  draft_listings: myListings.filter((l) => l.status === "draft"),
  unread_messages: [],
}), [mySellerOrders, myListings, getPickupCountdown]);
```

Only seller-side pickups. Empty if user has no expired-countdown seller orders.

### New state

```tsx
const punchlist = useMemo<PunchlistResponse>(() => {
  const sellerPickups = mySellerOrders
    .filter((o) => o.status === "confirmed" && !o.seller_reviewed && getPickupCountdown(o).expired)
    .map((o) => mapOrderToPunchlistPickup(o, "seller"));

  // Buyer-side: surface confirmed orders within 1 hour of pickup time OR already expired.
  // CTA stays muted until countdown.expired === true.
  const buyerPickups = myPurchases
    .filter((o) => o.status === "confirmed" && !o.buyer_reviewed && getPickupCountdown(o).diff <= 3600000)
    .map((o) => mapOrderToPunchlistPickup(o, "buyer"));

  return {
    pickups_to_confirm: [...sellerPickups, ...buyerPickups],
    offers_to_review: myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0),
    draft_listings: myListings.filter((l) => l.status === "draft"),
    unread_messages: [],
  };
}, [mySellerOrders, myPurchases, myListings, getPickupCountdown]);
```

### `PunchlistPickup` shape extension

Add a `role: "seller" | "buyer"` field to discriminate. Add `pickup_expired: boolean` so the panel renders the right CTA state without re-running the countdown helper.

```tsx
interface PunchlistPickup {
  order_id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  slot: string | null;
  role: "seller" | "buyer";   // NEW
  pickup_expired: boolean;    // NEW — countdown.expired snapshot at memo time
  countdown_label: string;    // NEW — for the muted "Pickup in 47m" display when !expired
}
```

### CTA wiring per role

Inside `PunchlistPanel`'s `cats[0].onAction`, route by role:

```tsx
onAction: (item: PunchlistPickup) => {
  if (item.role === "seller") {
    onConfirmPickup(item);  // existing handler — PickupAttestationModal flow
  } else {
    // buyer side
    if (item.pickup_expired) {
      // Open rating modal — buyer confirms pickup + rates seller
      openRatingModal(/* the corresponding OrderData */);
    } else {
      // No-op until pickup time passes. CTA is disabled.
    }
  }
}
```

To call `openRatingModal`, the buyer pickup item needs to carry enough OrderData fields, OR PunchlistPanel needs to look up the order from `myPurchases` by `order_id`. Implementation: pass `myPurchases` (or a lookup function) as a new prop to PunchlistPanel.

### Visual state for muted buyer pickups

The row item with `role === "buyer"` AND `pickup_expired === false`:
- Shows the listing image + title as normal
- CTA button reads `Pickup in {countdown_label}` (e.g., "Pickup in 47m"), styled as a disabled button (muted color, no hover, no click handler).
- Becomes active "Confirm pickup" once `pickup_expired === true`.

Seller-side pickups stay active (existing behavior — they only enter the bucket after expiry).

### Categories unchanged

- `offers_to_review` — still `myListings.filter((l) => (l.pendingOrderCount ?? 0) > 0)`. Untouched.
- `draft_listings` — still `myListings.filter((l) => l.status === "draft")`. Untouched.
- `unread_messages` — still `[]`. Renders "All clear" forever until a messages endpoint exists.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — useMemo body, PunchlistPickup interface, PunchlistPanel CTA wiring + the new prop for buyer-pickup lookup.

---

## Section 3 — Notification anatomy rebuild

### Current state (`c95311e`)

`frontend/src/features/notifications/NotificationsPanel.tsx` line 119–120:

```tsx
<p className={`text-sm font-semibold line-clamp-1 ${isUnread ? "text-ink" : "text-muted"}`}>{n.title}</p>
<p className={`text-sm line-clamp-2 mt-0.5 ${isUnread ? "text-body" : "text-muted"}`}>{n.message}</p>
```

Color-only swap. Avatar tile, no jade price emphasis, no pickup-window structure, no listing thumbnail.

### New state

**Anatomy (top to bottom):**

1. **Icon slot (40×40, rounded-md, shrink-0):**
   - For listing-related notifications (offer / order confirmed / pickup-ready / rating etc.): renders `<ListingImage src={n.listing_image} size="card" alt="" />` with a soft `border border-hairline` and `rounded-md`. PR #8 + this PR's existing pattern.
   - For non-listing notifications (community invites, system messages): keeps the existing `icon-tile` div with the type-specific Lucide icon. Existing fallback logic at line 113–117 stays.

2. **Title line:**
   ```tsx
   <p className="text-sm font-bold text-ink leading-tight">
     {/* n.title — but with the dollar-price span styled jade */}
   </p>
   ```
   - Weight bumps from `font-semibold` to `font-bold` (700).
   - `text-ink` (#000) — unconditional. No more color toggling.
   - The dollar price token within the title gets wrapped in `<span className="text-primary">` (jade). This requires the title to either come pre-segmented from the backend OR be parsed client-side with a regex that finds `$\d+(?:,\d{3})*(?:\.\d{2})?` and wraps the match in the span. Client-side parsing is the pragmatic call.

3. **Pickup row (only when notification has `selected_pickup_slots` or `confirmed_time`):**
   ```tsx
   <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-ink leading-snug">
     <CalendarCheck className="size-3 text-ink shrink-0" aria-hidden />
     {formatPickupWindows(slots)}
   </div>
   ```
   - `CalendarCheck` icon from `lucide-react` at `size-3` (12px), `stroke-ink`.
   - `formatPickupWindows` joins the array as a dot-separated list: `"Today 5–7pm · Tomorrow 12–2pm · Thu 3–5pm"`. If only one window, just the single string.
   - When `confirmed_time` is set (i.e., post-confirmation), show only that single time instead of the proposed list.

4. **Timestamp:** unchanged — `text-xs text-muted-soft` (#888).

### Read-state treatment

Drop the prior `text-muted` color-swap entirely. Replace with:
- Row background: `bg-surface-strong` (#EAEAEA) instead of `bg-surface-soft` (#F5F5F5).
- Body content wrapper (the flex-col containing title + pickup row + timestamp): `opacity-[0.35]` when `!isUnread`.
- Icon slot stays full strength (so the visual scan of "what type" is preserved).

Result: read items have a darker row background AND a 35%-opacity content block. Strong visual stratification from unread (#FFFFFF row, opaque content).

### Notification type → field mapping

Implementation needs the notification payload to carry:
- `n.listing_image: string | null` — for the icon slot.
- `n.selected_pickup_slots?: { date: string; time: string }[]` and `n.confirmed_time?: string` — for the pickup row.

If the current notification payload doesn't surface these fields, the implementer should:
1. Check the notification type interface (likely `NotificationItem` or similar in `src/features/notifications/`).
2. Either add the fields if they're already returned from the backend, OR fetch them via a client-side join against `myPurchases` / `mySellerOrders` keyed on `n.order_id` / `n.listing_id`.
3. If neither works, the pickup row is conditionally hidden — notification still renders cleanly without it.

This is a flag for the implementer to handle gracefully — don't crash if the data isn't there.

### Files

- `frontend/src/features/notifications/NotificationsPanel.tsx` — entire notification row markup rewrite.

---

## Approach to landing the change (NOT spec content — guidance to writing-plans)

Rather than amending each existing commit, the cleanest path is:
- Keep `8d1dad2` (Tweak 2 — sort) intact.
- Reset the other three commits back to the `8d1dad2` parent, then re-implement Sections 1, 2, 3 as three fresh commits with clearer messages.

Equivalent if `--amend` chains feel painful: add three NEW commits on top of the current branch tip (`c95311e`) that overwrite the relevant code paths. Slightly more commits in the history but the PR review reads the same.

Implementation plan should pick one of these approaches.

---

## Verification (acceptance criteria)

1. `npm run typecheck` exit 0.
2. `npm run build` exit 0.
3. Manual smoke:
   - Listings tab — Selling and Buying tables: Status pill's left edge is at the same x-position across every row regardless of pill content length. Price + Status sit on the right side of the row with whitespace between Item title and Price (~12px gap).
   - Status pill on a confirmed-ticking order reads "Pickup in 2h 14m" (no box icon).
   - Punchlist — if test data has a buyer-side confirmed order with ≤1 hour to pickup, an entry surfaces under "Confirm pickups" with a muted "Pickup in 47m" disabled CTA. Once the slot passes, CTA becomes active "Confirm pickup" and opens the rating modal.
   - Notification with `$120` in the title — `$120` renders jade-green, rest of title is bold #000. Pickup section renders CalendarCheck + dot-separated time list. Read row has #EAEAEA background and 35% opacity body content.

## Out-of-scope tech debt to surface (not fixed here)

- The notification title parsing for the jade price span is regex-based. If multiple `$` amounts appear in a title, all match. Acceptable for current copy but worth a comment in the code.
- `PunchlistResponse` interface still carries `unread_messages: unknown[]` since no messages endpoint exists. Type stays loose. Tighten if/when messages ship.
- The buyer-side pickup data dependency (`openRatingModal` lookup against `myPurchases`) means PunchlistPanel needs an extra prop. If this gets unwieldy, consider a context or a derived data hook. Not worth refactoring for this single feature.
