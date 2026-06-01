# Bulk Review Smart Aside (Carousel + In-Demand Empty State) — Design Spec

**Date:** 2026-05-31
**Status:** Approved (visual direction), pending spec review
**Spans:** frontend (sell-wizard + App aside) **and** one new backend endpoint (top searches)
**Surfaces:** Sell-wizard bulk review (`AIReviewStep`, "cards" phase) + the New-Listing preview aside (`App.tsx`), which has two modes: a **navigable bulk preview** (photos uploaded) and a **Top Searches empty state** (no photos yet)

> ⚠️ **Patent note:** This touches the AI bulk-photo-separation flow (provisional-patent candidate per CLAUDE.md). It specs the *review/preview UX* (carousel navigation, live preview sync) — not the segmentation/clustering algorithm. Committed to the public repo per user decision 2026-05-31.

---

## Goal

Let sellers freely flip through their separated bulk items during review — in any order — and keep a live, full-size listing preview (with the publish checklist) of the focused item in the right-side aside. Today the bulk review is a forward-leaning stepper with display-only dots, and the preview aside only understands single listings. Additionally, when the seller hasn't uploaded any photos yet, the aside has nothing to preview — so it surfaces the **top searches** on the platform to spark "oh, I have one of those."

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

## Surface B (no photos) — Top Searches empty state

- **Trigger:** New Listing, **no photos uploaded yet** (`wizardImageCount === 0` / no images). Takes priority over the bulk preview (which has nothing to show yet).
- **UI:** header (e.g. "🔎 People are searching for") + a ranked **text list** of the top ~5 search terms with their counts. **No thumbnails** — searches are phrases, not listings; do not fabricate images.
- **States (per CLAUDE.md — handle all):** loading skeleton; empty (no search data yet) → hide the widget / show a neutral "Upload photos to preview your listing" placeholder; error → silent fallback to the placeholder (never block the upload flow).
- Renders in both the `lg:` aside and the mobile drawer.
- Once photos are uploaded, the aside switches to the bulk preview (Surface B above).

## Backend — top searches endpoint

The data already exists: `SearchQuery` (`backend/models.py`: `user_id, query_text, ts`) is written on every search via `backend/routers/events.py`. No logging pipeline needed — just aggregation.

- **New endpoint:** `GET /api/searches/top?window_days=7&limit=5` → `[{ query_text: string, count: number }]`.
- **Query:** group recent `search_queries` by a normalized `query_text` (lowercased + trimmed) where `ts >= now - window_days*86400`, `COUNT(*)` desc, `LIMIT`. Skip blank/whitespace terms.
- **v1 = global, count-ranked.** No geo-scoping. Auth per existing endpoint norms.
- Response is a small typed model; cache/window is fine to tune later.

## Edge cases

- **0 items:** no bulk preview; aside falls back to its empty/placeholder state (don't crash on `bulkItems[undefined]`).
- **1 item:** strip + arrows render but arrows are disabled at both ends; still valid.
- **Delete current item:** reducer already clamps `currentCardIndex` (`useSellWizard.ts:261`); aside follows via the callback.
- **Aside mode resolution (across all New-Listing steps):** no photos uploaded → **Top Searches empty state**; photos uploaded + bulk items exist → **navigable bulk preview** (emit `BulkPreview` whenever `bulkItems` exist, across review/reason/cards/pickup); single/manual mode → existing single preview unchanged. The bulk preview is navigable on every non-card step where items exist, not just the "cards" step.
- **Index bounds:** all setters clamp to `[0, count-1]`.

## Out of scope

- The single-listing preview behavior (unchanged).
- Any change to segmentation/grouping logic or AI generation.
- Backend changes **other than** the read-only top-searches aggregation endpoint (no schema/logging changes — `SearchQuery` already exists and is populated).
- The marketplace `<ListingCard>` (already shipped) — the aside reuses its visual style but is its own preview markup (different data source: `BulkPreview`, not `Listing`).

## Deferred to v2 (top searches)

- **Geo-scoping** ("near you" — join `SearchQuery.user_id` → searcher neighborhood).
- **⚡ supply-gap flag** (high-demand / low-supply: cross-reference each top term against matching-listing count).
- Both are enhancements; v1 ships global count-ranked terms.

## Component / type contract

- New type `BulkPreview` (above) — explicit, no `any`.
- `SellWizardHandle` gains `setBulkCardIndex(index: number): void`.
- `SellWizard` props gain `onBulkPreviewChange?: (preview: BulkPreview | null) => void`.
- App holds `const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)`.
- **Top searches:** backend response model `TopSearch { query_text: str; count: int }`; frontend type `TopSearch { queryText: string; count: number }`. Frontend fetches `GET /api/searches/top` with loading/empty/error handling; no `any`.

## Task split (Coworkers)

- **backend-dev:** the `GET /api/searches/top` aggregation endpoint + test. Independent of the frontend (clear contract above) → can run in parallel.
- **frontend-dev:** Surface A carousel nav, Surface B bulk preview + cross-component wiring, and the Top Searches empty-state widget consuming the endpoint.
- Lock the contract (route, params, JSON shape) up front so the two can parallelize; QA last.

## QA / acceptance

- Flipping via editor strip, editor arrows, footer Prev/Next, card swipe, OR aside arrows all move the **same** item; counters in both surfaces stay in sync.
- Editing a field in the editor updates the aside preview + checklist live (no save/blur needed).
- AI-generated name/details populate the aside as they arrive.
- Active thumbnail ring is never clipped; active thumb scrolls into view.
- Swipe never fires while editing a text field or during vertical scroll.
- 0/1-item and delete-current cases behave (no crash, index clamped).
- **No photos uploaded:** aside shows the Top Searches list (real counts from `/api/searches/top`); loading/empty/error states all handled gracefully; switches to the bulk preview once photos are added.
- **Endpoint:** `GET /api/searches/top` returns terms ranked by recent count, normalized/deduped, blanks skipped; has a backend test.
- `tsc -b` + `vite build` clean; backend tests pass; no `any`.
- Mobile drawer shows the same bulk preview + nav, and the same Top Searches empty state.
