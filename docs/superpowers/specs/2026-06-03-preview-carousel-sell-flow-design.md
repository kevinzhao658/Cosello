# Preview Carousel Across the Sell Flow — Design

**Status:** Approved (brainstorm) · **Date:** 2026-06-03

## Goal

Extend the "Preview X of Y" carousel (today only in the AI-Review step) to the
earlier sell-flow modules so the seller sees a continuous, navigable preview of
their items from **Groups → Review → Pickup**. The **Upload** step is unchanged.

## Scope (per step)

| Step | Aside content |
|---|---|
| **Upload** (0 photos) | Top Searches (unchanged) |
| **Upload** (photos present, AI mode) | `BulkPreviewAside` carousel — "Photo X of Y", full pending shell (no pill) |
| **Groups** | `BulkPreviewAside` carousel — "Preview X of Y", full card shell, price/description **pending**, "X photos" pill, title from brand/name hints |
| **Review** | `BulkPreviewAside` carousel (unchanged behavior) |
| **Pickup** | `BulkPreviewAside` carousel — same as Review |

Out of scope: any change to Upload's Top Searches; a pickup map/summary; the
manual (non-AI) single-listing flow beyond the checklist rename below.

## Why this shape

At the Groups step `bulkItems` is still `[]` — the data lives in
`segmentation.groupings` (clusters of image indices) plus per-group brand/name
hints. Full listing details (price, description) are only generated when the
user enters Review. So one carousel must be fed from two sources depending on
phase. We use a **phase-aware selector feeding a single component** (chosen
approach; alternatives — eagerly materializing placeholder `bulkItems`, or a
second Groups-only component — were rejected for lifecycle risk and markup
duplication respectively).

## Data

- **New selector** `selectGroupsPreview(segmentation, hints, index)` in
  `useSellWizard.ts` builds a `BulkPreview` from a single group:
  - `item.imageUrl` = the group's first image (resolved via the wizard's
    existing image-url source, same as `selectBulkPreview`)
  - `item.photoCount` = number of images in the group
  - `item.brand` / `item.name` = the per-group brand/name hints
  - `item.price` = `null`, `item.description` = `null` → pending
  - `index` / `count` = position within `segmentation.groupings`
- **`BulkPreview.item` type changes:**
  - add `photoCount?: number` (present at Groups; omitted at Review/Pickup)
  - `price` and `description` become `string | null` (null = pending/not yet generated)
- Review/Pickup continue to use the existing `selectBulkPreview` from `bulkItems`
  (it sets `price`/`description` to their string values and omits `photoCount`).

## Component — `BulkPreviewAside.tsx`

Single component, renders pending states from the data:

- **Photo pill:** when `item.photoCount` is set, show a "{n} photos" pill on the
  cover image (bottom-left, frosted, mirrors the brainstorm mockup). Omitted when
  `photoCount` is undefined.
- **Price:** when `item.price` is `null`, render the pending treatment
  (`$—`, muted) instead of a parsed price.
- **Checklist:** evaluate each row defensively against nullable fields:
  - "At least one photo" — `imageUrl !== null`
  - "Brand or name" — `brand`/`name` hint present
  - "Price set" — `price` non-null AND parses to a number > 0 (null → unchecked)
  - "Description 20+ chars" — `description` non-null AND length ≥ 20 (null → unchecked)
- **Checklist heading renamed:** "Before you publish" → **"Listing checklist"**.

## Checklist rename — also in App.tsx

The single-listing preview checklist in `App.tsx` (the `["At least one photo", …]`
block) uses the same "Before you publish" heading. Rename it to **"Listing
checklist"** for consistency across all preview modes.

## Wiring — `SellWizard.tsx`

- The `onBulkPreviewChange` emit effect chooses its source by phase:
  - Upload with photos (AI mode, pre-segmentation) → `selectUploadPreview(uploadedImages, currentCardIndex)` — unit "Photo", all fields pending, no pill.
  - Groups phase (segmentation present, `bulkItems` empty) → `selectGroupsPreview(...)`
  - Review / Pickup (`bulkItems` populated) → `selectBulkPreview(...)`
  - otherwise → `null`
- The emit is gated to `mode === "ai"` so the manual single-listing flow is unaffected.
- `currentCardIndex` is already shared between the carousel and the group cards,
  so the aside arrows and the in-step selection stay in sync with no new state.
- App's existing aside-mode logic is unchanged in structure: Upload
  (`wizardImageCount === 0`) → Top Searches; else if a preview exists →
  `BulkPreviewAside`; else single preview.

## Edge cases

- **Split/merge groups:** `count` (Y) updates live as `groupings` changes;
  `index` clamps to `[0, count-1]` (reuse the existing clamp in `setBulkCardIndex`).
- **Zero groups / segmentation cleared:** preview is `null`, no empty carousel —
  falls back to single preview or Top Searches.
- **Pending → generated transition:** entering Review swaps the source from
  groupings to `bulkItems`; the card fills in price/description and the pill
  drops away. Same `index` is preserved.

## Testing

- Frontend is presentational/stateful: `npm run typecheck && npm run build` clean
  (no `any`; `price`/`description` nullability handled at every read site), plus a
  visual pass through Upload → Groups → Review → Pickup confirming the carousel
  appears from Groups onward, pending states render, the pill shows at Groups, and
  nav stays in sync.
- No backend changes.

## Differentiation note

The bulk photo separation flow is one of the two patent-track features. This
spec describes UI/preview surfacing only; keep implementation details out of
public-facing docs/comments.
