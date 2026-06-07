# Sell Wizard Drafts — Design

**Date:** 2026-05-25
**Branch:** `feat/sell-wizard-drafts`

## Goal

Persist in-progress sell-wizard sessions as **drafts** so users can resume after backgrounding the tab, switching apps, or losing the session to iOS Safari memory pressure. Drafts surface as a gallery on the Sell module entry — the user picks a draft to resume or starts fresh.

## Motivation

Surfaced during PR 3 mobile smoke testing (2026-05-24). Today the wizard's React state evaporates when iOS Safari backgrounds the tab and reclaims memory — user returns and everything restarts at the upload step. Worst paper-cut on mobile. The chosen UX (per user proposal): instead of auto-resume, show the recent drafts as a gallery so the user has explicit control and visibility.

## Architecture

**Persistence layer:** A new `frontend/src/lib/draftStorage.ts` wraps the [`idb`](https://github.com/jakearchibald/idb) library (~1KB minified, the standard IndexedDB promise wrapper). Single object store `drafts` keyed by UUID. Module exports:

```ts
listDrafts(userId: string): Promise<Draft[]>;
loadDraft(id: string): Promise<Draft | null>;
saveDraft(draft: Draft): Promise<void>;
deleteDraft(id: string): Promise<void>;
isAvailable(): boolean;  // false in Safari Private Browsing
```

All async, all atomic per call. Pure IndexedDB — no localStorage. Storage lives on the user's device; **zero cost to Cosello servers**.

**Wizard integration:** `useSellWizard` gains:
- `currentDraftId: string | null` — component state, identifies which draft is being edited.
- A debounced effect (500ms) that saves the persistable state whenever the reducer state changes AND `uploadedImages.length > 0`. If `currentDraftId === null` at save time, a new UUID is minted and the draft is created.
- A `loadFromDraft(id)` action that rehydrates state from IndexedDB. Files reconstructed from Blobs; preview URLs regenerated via `URL.createObjectURL`.
- A `clearForNewDraft()` action that resets to `initialSellWizardState` and sets `currentDraftId = null`.

**Sell entry surface:** A new `DraftsGallery` component replaces the wizard's direct mount on the Sell page. Lists the 3 most recent drafts (sorted by `updatedAt` DESC) above a "Start a new listing" CTA. Expand link reveals all drafts.

**Publish lifecycle:** On successful publish (single or all bulk items), the wizard fires `deleteDraft(currentDraftId)` and navigates back per existing behavior. Partial bulk failure → keep the draft, mutate `bulkItems` to drop the successful ones so the user can retry the failures.

## Scope

**In scope:**
- `draftStorage.ts` IndexedDB module + `idb` dependency added.
- `DraftsGallery` component (gallery + cards + CTA + storage banner + expand).
- `useSellWizard` modifications: `currentDraftId` state, debounced auto-save, `loadFromDraft`, `clearForNewDraft`, transient field filtering.
- Inline save-status indicator in the wizard header (`Saving…` / `Saved · Xs ago` / `Save failed`).
- Auto-prune banner inside the wizard when a draft resumes with now-invalid community IDs.
- Quota error handling: per-draft `lastSaveError` flag + gallery-level storage banner.
- Per-user scoping: `Draft.userId` field, gallery filters by current user.
- Auth-gated auto-save: drafts only created when user is authenticated.

**Out of scope (deferred):**
- Server-side draft sync (cross-device). Drafts are device-local only.
- Anonymous drafts (pre-auth). The wizard works in-session pre-auth as today; drafts require login.
- Migration of "anon" drafts when a user signs in. Drafts that were never persisted (pre-auth session) stay lost.
- Realtime sync across multiple tabs of the same user. Last-write-wins.
- Pagination of the drafts list. All drafts render flat when expanded (realistic count: <20).
- Search/filter in the gallery. Sort is `updatedAt DESC` only.
- Auto-expiry of old drafts. Drafts live until the user explicitly deletes them.
- Auto-eviction at a soft cap. No cap; quota errors handled gracefully instead.

## Draft data model

**Object store: `drafts`**

```ts
interface Draft {
  id: string;                    // UUID minted at draft-creation
  userId: string;                // Auth user UUID — gallery filters by this
  createdAt: number;             // Date.now() at creation
  updatedAt: number;             // Date.now() on each save
  mode: "single" | "bulk";       // single-listing vs bulk wizard
  state: PersistableState;       // wizard state minus transient fields
  files: { name: string; type: string; blob: Blob }[];  // raw photos
  lastSaveError?: "quota" | null;  // sticky flag for quota recovery banner
}
```

**`PersistableState`** is `SellWizardState` (from `useSellWizard.ts`) **minus** the transient fields:

| Field | Reason |
|---|---|
| `isGenerating`, `isPostingBulk` | In-flight ops; meaningless after reload |
| `dragImageState`, `dragOverGroup`, `dragOverGap` | Drag UI state |
| `instructionExiting` | Animation flag |
| `editingTitle` | Inline edit cursor |
| `uploadedImages` | Files persisted separately (see `Draft.files`) |

**Plus the PR-3-era component-level state** that lives outside the reducer:
- `selectedCommunityIds: number[]`
- `singlePostPhase: "review" | "pickup"`

**Special serialization:**
- `modifiedGroupIndices: Set<number>` — convert to `number[]` on save, back to `Set` on load.

**Rehydration** (`loadDraft(id)`):
1. `getDraft(id)` → IndexedDB read.
2. For each `files[i]`: try `new File([blob], name, { type })` + `URL.createObjectURL(file)`. Filter out failures.
3. `state.uploadedImages = files.map(({ file, preview }) => ({ file, preview }))`.
4. `state.modifiedGroupIndices = new Set(persistedNumberArray)`.
5. Intersect `state.selectedCommunityIds` with current `publicCommunities + privateCommunities` (auto-prune step).
6. Dispatch `LOAD_FROM_DRAFT` action to the reducer.

**Title computation** (used in gallery + indicator):

```ts
function draftTitle(draft: Draft): string {
  if (draft.mode === "bulk" && draft.state.bulkItems.length > 0) {
    return `Bulk · ${draft.state.bulkItems.length} items`;
  }
  if (draft.state.productDetails?.brand || draft.state.productDetails?.name) {
    return [draft.state.productDetails.brand, draft.state.productDetails.name]
      .filter(Boolean).join(" ");
  }
  return `Untitled · ${draft.files.length} photo${draft.files.length === 1 ? "" : "s"}`;
}
```

## Drafts gallery UI

**Surface:** The Sell page (`page === "newlisting"`) renders `<DraftsGallery>` first — wizard only mounts when the user taps a draft card or "Start a new listing."

**Layout** (mobile-first):

```
┌─────────────────────────────────────┐
│ [Storage banner if any draft has    │ ← only when any draft.lastSaveError === "quota"
│  lastSaveError === "quota"]         │
├─────────────────────────────────────┤
│ Drafts · {N} in progress            │ ← header, hidden when N === 0
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ [+] Start a new listing         │ │ ← primary CTA, always visible
│ └─────────────────────────────────┘ │
│                                     │
│ ┌──────┬──────────────────────┬──┐ │ ← draft cards: thumb + title + trash
│ │  📷  │ Patagonia Fleece     │🗑│ │
│ │      │ Single · 2h ago      │  │ │
│ └──────┴──────────────────────┴──┘ │
│ (top 3 by default; expand for more) │
│                                     │
│ [View all (N more) ↓]               │ ← only when totalDrafts > 3
└─────────────────────────────────────┘
```

**Card anatomy** (`<DraftCard>`):
- **Thumbnail:** 64×64px square, `aspect-square object-cover`, first file's preview URL. `border-hairline rounded-md`.
- **Title:** computed via `draftTitle()`. Bold, single line, `truncate`.
- **Meta line:** `{mode} · {relativeTime}`. Muted, `text-xs`, single line.
- **Trash button:** `size-9 rounded-md` on the right. Tap opens a confirm: *"Delete this draft? This can't be undone."* Confirm → `deleteDraft(id)`, gallery re-renders.
- **Whole card tappable** (except trash) → loads the draft into the wizard.

**Empty state** (no drafts):
- Hide "Drafts" header + count.
- Hide "View all" link.
- "Start a new listing" CTA stays.
- Small line below the CTA: *"Drafts save automatically as you work."*

**Storage banner** (when any draft has `lastSaveError === "quota"`):
- `bg-warning/10 border border-warning/30 rounded-md p-4` at the top.
- Icon: `AlertTriangle`. Text: *"Storage is full on this device. Delete some drafts below to free up space."*
- Auto-clears once no remaining draft has the flag.

**Private Browsing detection:**
- If `draftStorage.isAvailable() === false`, render banner: *"Drafts can't be saved in private browsing. Switch to a regular window to enable drafts."*
- Hide gallery; show only the "Start a new listing" CTA. Wizard works in-session.

**Sort:** `updatedAt DESC` only. No user-controlled sort.

**Expand:** Default 3 visible. Tap "View all" → all render. No pagination.

## Wizard integration + save feedback

**Auto-save flow:**

1. `useSellWizard` adds `currentDraftId: string | null`.
2. `useEffect` watches reducer state + `currentDraftId` + `selectedCommunityIds` + `singlePostPhase` + `isAuthenticated`. On change, schedule debounced save (500ms).
3. Debounced save checks: `isAuthenticated && currentUser?.id && uploadedImages.length > 0`. If any fails, skip.
4. If `currentDraftId === null`, mint UUID.
5. Build `Draft` object, call `saveDraft(draft)`.
6. On success: `setSaveStatus({ kind: "saved", at: Date.now() })`. Clear `lastSaveError` on the draft.
7. On `QuotaExceededError`: `setSaveStatus({ kind: "failed", reason: "quota" })`. Next save attempt writes `lastSaveError: "quota"` to the draft so the gallery banner appears.
8. On other errors: log, `setSaveStatus({ kind: "failed", reason: "unknown" })`.

**Save-status indicator:**

```ts
type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; reason: "quota" | "unknown" };
```

Visual treatment (small font, `text-[11px]`, right-aligned next to the step pill):
- `idle` — render nothing.
- `saving` — spinning `Loader2` + `Saving…`.
- `saved` — small green dot + `Saved · {relativeTime(at)}`. Auto-ticks every 15s.
- `failed` (`quota`) — `AlertTriangle` in warning color + `Save failed — storage full. Tap to manage drafts.` Tap → back to gallery.
- `failed` (`unknown`) — `AlertTriangle` + `Save failed — try again.` Tap → retry the last save.

**Resume flow** (`loadFromDraft(id)`):

1. Read draft from IndexedDB.
2. Rehydrate per the data-model steps.
3. **Auto-prune communities:** intersect `selectedCommunityIds` with current memberships. Drop missing ones. Set `prunedCommunityCount: number` if non-zero.
4. Dispatch `LOAD_FROM_DRAFT` with the hydrated state.
5. If `prunedCommunityCount > 0`, render a one-time banner inside the wizard: *"We removed {N} communities you're no longer a member of."* with dismiss X.

**New-draft flow** (`clearForNewDraft()`):
- Dispatch `RESET_STATE` (existing action).
- `setCurrentDraftId(null)`, `setSelectedCommunityIds([])`, `setSinglePostPhase("review")`.
- Next photo upload triggers draft creation.

**Publish-cleanup flow:**
- Successful single publish → `deleteDraft(currentDraftId)`.
- Successful bulk (all items) → `deleteDraft(currentDraftId)`.
- Partial bulk failure → keep draft, mutate `bulkItems` to drop the succeeded ones.

## Edge cases

**A. Auth requirement.** Drafts are per-user. The auto-save effect's guard makes saves only fire when authenticated. Pre-auth: small hint above the wizard, *"Sign in to save drafts of your work."* Logout clears `currentDraftId` (existing `resetNewListingForm` extended) but doesn't touch IndexedDB — drafts persist if the same user signs back in.

**B. IndexedDB unavailable.** Module's `isAvailable()` returns false in Safari Private Browsing. `saveDraft` becomes a no-op, `listDrafts` returns `[]`. Gallery shows the explanatory banner. Wizard works in-session.

**C. Quota recovery.** When a draft is deleted, `listDrafts` re-reads. If no surviving draft has `lastSaveError === "quota"`, the banner clears. On the next successful save, the saved draft's `lastSaveError` flag clears too.

**D. AI generation mid-flight.** `isGenerating` is transient — not persisted. On resume, if `productDetails` is missing but `uploadedImages` exists, the wizard shows the upload step; user can re-trigger AI via the existing path. No special handling.

**E. Broken file blobs on hydration.** Wrap `new File([blob], ...)` in try/catch; filter nulls out of `uploadedImages`. If the draft becomes unrecoverable (zero files + no `productDetails`), surface a one-time toast: *"This draft couldn't be loaded. It may have been corrupted."* + auto-`deleteDraft(id)`.

**F. Logout mid-edit.** Auth flip to false stops the auto-save effect (the guard fails). `resetNewListingForm` clears wizard state + `currentDraftId`. Draft persists in IndexedDB under the now-logged-out user's ID.

**G. Race during navigation.** App.tsx tracks `pendingDraftId: string | null`. The wizard reads it once on mount and clears it. `Start new` sets `pendingDraftId = null`.

**H. Realtime feel.** 500ms debounce + IndexedDB write (<10ms typical) = `Saving…` shows for ~500ms after the user stops, then flips to `Saved`. Tight enough to feel instant.

**I. Multi-tab.** IndexedDB is per-origin shared. Two tabs editing the same draft = last-write-wins; no merge. Acceptable — realistic case is one tab.

## Testing strategy

**Manual smoke (phone):**
1. Authed user. Open Sell. See "Start a new listing" CTA. Tap → wizard at upload step.
2. Upload a photo. Verify save-status indicator goes `idle → saving → saved`. Background the tab. Reopen.
3. Navigate back to Sell. Gallery shows 1 draft with the photo as thumbnail. Tap → wizard rehydrates at the upload step.
4. Continue to AI generation. Background again. Reopen. Verify `productDetails` persisted.
5. Change neighborhood from `/account`. Return to Sell. Open the draft. Verify auto-prune banner if communities changed.
6. Publish the listing. Return to Sell. Verify draft is gone from the gallery.
7. Create 4+ drafts. Verify gallery shows top 3 + "View all" expand link.
8. Tap delete on a card. Confirm modal. Verify draft is removed.
9. Log out. Log back in as same user. Drafts re-appear.
10. (If feasible) Open in Safari Private Browsing — verify banner + wizard still works in-session.

**Manual smoke (desktop):**
- Same as phone, with sanity check that the gallery + indicator render well in a desktop viewport.

**Frontend:**
- `npx tsc --noEmit` clean.
- `npm run build` clean.
- No FE unit test infra — smoke covers it.

## Order of operations

Single PR. Sequenced as commits for reviewability:

1. **Add `idb` dependency + `draftStorage.ts` module.** Pure infra. No UI yet. Includes `isAvailable()` detection.
2. **`useSellWizard` adds `currentDraftId`, debounced auto-save effect, `loadFromDraft`, `clearForNewDraft`.** Plus `LOAD_FROM_DRAFT` reducer action and the `RESET_STATE` extension.
3. **Save-status indicator in the wizard header.** Visual feedback. Auto-pruning banner inside the wizard.
4. **`DraftsGallery` component.** Cards + CTA + storage banner + expand. Reads from `draftStorage`.
5. **Wire `DraftsGallery` into the Sell page** (`page === "newlisting"` in App.tsx). Add `pendingDraftId` state. Existing wizard becomes conditional on the user having a draft loaded OR starting fresh.
6. **Publish-cleanup hooks.** Single + bulk publish paths call `deleteDraft(currentDraftId)` on success. Partial bulk handling.

Each commit type-checks and builds independently.

## References

- Memory queue entry: `~/.claude/projects/.../memory/project_queued_brainstorms.md` entry #4.
- iOS Safari memory pressure context: surfaced during PR 3 smoke testing (2026-05-24).
- Related primitives: `frontend/src/features/sell-wizard/useSellWizard.ts` (state hook), `frontend/src/features/sell-wizard/SellWizard.tsx` (wizard root), `frontend/src/components/ui/ModalShell.tsx` (used by confirm modals).
- `idb` library: https://github.com/jakearchibald/idb — the de facto promise wrapper for IndexedDB. ~1KB minified.
