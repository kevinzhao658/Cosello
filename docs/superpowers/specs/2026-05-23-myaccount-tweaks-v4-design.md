# MyAccount Tweaks v4 — Polish Spec

**Date:** 2026-05-23
**Branch:** `chore/myaccount-misc-tweaks` (currently 14 commits ahead of dev: 4 prior tweaks + 3 realignment + 2 v3 implementation + 5 docs/spec/plan commits).
**Status:** Awaiting user review.

## Why this spec exists

After landing v3 (commits `ec7f2b6` + `c706863`) and smoke-testing, the user surfaced two more refinements:

| # | Item | Source |
|---|---|---|
| 1 | Punchlist card product name should wrap to a second line if it exceeds the card width (line-clamp-2 + ellipsis) | User smoke feedback |
| 2 | Restore the Status column's min-width lock so pill left-edges align across rows; keep Price content-width | User smoke feedback (revising v3 Section 1) |

The user also flagged the **status pill workflow** (~12 distinct status states across Selling and Buying) as worth a holistic review — labels, colors, transitions. That's explicitly **out of scope** for v4 and flagged as a follow-up brainstorming session.

## Goals

1. Wrap product names to 2 lines max in the punchlist panel, with ellipsis truncation past line 2.
2. Restore Status column lock (`minmax(108px, max-content)`) on the Listings tables so pill left-edges align across rows. Keep Price content-width (no min-width).

## Non-goals

- Status workflow review — separate session.
- Any changes to the notification anatomy (`884dd00`), buyer-side punchlist filter (now unified with seller in `c706863`), or any other prior work.
- Backend changes.

---

## Section 1 — Punchlist product name wrapping

### Current state

Inside `PunchlistPanel`'s item rendering loop, the product name (the listing/order title) is rendered with `truncate` — single-line ellipsis. For pickup items, the title comes from `pickup.listing_title`; for offers/drafts, from `(item as MyListing).title` or equivalent.

Specifically, look for the `.name`-style `<p>` or `<span>` inside the row's text stack. It probably has classes like `text-sm font-semibold text-ink truncate`.

### New state

Replace `truncate` with `line-clamp-2`. Tailwind's `line-clamp-N` utility:
- Wraps content to at most N lines.
- Truncates with ellipsis past line N.
- Requires the parent to NOT have a fixed height that would crop.

For the punchlist row, the title element becomes:

```tsx
<p className="text-sm font-semibold text-ink leading-snug line-clamp-2">
  {listingTitle}
</p>
```

Note the addition of `leading-snug` (line-height: 1.375) so 2-line names don't double the row height with the default tighter leading.

`truncate` was 1-line-only; `line-clamp-2` allows up to 2 lines. Row height auto-adjusts. If you have a flex/grid `items-center` on the parent row, that stays — the row centers vertically around whichever element is tallest.

### Applies to

- Pickup items (rendered inside the `pickups` category branch — uses `pickup.listing_title`).
- Offer items (uses `(item as MyListing).title` or `formatTitle(item.brand, item.name)`).
- Draft items (same as offers).
- Messages items don't render today, but for consistency the title styling there gets the same treatment.

The simplest implementation: change the single shared title-rendering line inside the cats item loop. If pickups vs offers/drafts have separate title rendering paths, change both.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — title `<p>` inside the punchlist item loop (~line 2860+).

---

## Section 2 — Restore Status column lock

### Current state (post-v3, after commit `ec7f2b6`)

Grid template in all 6 sites:
```
grid-cols-[minmax(0,1fr)_max-content_max-content]
```

Both Price and Status are `max-content` (content-width). Status pill left-edges shift per row based on pill content length.

### New state

```
grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)]
```

Only the third column (Status) gains a `108px` minimum. Price stays content-width.

Effect:
- Status pill cells are at least 108px wide. Short pills like "Live" sit flush-left inside a 108px cell.
- Status pill left-edges align at the same x-position across all rows regardless of pill content length.
- Price column continues to auto-size to its content (no change from v3).

### The 6 sites to update

`MyAccountPage.tsx` has the v3 grid template in exactly 6 places:
1. Selling table header
2. Selling table skeleton-state header
3. Selling table row `<button>` className
4. Buying table header
5. Buying table skeleton-state header
6. Buying table row `<button>` className

Find-and-replace pass:
- Find: `grid-cols-[minmax(0,1fr)_max-content_max-content]`
- Replace: `grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)]`

That's the entire change. No other CSS adjustments needed.

### Files

- `frontend/src/pages/MyAccount/MyAccountPage.tsx` — 6 grid-template string sites.

---

## Out of scope (deferred to future sessions)

### Status pill workflow review

The status pill renders ~12 distinct labels across Selling and Buying tables:

**Selling side:**
- `Live` — listing active, no orders
- `Draft` — listing in draft state
- `Sold` — listing has been sold
- `Expired` — listing past its time window
- `Pickup in {label}` — confirmed seller order, countdown ticking (was "Confirmed")
- `Pickup ready` — countdown expired, seller needs to confirm
- `Awaiting buyer` — seller confirmed, waiting for buyer's review
- `{N} pending` — N pending offers awaiting seller's accept/decline
- `Completed` — order completed

**Buying side:**
- `Pending` — buyer's offer awaiting seller response
- `Awaiting seller` — countdown ran out before seller confirmed
- `Pickup in {label}` — seller confirmed time, countdown ticking
- `Pickup ready` — countdown expired, buyer needs to rate
- `Completed` — order completed
- `Expired` — listing/order expired
- `Declined` — seller declined the offer
- `Withdrawn` — buyer withdrew their offer
- `Cancelled by seller` — seller cancelled post-confirmation

The list has grown organically and could benefit from a holistic review:
- Are the labels self-explanatory or do users get confused?
- Are color codings consistent (jade for "happy path", warning amber for "needs action", muted for "ended")?
- Are state transitions obvious from the UI alone?
- Are any states dead code or merged-but-not-renamed?

Suggested separate brainstorming session: **"Status pill workflow audit"** — map every state, document the transition logic, propose label/color refinements as needed.

### Items 6 (default community = neighborhood) and 8 (dark mode + color blind modes)

Still queued from the prior batch. Not addressed here.

---

## Approach to landing the change

Single new commit on top of branch tip `c706863`. Both items are small and tightly related to the same recent commits.

Commit message:

```
style(myaccount): wrap punchlist titles + restore status column lock
```

If review prefers, the changes could split into 2 commits (one per section) — both touch the same file. Single commit is cleaner for review.

---

## Verification (acceptance criteria)

1. `npm run typecheck` exit 0.
2. `npm run build` exit 0.
3. Manual smoke:
   - **Punchlist titles:** A pickup/offer/draft with a long product name wraps to 2 lines. A name longer than ~80 characters truncates with "…" after the second line. Row height grows to fit but doesn't keep growing.
   - **Listings table status alignment:** Open Selling and Buying tabs. Scan vertically — Status pill's LEFT edge is at the same x-position across every row. Short pills ("Live") sit flush-left inside their 108px cell. Long pills ("Pickup in 2h 14m") fill the cell naturally.
   - **Price column unchanged:** Prices remain content-width. "$48" and "$1,250" still occupy different cell widths per row. (This was the v3 behavior — restoring Status lock doesn't affect it.)

## Tech debt flagged

- Status workflow audit (see Out of scope).
- `OverviewCommunitiesRow` `aria-label="Your communities"` (line 2304) doesn't match the visible "Communities" heading. Cosmetic accessibility nit, flagged previously.
- `getListingTimeInfo` defined inline (not memoized) — flagged previously, unchanged.
