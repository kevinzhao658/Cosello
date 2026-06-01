# Bulk Listing Carousel — Design Spec

**Date:** 2026-05-31
**Status:** Approved (visual direction), pending spec review
**Surfaces:** Sell-wizard bulk review (`AIReviewStep`, "cards" phase) + the New-Listing preview aside (`App.tsx`)

> ⚠️ **Patent note:** This touches the AI bulk-photo-separation flow (provisional-patent candidate per CLAUDE.md). It specs the *review/preview UX* (carousel navigation, live preview sync) — not the segmentation/clustering algorithm. Committed to the public repo per user decision 2026-05-31.

---

## Goal

Let sellers freely flip through their separated bulk items during review — in any order — and keep a live, full-size listing preview (with the publish checklist) of the focused item in the right-side aside. Today the bulk review is a forward-leaning stepper with display-only dots, and the preview aside only understands single listings.

## Shared state model

**Single source of truth: `currentCardIndex`** (already in `useSellWizard.ts`, with a `SET_CARD_INDEX` action via `actions.setCurrentCardIndex`). Flipping in either surface sets the same index; both re-render from `bulkItems[currentCardIndex]`. No second index.

## Cross-component architecture (the key risk)

Bulk state (`bulkItems`, `currentCardIndex`, `bulkReviewPhase`) lives **inside `SellWizard`**; the preview aside renders in **`App.tsx`** (`newListingPreviewContent`, placed in the `lg:grid-cols-[1fr_320px]` aside at `App.tsx:1629` and the mobile drawer at ~1665). `App.tsx` already holds a `sellWizardRef: SellWizardHandle`.

**Approach:** extend the wizard→App channel so App can render a live, navigable bulk preview:
- `SellWizard` already calls `onPhaseChange?(phase)`. Add a sibling callback **`onBulkPreviewChange?(preview: BulkPreview | null)`** that fires whenever the focused bulk item, its live fields, the index, or the count changes (i.e., on `currentCardIndex` change AND on every `updateBulkItem`/`updateBulkItemField`/generate/delete). `null` when not in a bulk context.
- `BulkPreview` shape (new, explicit type): `{ index: number; count: number; item: { title: string; brand: string; name: string; price: string; condition: string; description: string; location: string; imageUrl: string | null; tagsCount: number }; heroCommunity: { name: string; image: string | null } }`.
- For the aside's own ‹ › arrows, expose **`setBulkCardIndex(index: number)`** on `SellWizardHandle` so App can drive the shared index.
- App stores the latest `BulkPreview` in local state (set from the callback) and renders the bulk aside from it. Because the wizard emits on every edit, the aside updates in real time.

Rationale: keeps the reducer as the single owner of bulk state (no lifting/duplication), reuses the existing ref + callback pattern, and satisfies the live-update requirement. Alternative considered (lifting `bulkItems` into App or context) rejected — larger refactor, duplicates ownership.

## Surface A — editor carousel (`AIReviewStep.tsx`)

- **Add a nav header** above the editor card: prev `‹` arrow, a horizontally-scrollable **thumbnail strip** (one 28px rounded thumb per `bulkItems` entry, 8px gap, 4px strip padding, active = `box-shadow:0 0 0 2px` primary ring — never `outline`, so it can't clip), next `›` arrow. Clicking a thumb / arrow calls `setCurrentCardIndex`. Active thumb auto-scrolls into view (`scrollIntoView({inline:"center"})`).
- **Replace** the existing display-only dot row (`AIReviewStep.tsx:53-66`) with this strip. Keep the "Item N of M" counter.
- **Footer unchanged in spirit:** KEEP `Previous` / `Next Item`→`Continue` and the delete (`✕`) buttons exactly as today (`AIReviewStep.tsx:246-281`). They now coexist with the top strip.
- **Editor photo stays thumbnail-size** — the existing `currentItem.imageIndices` small photo row is unchanged (full image lives in the aside; do not enlarge).
- **Swipe:** whole-card horizontal swipe flips items (prev/next). Use a pointer/touch handler with a horizontal-intent threshold so it doesn't hijack vertical scroll; ignore swipes that begin on inputs/textareas/selects so text editing isn't disrupted. Left→older logic mirrors the arrows (clamp at ends).
- Everything else in the editor card (title, description, price, condition, category, tags, add-photo, regenerate) is unchanged.

## Surface B — preview aside (`App.tsx` `newListingPreviewContent`)

- **Single mode (manual / single AI):** unchanged — current behavior stays.
- **Bulk mode (a `BulkPreview` is present):** render a bulk variant of the aside:
  - **Own nav header:** `‹` + "Preview N of M" + `›`, calling `sellWizardRef.setBulkCardIndex`.
  - **Full-size image** of the focused item (`aspect-square rounded-lg`), styled per the shipped minimal card (community byline, title, location, **black `text-base font-semibold` price**).
  - **"Before you publish" checklist** re-evaluated for the focused bulk item (mirror the existing checklist logic at `App.tsx:1012-1028`, but sourced from `BulkPreview.item`): title&brand present, price set & > 0, ≥1 photo, description ≥ 20 chars.
  - **Live:** because the wizard emits `onBulkPreviewChange` on each edit, typing brand/name/price (or an AI-generated name arriving) updates the preview + checklist immediately.
- Applies in **both** the `lg:` sticky aside and the mobile drawer (shared content).

## Edge cases

- **0 items:** no bulk preview; aside falls back to its empty/placeholder state (don't crash on `bulkItems[undefined]`).
- **1 item:** strip + arrows render but arrows are disabled at both ends; still valid.
- **Delete current item:** reducer already clamps `currentCardIndex` (`useSellWizard.ts:261`); aside follows via the callback.
- **Non-`cards` phases (review/reason/pickup):** decide per the callback — emit `BulkPreview` whenever `bulkItems` exist so the aside is navigable across more of the flow; emit `null` only when there are no bulk items. (The aside is shown across steps via the App layout.)
- **Index bounds:** all setters clamp to `[0, count-1]`.

## Out of scope

- The single-listing preview behavior (unchanged).
- Any change to segmentation/grouping logic, generation, or backend.
- The marketplace `<ListingCard>` (already shipped) — the aside reuses its visual style but is its own preview markup (different data source: `BulkPreview`, not `Listing`).

## Component / type contract

- New type `BulkPreview` (above) — explicit, no `any`.
- `SellWizardHandle` gains `setBulkCardIndex(index: number): void`.
- `SellWizard` props gain `onBulkPreviewChange?: (preview: BulkPreview | null) => void`.
- App holds `const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)`.

## QA / acceptance

- Flipping via editor strip, editor arrows, footer Prev/Next, card swipe, OR aside arrows all move the **same** item; counters in both surfaces stay in sync.
- Editing a field in the editor updates the aside preview + checklist live (no save/blur needed).
- AI-generated name/details populate the aside as they arrive.
- Active thumbnail ring is never clipped; active thumb scrolls into view.
- Swipe never fires while editing a text field or during vertical scroll.
- 0/1-item and delete-current cases behave (no crash, index clamped).
- `tsc -b` + `vite build` clean; no `any`.
- Mobile drawer shows the same bulk preview + nav.
