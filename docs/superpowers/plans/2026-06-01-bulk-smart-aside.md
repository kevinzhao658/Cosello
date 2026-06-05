# Bulk Review Smart Aside — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Frontend is presentational/stateful (no component test harness) → verify with `npm run typecheck && npm run build` + visual check. Backend uses pytest. No `any`; explicit types throughout.

**Goal:** Make the sell-wizard bulk review freely navigable (carousel) with a live, synced full-size preview + publish-checklist in the right aside, and show top searches in that aside when no photos are uploaded yet.

**Architecture:** Bulk state stays owned by `SellWizard` (`useSellWizard` reducer). It's surfaced to `App.tsx` via a new `onBulkPreviewChange` callback (emitted on index/edit changes) + a `setBulkCardIndex` method on `SellWizardHandle`. The aside in `App.tsx` renders one of three modes: single preview (unchanged), bulk preview (photos + items), or Top Searches (no photos). A read-only backend endpoint aggregates the existing `SearchQuery` table.

**Tech Stack:** React 18 + TS (Vite), FastAPI + SQLAlchemy (pytest). Helpers: `apiFetch` (`frontend/src/lib/api.ts`), `ListingImage`, `PLACEHOLDER_COMMUNITY`.

**Spec:** `docs/superpowers/specs/2026-05-31-bulk-listing-carousel-design.md`

---

## File structure

- **Create** `backend/routers/searches.py` — `GET /api/searches/top` aggregation endpoint.
- **Modify** `backend/main.py` — register the router.
- **Create** `backend/tests/test_searches.py` — endpoint test.
- **Modify** `frontend/src/features/sell-wizard/useSellWizard.ts` — export a `BulkPreview` type + a selector building it from state.
- **Modify** `frontend/src/features/sell-wizard/SellWizard.tsx` — `setBulkCardIndex` on the handle; `onBulkPreviewChange` prop + emit effect.
- **Modify** `frontend/src/features/sell-wizard/steps/AIReviewStep.tsx` — thumbnail strip + arrows (replace dot row) + swipe.
- **Create** `frontend/src/components/TopSearches.tsx` — empty-state widget.
- **Create** `frontend/src/components/BulkPreviewAside.tsx` — bulk preview card + arrows + checklist (keeps App.tsx lean).
- **Modify** `frontend/src/App.tsx` — hold `bulkPreview` state; render aside mode (single / bulk / top-searches).

---

## BACKEND (parallelizable — contract is fixed below)

### Contract (locked)
`GET /api/searches/top?window_days=7&limit=5` → `200` JSON: `{ "items": [ { "query_text": "carhartt jacket", "count": 142 } ] }`, ordered by count desc. Terms normalized (lowercased + trimmed) and grouped; blank terms excluded.

### Task B1: Top searches endpoint

**Files:**
- Create: `backend/routers/searches.py`
- Modify: `backend/main.py` (imports ~line 26-32, `include_router` ~55-57)
- Test: `backend/tests/test_searches.py`

- [ ] **Step 1: Write the failing test** (`backend/tests/test_searches.py`)

Mirror `test_events.py` setup (uses `db_session`, `client`, an authed test user from `conftest.py`). Seed several `SearchQuery` rows with varied `query_text`/`ts`, then assert ranking + normalization:

```python
import time
from models import SearchQuery

def test_top_searches_ranks_and_normalizes(client, db_session, test_user, auth_headers):
    now = time.time()
    for _ in range(3):
        db_session.add(SearchQuery(user_id=test_user.id, query_text="Carhartt Jacket", ts=now-100))
    db_session.add(SearchQuery(user_id=test_user.id, query_text="carhartt jacket ", ts=now-50))  # dupe after normalize
    db_session.add(SearchQuery(user_id=test_user.id, query_text="doc martens", ts=now-50))
    db_session.add(SearchQuery(user_id=test_user.id, query_text="   ", ts=now-50))  # blank → excluded
    db_session.add(SearchQuery(user_id=test_user.id, query_text="old", ts=now-90*86400))  # outside window
    db_session.commit()

    r = client.get("/api/searches/top?window_days=7&limit=5", headers=auth_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert items[0] == {"query_text": "carhartt jacket", "count": 4}
    texts = [i["query_text"] for i in items]
    assert "doc martens" in texts
    assert "old" not in texts and "" not in texts
```

(If `auth_headers`/`test_user` fixtures differ, match the names actually used in `backend/tests/conftest.py` / `test_events.py`.)

- [ ] **Step 2: Run it, expect failure** — `cd backend && pytest tests/test_searches.py -v` → FAIL (404 / no route).

- [ ] **Step 3: Implement `backend/routers/searches.py`**

```python
import time
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user            # match the import path used in events.py
from models import SearchQuery, User

router = APIRouter(prefix="/api", tags=["searches"])

class TopSearch(BaseModel):
    query_text: str
    count: int

class TopSearchesResponse(BaseModel):
    items: list[TopSearch]

@router.get("/searches/top", response_model=TopSearchesResponse)
async def top_searches(
    window_days: int = Query(7, ge=1, le=90),
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cutoff = time.time() - window_days * 86400
    norm = func.lower(func.trim(SearchQuery.query_text))
    rows = (
        db.query(norm.label("q"), func.count().label("c"))
        .filter(SearchQuery.ts >= cutoff, func.trim(SearchQuery.query_text) != "")
        .group_by(norm)
        .order_by(func.count().desc())
        .limit(limit)
        .all()
    )
    return TopSearchesResponse(items=[TopSearch(query_text=q, count=c) for q, c in rows])
```

(Confirm `get_current_user`'s import path matches `events.py` line ~16-19.)

- [ ] **Step 4: Register in `backend/main.py`** — add `from routers.searches import router as searches_router` near the other router imports and `app.include_router(searches_router)` near the others.

- [ ] **Step 5: Run test, expect pass** — `cd backend && pytest tests/test_searches.py -v` → PASS. Then run the suite: `pytest -q`.

- [ ] **Step 6: Commit**
```bash
git add backend/routers/searches.py backend/main.py backend/tests/test_searches.py
git commit -m "feat(api): GET /api/searches/top — aggregate recent search queries"
```

---

## FRONTEND

### Task F1: `BulkPreview` type + selector

**Files:** Modify `frontend/src/features/sell-wizard/useSellWizard.ts`

- [ ] **Step 1: Add the exported type + selector**

```ts
export interface BulkPreview {
  index: number;
  count: number;
  item: {
    brand: string; name: string; price: string; condition: string;
    description: string; location: string; tagsCount: number;
    imageIndex: number | null;   // first imageIndices entry, for the preview image
  };
}

// Build from wizard state; null when there are no bulk items.
export function selectBulkPreview(
  bulkItems: BulkItemDetails[], currentCardIndex: number,
): BulkPreview | null {
  if (bulkItems.length === 0) return null;
  const i = Math.min(Math.max(currentCardIndex, 0), bulkItems.length - 1);
  const it = bulkItems[i];
  return {
    index: i, count: bulkItems.length,
    item: {
      brand: it.brand, name: it.name, price: it.price, condition: it.condition,
      description: it.description, location: it.location,
      tagsCount: it.tags.length, imageIndex: it.imageIndices[0] ?? null,
    },
  };
}
```

- [ ] **Step 2: Typecheck** — `npm run typecheck` → clean. Commit:
```bash
git add frontend/src/features/sell-wizard/useSellWizard.ts
git commit -m "feat(sell): BulkPreview type + selector"
```

### Task F2: Surface bulk state from SellWizard → App

**Files:** Modify `frontend/src/features/sell-wizard/SellWizard.tsx`

- [ ] **Step 1: Extend the handle interface** (`SellWizardHandle`, ~line 29) — add:
```ts
  setBulkCardIndex: (index: number) => void;
```
- [ ] **Step 2: Add the prop** (`SellWizardProps`, ~after `onPhaseChange`):
```ts
  onBulkPreviewChange?: (preview: BulkPreview | null) => void;
```
Destructure `onBulkPreviewChange` in the component signature; import `BulkPreview`, `selectBulkPreview`.

- [ ] **Step 3: Implement the handle method** (in the `useImperativeHandle` object, ~line 875):
```ts
  setBulkCardIndex: (index) => actions.setCurrentCardIndex(index),
```
- [ ] **Step 4: Emit on change** (new effect, mirroring the `onPhaseChange` effect ~line 440):
```ts
useEffect(() => {
  onBulkPreviewChange?.(selectBulkPreview(bulkItems, currentCardIndex));
}, [bulkItems, currentCardIndex, onBulkPreviewChange]);
```
Because `bulkItems` is a new array on every `updateBulkItem`/`updateBulkItemField`, edits re-emit → live updates.

- [ ] **Step 5: Typecheck + build** → clean. Commit:
```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "feat(sell): surface bulk preview + setBulkCardIndex to parent"
```

### Task F3: Carousel nav in AIReviewStep

**Files:** Modify `frontend/src/features/sell-wizard/steps/AIReviewStep.tsx`

- [ ] **Step 1: Replace the dot row** (`AIReviewStep.tsx:53-66`) with a thumbnail strip + arrows. Keep the "Item N of M" counter. Each thumb shows `imageUrls?.[item.imageIndices[0]] ?? uploadedImages[item.imageIndices[0]]?.preview`. Active thumb: `box-shadow:0_0_0_2px` primary ring (Tailwind `ring-2 ring-primary` on a padded, `overflow-x-auto` strip so it isn't clipped). Clicking a thumb or arrow → `setCurrentCardIndex(i)` / `±1` clamped.
```tsx
<div className="flex items-center gap-2">
  <button type="button" aria-label="Previous item" disabled={currentCardIndex===0}
    onClick={() => setCurrentCardIndex(Math.max(0, currentCardIndex-1))}
    className="size-7 rounded-full border border-hairline flex items-center justify-center disabled:opacity-30">‹</button>
  <div className="flex gap-2 overflow-x-auto p-1 flex-1">
    {bulkItems.map((it, i) => (
      <button key={i} type="button" aria-label={`Item ${i+1}`} aria-current={i===currentCardIndex}
        onClick={() => setCurrentCardIndex(i)}
        className={`size-7 shrink-0 rounded-md overflow-hidden ${i===currentCardIndex ? "ring-2 ring-primary" : ""}`}>
        <img src={imageUrls?.[it.imageIndices[0]] ?? uploadedImages[it.imageIndices[0]]?.preview ?? ""} alt="" className="size-full object-cover" />
      </button>
    ))}
  </div>
  <button type="button" aria-label="Next item" disabled={currentCardIndex===bulkItems.length-1}
    onClick={() => setCurrentCardIndex(Math.min(bulkItems.length-1, currentCardIndex+1))}
    className="size-7 rounded-full border border-hairline flex items-center justify-center disabled:opacity-30">›</button>
</div>
```
- [ ] **Step 2: Auto-scroll active thumb into view** — add a `ref` on the active thumb and `useEffect(() => activeRef.current?.scrollIntoView({inline:"center", block:"nearest"}), [currentCardIndex])`.
- [ ] **Step 3:** Keep the footer Previous / ✕ / Next-Item buttons exactly as today (`AIReviewStep.tsx:246-281`). Editor photo row + fields unchanged.
- [ ] **Step 4: Typecheck + build** → clean. Visual check: clickable strip, ring not clipped, footer intact. Commit:
```bash
git add frontend/src/features/sell-wizard/steps/AIReviewStep.tsx
git commit -m "feat(sell): bulk review thumbnail-strip carousel nav"
```

### Task F4: Swipe-to-flip on the editor card

**Files:** Modify `frontend/src/features/sell-wizard/steps/AIReviewStep.tsx`

- [ ] **Step 1:** Add pointer handlers on the editor card wrapper. Record `pointerdown` x/y; on `pointerup`, if `|dx|>50 && |dx|>|dy|` and the gesture did **not** start on an `input/textarea/select/button` (check `e.target.closest('input,textarea,select,button')`), flip: `dx<0` → next, `dx>0` → prev (clamped via `setCurrentCardIndex`). Don't `preventDefault` (lets vertical scroll pass).
```tsx
const down = useRef<{x:number;y:number}|null>(null);
// on the editor card <div>:
onPointerDown={(e)=>{ down.current = {x:e.clientX,y:e.clientY}; }}
onPointerUp={(e)=>{
  const s = down.current; down.current = null; if (!s) return;
  if ((e.target as HTMLElement).closest('input,textarea,select,button')) return;
  const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx < 0) setCurrentCardIndex(Math.min(bulkItems.length-1, currentCardIndex+1));
    else setCurrentCardIndex(Math.max(0, currentCardIndex-1));
  }
}}
```
- [ ] **Step 2: Typecheck + build** → clean. Visual: swipe flips; editing a field doesn't trigger a flip. Commit:
```bash
git add frontend/src/features/sell-wizard/steps/AIReviewStep.tsx
git commit -m "feat(sell): swipe-to-flip bulk items (ignores text fields)"
```

### Task F5: TopSearches widget

**Files:** Create `frontend/src/components/TopSearches.tsx`

- [ ] **Step 1: Implement** — fetch on mount via `apiFetch("/api/searches/top?window_days=7&limit=5")`; handle loading / error / empty. Render a ranked text list (no thumbnails): `query_text` + `count`. On error or empty list → render a neutral placeholder (`<p>Upload photos to preview your listing</p>`), never throw.
```tsx
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface TopSearch { query_text: string; count: number; }

export function TopSearches() {
  const [items, setItems] = useState<TopSearch[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    apiFetch("/api/searches/top?window_days=7&limit=5")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { if (alive) setItems(d.items as TopSearch[]); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  if (error || (items && items.length === 0))
    return <p className="text-xs text-muted">Upload photos to preview your listing.</p>;
  if (!items) return <div className="h-24 animate-pulse bg-surface-soft rounded-md" aria-hidden="true" />;

  return (
    <div className="border border-hairline rounded-md p-3.5 bg-canvas">
      <p className="text-sm font-bold text-ink mb-0.5">🔎 People are searching for</p>
      <p className="text-[11px] text-muted mb-3">Top searches on Cosello this week</p>
      <ol className="space-y-2">
        {items.map((s, i) => (
          <li key={s.query_text} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink truncate"><span className="text-muted-soft mr-1.5">{i+1}</span>{s.query_text}</span>
            <span className="text-xs text-muted font-semibold shrink-0">{s.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```
- [ ] **Step 2: Typecheck + build** → clean. Commit:
```bash
git add frontend/src/components/TopSearches.tsx
git commit -m "feat(sell): TopSearches empty-state widget"
```

### Task F6: BulkPreviewAside component

**Files:** Create `frontend/src/components/BulkPreviewAside.tsx`

- [ ] **Step 1: Implement** — props `{ preview: BulkPreview; coverUrlFor: (imageIndex: number|null) => string|null; onPrev: ()=>void; onNext: ()=>void }`. Render: own ‹ › header + "Preview N of M"; full-size `aspect-square rounded-lg` image (`coverUrlFor(preview.item.imageIndex)`); community byline (`PLACEHOLDER_COMMUNITY` until the community selector lands — same fallback as the shipped card); title `formatTitle(brand,name)`; location; price `text-base font-semibold text-ink` (`$` + price); then the **checklist** re-evaluated from `preview.item`:
  - Title & brand: `brand.trim() || name.trim()` present
  - Price set: numeric > 0 (reuse the same parse as the existing checklist at `App.tsx:1012-1028`)
  - At least one photo: `imageIndex !== null`
  - Description ≥ 20 chars
Arrows call `onPrev`/`onNext` (disabled at ends via `preview.index`).
- [ ] **Step 2: Typecheck + build** → clean. Commit:
```bash
git add frontend/src/components/BulkPreviewAside.tsx
git commit -m "feat(sell): BulkPreviewAside — live bulk preview + checklist"
```

### Task F7: Wire the aside modes in App.tsx

**Files:** Modify `frontend/src/App.tsx`

- [ ] **Step 1: State + callback** — add `const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)` (import the type). Pass `onBulkPreviewChange={setBulkPreview}` to `<SellWizard>` (~line 1361).
- [ ] **Step 2: Mode selection in `newListingPreviewContent`** (~941). Compute once:
```tsx
const noPhotos = wizardImageCount === 0;
```
Render order:
  - `noPhotos` → `<TopSearches />`
  - else if `bulkPreview` → `<BulkPreviewAside preview={bulkPreview} coverUrlFor={...} onPrev={() => sellWizardRef.current?.setBulkCardIndex(bulkPreview.index-1)} onNext={() => sellWizardRef.current?.setBulkCardIndex(bulkPreview.index+1)} />`
  - else → the existing single-mode preview (unchanged).
`coverUrlFor` maps an `imageIndex` to a URL using the same source the wizard exposes (cover URL via `sellWizardRef.current?.getCoverImageUrl()` for the focused item, or thread an image-url resolver through `BulkPreview`; if per-item URL isn't available in App, extend `BulkPreview.item` with a resolved `imageUrl: string|null` built inside `selectBulkPreview` using the wizard's `imageUrls`). Prefer resolving the URL inside the wizard (it owns `segmentation.image_urls`) and putting `imageUrl` on `BulkPreview.item` — update Task F1's type to carry `imageUrl: string | null` instead of `imageIndex` if simpler.
- [ ] **Step 3: Typecheck + build** → clean. Visual: no photos → TopSearches; after upload+generate → bulk preview with working arrows + live edits; single/manual unchanged; mobile drawer mirrors. Commit:
```bash
git add frontend/src/App.tsx
git commit -m "feat(sell): aside renders top-searches / bulk-preview / single by mode"
```

> **Note (resolve in F1/F7):** prefer carrying a resolved `imageUrl: string | null` on `BulkPreview.item` (built in `selectBulkPreview` from the wizard's `segmentation.image_urls` / uploaded previews) so `App.tsx` needs no image-index knowledge. Pick this variant; drop `imageIndex` + `coverUrlFor` if so.

---

## Self-review

- **Spec coverage:** carousel nav F3; swipe F4 (ignores fields); footer kept F3; shared index F1/F2/F7; live preview + checklist F6/F2; aside modes (single/bulk/top-searches) F7; top-searches endpoint B1; loading/empty/error F5; mobile drawer F7. v2 (geo, supply-gap) excluded. ✓
- **Type consistency:** `BulkPreview`/`selectBulkPreview` defined F1, used F2/F6/F7; `setBulkCardIndex` defined F2, used F7; `TopSearch` shape matches the B1 JSON (`query_text`,`count`). The F1↔F7 note resolves the image-URL source (carry resolved `imageUrl` on `BulkPreview.item`).
- **Parallelization:** B1 is independent (locked contract) → backend-dev in parallel with frontend F1–F7 (sequential among themselves: F1→F2→{F3,F4}→F5→F6→F7). QA last.
- **No `any`; tests:** backend pytest (B1); frontend typecheck+build+visual.
