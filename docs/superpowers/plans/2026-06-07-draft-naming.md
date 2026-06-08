# Draft Naming + Review Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users name their drafts (editable "New listing" heading, persisted + shown in the gallery), enlarge the gallery "Drafts" subheader, and declutter step-4 Review by removing the redundant mini item-nav strip.

**Architecture:** Frontend-only. The draft name lives in App-level state (`useNewListingForm`), threads down into `SellWizard`'s autosave for persistence (new optional `Draft.name`), and loads back up via a callback on draft open. Review declutter is a localized deletion in `AIReviewStep`. No backend, no API, no reducer changes.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS v4, IndexedDB (`idb`). No `any`. Verification is `npm run typecheck` + `npm run build` (the project has no unit-test harness; behavioral validation is handled by `qa-tester`).

**Branch:** `feat/draft-naming`, cut from `dev`.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/src/components/DraftsGallery.tsx` | Drafts list | Enlarge "Drafts" subheader; `draftTitle` uses `draft.name` |
| `frontend/src/lib/draftStorage.ts` | IndexedDB persistence | Add optional `name?: string` to `Draft` |
| `frontend/src/hooks/useNewListingForm.ts` | New-listing page state | Add `draftName` + `setDraftName`; clear in `reset()` |
| `frontend/src/features/sell-wizard/useDraftAutosave.ts` | Draft save/load | Persist `draftName` → `Draft.name`; surface `draft.name` on load |
| `frontend/src/features/sell-wizard/SellWizard.tsx` | Wizard shell | Accept `draftName` + `onDraftNameLoaded`; thread to autosave |
| `frontend/src/App.tsx` | New-listing page | Editable `h1` bound to `draftName`; wire props; clear on start-new |
| `frontend/src/features/sell-wizard/steps/AIReviewStep.tsx` | Bulk review | Remove mini item-nav strip + its ref/effect |

Tasks 1 and 7 are independent and can be done in any order. Tasks 2→3→4→5→6 form the editable-name chain and are ordered by dependency (persistence shape first, UI wiring last).

---

### Task 1: Enlarge the "Drafts" subheader

**Files:**
- Modify: `frontend/src/components/DraftsGallery.tsx:149-156`

- [ ] **Step 1: Bump the heading size**

Replace the header block (currently `text-[10px]`):

```tsx
      {/* Drafts header (only when drafts exist) */}
      {hasDrafts && (
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold tracking-tight text-ink">Drafts</h2>
          <span className="text-[11px] text-muted-soft">
            {drafts.length} in progress
          </span>
        </div>
      )}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DraftsGallery.tsx
git commit -m "style(drafts): enlarge 'Drafts' label to a real subheader"
```

---

### Task 2: Add optional `name` to the persisted `Draft`

**Files:**
- Modify: `frontend/src/lib/draftStorage.ts:39-54`

- [ ] **Step 1: Add the field**

In the `Draft` interface, add `name` directly after `mode`:

```ts
export interface Draft {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  mode: "single" | "bulk";
  // User-supplied custom name for the draft (the editable "New listing"
  // heading). Optional — older drafts and unnamed drafts have none, and the
  // gallery falls back to an item-count label. Not indexed; no DB version bump.
  name?: string;
  // PR-3-era component-level state that lives outside the reducer:
  selectedCommunityIds: number[];
  singlePostPhase: "review" | "pickup";
  state: PersistableState;
  files: PersistedFile[];
  lastSaveError?: "quota" | null;
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck`
Expected: clean (the field is optional, so no existing `Draft` literal breaks).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/draftStorage.ts
git commit -m "feat(drafts): add optional Draft.name for custom draft titles"
```

---

### Task 3: Hold the draft name in `useNewListingForm`

**Files:**
- Modify: `frontend/src/hooks/useNewListingForm.ts`

- [ ] **Step 1: Add the state**

Add alongside the other New-Listing-page fields (next to `const [mode, setMode] = ...`):

```ts
  // User-supplied draft name, edited via the "New listing" heading on the page.
  // Lives here (App owns both the heading and the wizard) and threads into the
  // wizard's autosave as Draft.name. Empty string = unnamed (heading shows a
  // placeholder; gallery falls back to an item-count label).
  const [draftName, setDraftName] = useState("");
```

- [ ] **Step 2: Clear it in `reset()`**

Add `setDraftName("");` inside the `reset` useCallback body (e.g. after `setMode("ai");`).

- [ ] **Step 3: Export it**

Add `draftName,` and `setDraftName,` to the returned object (near `mode, setMode`).

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useNewListingForm.ts
git commit -m "feat(sell): track editable draftName in useNewListingForm"
```

---

### Task 4: Persist + restore the name in autosave

**Files:**
- Modify: `frontend/src/features/sell-wizard/useDraftAutosave.ts`

- [ ] **Step 1: Extend the deps interface**

In `UseDraftAutosaveDeps`, add after `singlePostPhase` / `setSinglePostPhase`. `draftName` is optional so every commit in this chain type-checks independently (SellWizard wires it in Task 5):

```ts
  /** Editable draft name from the page heading; persisted as Draft.name. */
  draftName?: string;
  /** Called on draft load to push the saved name back up to the page heading. */
  onDraftNameLoaded?: (name: string) => void;
```

- [ ] **Step 2: Destructure them with a default**

In the destructured params of `useDraftAutosave({ ... })`, add `draftName = "",` and `onDraftNameLoaded,`.

- [ ] **Step 3: Write the name into the payload**

In `buildDraftPayload`, add `name` to the returned `Draft` (after `mode,`):

```ts
      mode,
      name: draftName.trim() || undefined,
```

Add `draftName` to the `buildDraftPayload` useCallback dependency array.

- [ ] **Step 4: Re-save when the name changes**

Add `draftName,` to the debounced auto-save effect's dependency array (the one ending `currentDraftId,`).

- [ ] **Step 5: Surface the saved name on load**

At the end of `loadFromDraft`, after `if (prunedCount > 0) setPrunedCommunityCount(prunedCount);`, add:

```ts
    onDraftNameLoaded?.(draft.name ?? "");
```

Add `onDraftNameLoaded` to the `loadFromDraft` useCallback dependency array.

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run typecheck`
Expected: clean. The `draftName` dep is optional/defaulted, so the existing `SellWizard` call site (which doesn't pass it yet) still type-checks — this commit stands on its own.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/sell-wizard/useDraftAutosave.ts
git commit -m "feat(drafts): persist draftName and restore it on load"
```

---

### Task 5: Thread the name through `SellWizard`

**Files:**
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx:43-74` (props), `:105-106` (destructure), `:168-185` (autosave call)

- [ ] **Step 1: Add the props to `SellWizardProps`**

After `onDraftLoaded?: () => void;` add:

```ts
  // Editable draft name, owned by the page heading. Threaded into autosave as
  // Draft.name; onDraftNameLoaded pushes a loaded draft's name back to the page.
  draftName?: string;
  onDraftNameLoaded?: (name: string) => void;
```

- [ ] **Step 2: Destructure with a default**

In the component params, after `onDraftLoaded,` add:

```ts
  draftName = "",
  onDraftNameLoaded,
```

- [ ] **Step 3: Pass into `useDraftAutosave`**

In the `useDraftAutosave({ ... })` call, after `onDraftLoaded,` add:

```ts
    draftName,
    onDraftNameLoaded,
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both clean (Task 4's error is now resolved; App still compiles because the new SellWizard props are optional).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "feat(sell): thread draftName + onDraftNameLoaded into SellWizard"
```

---

### Task 6: Editable heading + wiring in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx:801-816` (heading + start-new), `:839-875` (SellWizard props)

- [ ] **Step 1: Replace the static `h1` with an editable input**

Replace the heading block at `:812-816`:

```tsx
              <div className="min-w-0">
                <input
                  type="text"
                  value={newListing.draftName}
                  onChange={(e) => newListing.setDraftName(e.target.value)}
                  placeholder="New listing"
                  maxLength={80}
                  aria-label="Listing name"
                  className="w-full bg-transparent border-0 p-0 text-3xl font-extrabold tracking-display text-ink leading-[1.05] placeholder:text-muted-soft focus:outline-none focus:ring-0"
                />
              </div>
```

- [ ] **Step 2: Clear the name when starting a new draft**

In the `DraftsGallery` props (`:805`), update `onStartNew`:

```tsx
              onStartNew={() => { newListing.setDraftName(""); setDraftRouteState({ kind: "new" }); }}
```

- [ ] **Step 3: Pass name props to `SellWizard`**

In the `<SellWizard ... />` props (after `onDraftLoaded={...}` at `:861-866`), add:

```tsx
                    draftName={newListing.draftName}
                    onDraftNameLoaded={newListing.setDraftName}
```

- [ ] **Step 4: Verify**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Manual check (dev server)**

Run `npm run dev`, open the New Listing page. Type a name in the heading, commit a draft (run AI on a photo), reload the page, reopen the draft from the gallery → the heading shows the saved name.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(sell): editable 'New listing' heading bound to draftName"
```

---

### Task 7: Show the custom name in the gallery

**Files:**
- Modify: `frontend/src/components/DraftsGallery.tsx:46-49`

- [ ] **Step 1: Prefer the custom name in `draftTitle`**

```tsx
function draftTitle(draft: Draft): string {
  const custom = draft.name?.trim();
  if (custom) return custom;
  const n = itemCount(draft);
  return `${n} item${n === 1 ? "" : "s"}`;
}
```

- [ ] **Step 2: Verify**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DraftsGallery.tsx
git commit -m "feat(drafts): show custom draft name in the gallery (fallback to item count)"
```

---

### Task 8: Remove the mini item-nav strip in step-4 Review

**Files:**
- Modify: `frontend/src/features/sell-wizard/steps/AIReviewStep.tsx:42-99`

- [ ] **Step 1: Delete the strip's ref + auto-scroll effect**

Remove `activeThumbRef` (`:43`) and the `useEffect` that scrolls it into view (`:46-49`). After this, `useEffect` is no longer used — remove it from the React import on `:1` (`import React, { useRef } from "react";`). Keep `useRef` (still used by `bulkPhotoInputRef` and `swipeDown`).

- [ ] **Step 2: Delete the nav row, keep the counter**

Keep the "Item X of Y" counter block (`:56-60`). Delete the entire item-nav row — the `‹` button, the `bulkItems.map` thumbnail strip, and the `›` button (`:61-99`). The card (`:101+`) with the large per-item photo thumbnails is unchanged.

After the edit, the return opens:

```tsx
  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-muted shrink-0">
          Item {currentCardIndex + 1} of {bulkItems.length}
        </span>
      </div>

      <div
        className="p-6 bg-surface-card rounded-md border border-hairline shadow-card space-y-4 text-left"
        onPointerDown={(e) => { swipeDown.current = { x: e.clientX, y: e.clientY }; }}
        /* ...rest unchanged... */
```

- [ ] **Step 3: Verify no unused symbols remain**

Run: `cd frontend && npm run typecheck`
Expected: clean. If it reports an unused `React`/`useEffect`/`activeThumbRef`, remove the offending leftover. (Navigation still works via the bottom Previous/Next buttons and the existing swipe handler on the card.)

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/sell-wizard/steps/AIReviewStep.tsx
git commit -m "style(sell): remove redundant mini item-nav strip in step-4 review"
```

---

## QA Handoff Criteria (for `qa-tester`, after implementation)

1. **Drafts subheader** — "Drafts" reads as a clear subheader, not a micro-label.
2. **Name round-trips** — type a name → commit a draft → reload → reopen from gallery → heading and gallery both show the name.
3. **Empty-name fallbacks** — a draft with no name shows placeholder "New listing" in the heading and "{n} item(s)" in the gallery.
4. **Start-new clears** — tapping "Start a new listing" opens a blank heading (no stale name).
5. **Review declutter** — step-4 Review shows no mini item-nav strip; the large photo thumbnails (add `+` / delete `×`) remain; moving between items via Previous/Next and swipe still works; the "Item X of Y" counter is intact.
6. **Gates** — `npm run typecheck` and `npm run build` both clean. No `any` introduced.
