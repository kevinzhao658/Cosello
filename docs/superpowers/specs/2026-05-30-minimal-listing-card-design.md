# Minimal Listing Card — Design Spec

**Date:** 2026-05-30
**Status:** Approved (visual direction), pending spec review
**Surface:** Marketplace listing card (currently inline in `frontend/src/App.tsx`)

> ⚠️ **Patent note:** This spec describes the *visual/UX treatment* of the community
> trust-signal feature (provisional-patent candidate per CLAUDE.md) — placement, size,
> styling — not the dynamic shared-membership detection mechanic. Committed to the
> public repo per user decision 2026-05-31.

---

## Goal

Make the marketplace listing card more minimal and stop the price from being the
loudest element. Chosen via visual brainstorming (Direction "A", community byline
above a clean photo, left-aligned black price).

## What changes (visual)

| Element | Before | After |
|---|---|---|
| **Frame** | `bg-canvas border border-hairline rounded-md overflow-hidden hover:shadow-hover` | Borderless, no shadow. Card root is layout-only. |
| **Photo** | `aspect-square`, square corners (card clips) | `aspect-square rounded-lg overflow-hidden` — photo is its own rounded block |
| **Community** | Full tinted bar on top (`bg-primary-soft/60`, full width) | **Byline above the photo**: avatar (~20px) + name, `text-xs font-medium text-body`. Clean photo. |
| **Title** | `text-sm font-medium text-ink line-clamp-1` | unchanged |
| **Location** | `text-xs text-muted line-clamp-1` | unchanged, now sits **above** price |
| **Price** | `text-2xl font-extrabold text-primary tracking-display` (loud green) | `text-base font-semibold text-ink` (16px, semibold, **black**) |
| **Body padding** | `p-3` | `pt-2`, no horizontal padding (aligns to photo edge) |
| **Order** | title → location → price | community byline (above photo) → photo → title → location → price |

## Sold state

- Photo gets a **75% white scrim**: `absolute inset-0 bg-canvas/75`.
- **Frosted "SOLD" pill, top-left** on the photo: `absolute top-2 left-2 text-[10px] uppercase tracking-widest font-bold text-ink bg-canvas/95 border border-hairline px-2 py-1 rounded-full`.
- Title and price drop to `text-muted`.
- Heart/save button is **suppressed** when sold.

## Preserved behavior (do not regress)

- Card `onClick` → `openListingDetail(listing, source)`.
- `motion-safe:animate-mkt-card-in` entrance + staggered `animationDelay`.
- Heart/save button: same `toggleWishlist` behavior, same visibility rule
  (`!isOwn && isAuthenticated`), same save-pulse animation — **plus** suppressed when sold.
- `heroCommunity` fallback chain (shared community → first community → `PLACEHOLDER_COMMUNITY`)
  and the avatar image-vs-letter fallback.
- Empty/missing states: missing community image → letter fallback; missing location/price
  handled as today. (Per CLAUDE.md: handle loading/error/empty — no regressions.)

## Reach (approved)

1. **Marketplace card** (`App.tsx`) — primary surface. Always.
2. **`ListingCardSkeleton.tsx`** — update to match the borderless frame so cards don't
   visibly jump on load: byline-line placeholder → `rounded-lg` aspect-square photo →
   title/location/price placeholder lines. Remove the tinted trust-band placeholder + outer border.
3. **MyAccount listings** — ⚠️ **verify first.** MyAccount appears to render listings as a
   *table grid* (PR #12), not photo cards. If there is no photo-card surface there, this
   item is N/A; do not force the shared component onto a table. Confirm during implementation.
4. **Extract `<ListingCard>`** — pull the card out of `App.tsx` (currently inline JSX in a
   ~2000-line file) into `frontend/src/components/ListingCard.tsx` with an explicit typed
   props interface (no `any`). Marketplace grid consumes it. This removes the inline/duplicate
   divergence flagged as tech debt.

## Component contract (`ListingCard`)

Props (explicit types, no `any`):

- `listing: Listing` — the listing record
- `heroCommunity: { name: string; image: string | null }` — derived by caller
- `isOwn: boolean`
- `isWishlisted: boolean`
- `isPulsing: boolean` — save-pulse animation flag
- `priority: boolean` — image eager-load (first row)
- `animationDelayMs: number`
- `onOpen: () => void`
- `onToggleWishlist: () => void`

Single responsibility: render one card + emit open/save intents. No data fetching, no
global state — caller owns wishlist/auth/derivation. Keeps it testable in isolation.

## Out of scope

- Listing detail modal, the buy flow, and the three non-`ModalShell` overlays.
- Any backend/API/DB change — this is presentational only.
- Card hover micro-interactions beyond a light `hover:opacity-95` on the photo.

## QA / acceptance

- Marketplace grid: borderless cards, community byline above a clean rounded photo,
  black 16px price, airier grid (no per-card box).
- Skeleton matches the new frame (no jump on load).
- Sold listings: 75% faded photo + frosted SOLD pill top-left, muted text, no heart.
- No `any`; build + typecheck clean.
- Existing behaviors intact: open-on-click, save toggle + pulse, entrance animation,
  community fallback, image-vs-letter avatar.
