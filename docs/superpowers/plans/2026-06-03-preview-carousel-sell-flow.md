# Preview Carousel Across the Sell Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Frontend is presentational/stateful (no component test harness) → verify each task with `npm run typecheck && npm run build` + a visual check. No `any`; explicit types throughout.

**Goal:** Show the "Preview X of Y" carousel aside from the **Groups** step onward (Groups → Review → Pickup), fed from photo groups before listing details exist, while Upload keeps Top Searches.

**Architecture:** A new phase-aware selector `selectGroupsPreview` builds the existing `BulkPreview` shape from `segmentation.groupings` + brand/name hints (price/description `null` = pending). `SellWizard`'s emit effect picks the source by phase: `bulkItems` populated → `selectBulkPreview` (Review/Pickup); otherwise → `selectGroupsPreview` (Groups). `BulkPreviewAside` renders pending states and a "{n} photos" pill from the data. One component, no new state — `currentCardIndex` is already shared.

**Tech Stack:** React 18 + TypeScript (Vite). Touch points: `useSellWizard.ts`, `BulkPreviewAside.tsx`, `SellWizard.tsx`, `App.tsx`.

**Spec:** `docs/superpowers/specs/2026-06-03-preview-carousel-sell-flow-design.md`

---

## File structure

- **Modify** `frontend/src/features/sell-wizard/useSellWizard.ts` — widen `BulkPreview.item` (`price`/`description` nullable, add `photoCount?`); add `selectGroupsPreview`.
- **Modify** `frontend/src/components/BulkPreviewAside.tsx` — null-safe price/description/checklist, photo-count pill, checklist heading rename.
- **Modify** `frontend/src/features/sell-wizard/SellWizard.tsx` — phase-aware emit effect; import `selectGroupsPreview`.
- **Modify** `frontend/src/App.tsx` — rename the single-listing checklist heading.

Tasks are sequential (later tasks consume types from Task 1).

---

### Task 1: Widen `BulkPreview` + add `selectGroupsPreview`

**Files:**
- Modify: `frontend/src/features/sell-wizard/useSellWizard.ts:630-679`

- [ ] **Step 1: Widen the `BulkPreview.item` type** — replace the interface at `useSellWizard.ts:630-644` with:

```ts
export interface BulkPreview {
  index: number;
  count: number;
  item: {
    brand: string;
    name: string;
    /** null = not generated yet (Groups phase). */
    price: string | null;
    condition: string;
    /** null = not generated yet (Groups phase). */
    description: string | null;
    location: string;
    tagsCount: number;
    /** Photo count for the focused group. Present at Groups; omitted at Review/Pickup. */
    photoCount?: number;
    /** Resolved URL for the cover photo. null when no photo yet. */
    imageUrl: string | null;
  };
}
```

`selectBulkPreview` (lines 651-679) needs **no body change** — it assigns string `price`/`description`, which remain valid under `string | null`, and omits the optional `photoCount`.

- [ ] **Step 2: Add `selectGroupsPreview`** directly below `selectBulkPreview` (after line 679):

```ts
/**
 * Build a BulkPreview from a photo group (Groups phase, before details exist).
 * Returns null when there is no segmentation / no groups. price & description are
 * null (pending); photoCount carries the group size for the "{n} photos" pill.
 */
export function selectGroupsPreview(
  segmentation: SegmentationResult | null,
  brandHints: string[],
  names: string[],
  currentCardIndex: number,
  uploadedImages: UploadedImage[],
): BulkPreview | null {
  if (!segmentation || segmentation.groupings.length === 0) return null;
  const count = segmentation.groupings.length;
  const i = Math.min(Math.max(currentCardIndex, 0), count - 1);
  const group = segmentation.groupings[i];
  const firstIdx = group[0] ?? null;
  const imageUrl: string | null =
    firstIdx !== null
      ? (segmentation.image_urls[firstIdx] ?? uploadedImages[firstIdx]?.preview ?? null)
      : null;
  return {
    index: i,
    count,
    item: {
      brand: brandHints[i] ?? "",
      name: names[i] ?? "",
      price: null,
      condition: "",
      description: null,
      location: "",
      tagsCount: 0,
      photoCount: group.length,
      imageUrl,
    },
  };
}
```

- [ ] **Step 3: Typecheck** — `cd frontend && npm run typecheck` → clean.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/features/sell-wizard/useSellWizard.ts
git commit -m "feat(sell): selectGroupsPreview + nullable BulkPreview fields"
```

---

### Task 2: Null-safe `BulkPreviewAside` + photo pill + heading rename

**Files:**
- Modify: `frontend/src/components/BulkPreviewAside.tsx`

- [ ] **Step 1: Make `hasPrice` / `hasDescription` null-safe** — replace these lines (currently `BulkPreviewAside.tsx:18-25`):

```ts
  const hasPrice = (() => {
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0;
  })();
  const hasPhoto = item.imageUrl !== null;
  const hasDescription = item.description.trim().length >= 20;
```

with:

```ts
  const hasPrice = (() => {
    if (item.price === null) return false;
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0;
  })();
  const hasPhoto = item.imageUrl !== null;
  const hasDescription = item.description !== null && item.description.trim().length >= 20;
```

- [ ] **Step 2: Make `displayPrice` null-safe** — replace the `displayPrice` IIFE (currently `BulkPreviewAside.tsx:34-38`):

```ts
  const displayPrice = (() => {
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0 ? `$${raw}` : "$—";
  })();
```

with:

```ts
  const displayPrice = (() => {
    if (item.price === null) return "$—";
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0 ? `$${raw}` : "$—";
  })();
```

- [ ] **Step 3: Add the "{n} photos" pill** — inside the cover-image `<div className="relative aspect-square ...">`, immediately after the `{item.imageUrl ? (...) : (...)}` block and before that div closes, add:

```tsx
        {item.photoCount !== undefined && (
          <span className="absolute left-2 bottom-2 bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
            {item.photoCount} photos
          </span>
        )}
```

- [ ] **Step 4: Rename the checklist heading** — in the "Before you publish" block, change:

```tsx
          Before you publish
```

to:

```tsx
          Listing checklist
```

- [ ] **Step 5: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/BulkPreviewAside.tsx
git commit -m "feat(sell): BulkPreviewAside pending states + photo pill + Listing checklist"
```

---

### Task 3: Phase-aware emit in `SellWizard`

**Files:**
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:17` (import), `:451-455` (effect)

- [ ] **Step 1: Import `selectGroupsPreview`** — at `SellWizard.tsx:17`, the import block already pulls `selectBulkPreview`. Add `selectGroupsPreview` to that same `import { ... } from "./useSellWizard"` list.

- [ ] **Step 2: Make the emit effect phase-aware** — replace the effect at `SellWizard.tsx:451-455`:

```ts
  useEffect(() => {
    onBulkPreviewChange?.(
      selectBulkPreview(bulkItems, currentCardIndex, segmentation?.image_urls, uploadedImages),
    );
  }, [bulkItems, currentCardIndex, segmentation, uploadedImages, onBulkPreviewChange]);
```

with:

```ts
  useEffect(() => {
    // Review/Pickup: bulkItems exist → full listing preview.
    // Groups: bulkItems empty but segmentation present → group preview (pending details).
    // Upload / pre-segmentation: both null → no carousel (App falls back to single / Top Searches).
    const preview =
      bulkItems.length > 0
        ? selectBulkPreview(bulkItems, currentCardIndex, segmentation?.image_urls, uploadedImages)
        : selectGroupsPreview(segmentation, brandHints, names, currentCardIndex, uploadedImages);
    onBulkPreviewChange?.(preview);
  }, [bulkItems, currentCardIndex, segmentation, brandHints, names, uploadedImages, onBulkPreviewChange]);
```

(`brandHints` and `names` are already destructured from state near `SellWizard.tsx:173` — no new wiring needed, just the added deps.)

- [ ] **Step 3: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "feat(sell): emit group preview during Groups phase"
```

---

### Task 4: Rename single-listing checklist heading in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx:943` (comment), `:1035` (heading)

- [ ] **Step 1: Rename the heading** — at `App.tsx:1035`, change:

```tsx
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Before you publish</p>
```

to:

```tsx
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Listing checklist</p>
```

- [ ] **Step 2: Update the stale comment** — at `App.tsx:943`, change `// Preview card + "Before you publish" checklist for the New Listing page.` to `// Preview card + "Listing checklist" for the New Listing page.`

- [ ] **Step 3: Typecheck + build** — `cd frontend && npm run typecheck && npm run build` → both clean.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/App.tsx
git commit -m "feat(sell): rename single-listing checklist to Listing checklist"
```

---

### Task 5: Visual verification (manual)

**No code.** With the backend running (`127.0.0.1:8000`) and `npm run dev`, walk the AI sell flow and confirm:

- [ ] **Upload** (photos added, pre-segmentation) → aside unchanged (Top Searches when empty; single preview behavior otherwise). No carousel.
- [ ] **Groups** → "Preview X of Y" carousel appears; cover photo + "{n} photos" pill; title reflects brand/name hints as you type; price shows `$—`; "Listing checklist" shows photo + brand/name checked, price + description unchecked.
- [ ] Arrows / swipe navigate groups and stay in sync with the group cards; `Y` updates live when splitting/merging groups.
- [ ] **Review** → carousel fills in price/description, pill drops away, checklist completes as fields are filled. Heading reads "Listing checklist".
- [ ] **Pickup** → same carousel persists.
- [ ] Single-listing (manual) preview heading also reads "Listing checklist".
- [ ] Mobile drawer mirrors each of the above.

---

## Self-review

- **Spec coverage:** Groups carousel + pending states + pill (Tasks 1-3); "Preview X of Y" wording reused unchanged (existing `BulkPreviewAside` nav label); Pickup keeps carousel (Task 3 — `bulkItems` populated post-generate); checklist rename in both card and single preview (Tasks 2 & 4); Upload unchanged (selectGroupsPreview returns null without segmentation); edge cases — clamp via `Math.min/max` in `selectGroupsPreview`, zero groups → null (Task 1). ✓
- **Placeholder scan:** none — every step has concrete code/commands. ✓
- **Type consistency:** `BulkPreview.item.price`/`description` are `string | null` (Task 1) and read null-safe everywhere (Task 2); `photoCount?: number` defined (Task 1), gated with `!== undefined` (Task 2); `selectGroupsPreview` signature `(segmentation, brandHints, names, currentCardIndex, uploadedImages)` defined Task 1, called identically Task 3. `SegmentationResult.groupings: number[][]` and `.image_urls: string[]` match the existing interface (`useSellWizard.ts:24-26`). ✓
- **No backend changes; no `any`.** ✓
