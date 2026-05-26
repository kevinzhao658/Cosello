# Sell Wizard Drafts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist in-progress sell-wizard sessions to IndexedDB so users can resume after backgrounding the iOS Safari tab. Surface drafts as a gallery on the Sell module entry; auto-save continuously with visible feedback; per-user-scoped, never expires, no cap, quota-aware fallback.

**Architecture:** Three-layer split. (1) A new `draftStorage.ts` wraps the `idb` library — single `drafts` object store keyed by UUID, exposing `listDrafts/loadDraft/saveDraft/deleteDraft/isAvailable`. (2) `useSellWizard` gains a `LOAD_FROM_DRAFT` reducer action that replaces full state. (3) `SellWizard.tsx` owns the debounced auto-save effect + save-status indicator + `loadFromDraft`/`clearForNewDraft` orchestration (because it has the `selectedCommunityIds` and `singlePostPhase` PR-3-era state). A new `DraftsGallery` component renders on the Sell page before the wizard mounts; `App.tsx` routes via a `pendingDraftId` state.

**Tech Stack:** React 18 + TypeScript + Tailwind v4 + `idb` (~1KB minified, the standard IndexedDB promise wrapper). Existing `useReducer`-based hook in `useSellWizard.ts`. `tsc --noEmit` + Vite build for verification (no FE unit test infra).

**Branch:** `feat/sell-wizard-drafts` (already cut from `dev` at `611e83c` — spec only).

---

## File map

**Create:**
- `frontend/src/lib/draftStorage.ts` — IndexedDB wrapper module. Type definitions, `isAvailable()`, `listDrafts`, `loadDraft`, `saveDraft`, `deleteDraft`.
- `frontend/src/components/DraftsGallery.tsx` — Gallery component with cards, expand, CTA, storage banner.

**Modify:**
- `frontend/package.json` — add `idb` dependency.
- `frontend/src/features/sell-wizard/useSellWizard.ts` — add `LOAD_FROM_DRAFT` action + reducer case.
- `frontend/src/features/sell-wizard/SellWizard.tsx` — `currentDraftId` state, debounced auto-save effect, save-status indicator, `loadFromDraft`/`clearForNewDraft` functions, community-prune banner, publish-cleanup wiring.
- `frontend/src/App.tsx` — add `pendingDraftId` state, render `<DraftsGallery>` before the wizard on the Sell page, pass `pendingDraftId` to SellWizard.

---

## Task 1: Add `idb` + create `draftStorage.ts` module

**Files:**
- Modify: `frontend/package.json` (add `idb` dependency)
- Create: `frontend/src/lib/draftStorage.ts`

- [ ] **Step 1: Install the `idb` package**

Run from `frontend/`:

```bash
npm install idb
```

Expected: `package.json` and `package-lock.json` updated, `idb` appears under `dependencies`. The package is ~1KB minified.

- [ ] **Step 2: Create `draftStorage.ts` with types and CRUD**

Create `frontend/src/lib/draftStorage.ts` with this exact content:

```ts
import { openDB, type IDBPDatabase } from "idb";
import type { SellWizardState } from "../features/sell-wizard/useSellWizard";

// IndexedDB stores `Draft` rows. Files are kept as Blobs alongside the
// serialized state so a single read/write transaction stays atomic. Pure
// IndexedDB — no localStorage. Storage is per-origin on the user's device.
const DB_NAME = "cosello-drafts";
const DB_VERSION = 1;
const STORE_DRAFTS = "drafts";

// Transient SellWizardState fields that should NEVER persist. Defaulted on
// every rehydration so the wizard mounts cleanly.
const TRANSIENT_FIELDS = [
  "isGenerating",
  "isPostingBulk",
  "dragImageState",
  "dragOverGroup",
  "dragOverGap",
  "instructionExiting",
  "editingTitle",
  "uploadedImages",
] as const;

// `PersistableState` is SellWizardState minus the transient fields above
// AND minus uploadedImages (files are stored separately as Blobs).
// modifiedGroupIndices is a Set — serialized as number[] in PersistedState.
export type PersistableState = Omit<
  SellWizardState,
  typeof TRANSIENT_FIELDS[number] | "modifiedGroupIndices"
> & {
  modifiedGroupIndices: number[];
};

export interface PersistedFile {
  name: string;
  type: string;
  blob: Blob;
}

export interface Draft {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  mode: "single" | "bulk";
  // PR-3-era component-level state that lives outside the reducer:
  selectedCommunityIds: number[];
  singlePostPhase: "review" | "pickup";
  // Reducer state minus transient fields:
  state: PersistableState;
  // Raw photos (reconstructed into File objects on hydration):
  files: PersistedFile[];
  // Sticky flag — set when the last save threw QuotaExceededError. Cleared
  // on a subsequent successful save. Drives the gallery storage banner.
  lastSaveError?: "quota" | null;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let _isAvailable: boolean | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const store = db.createObjectStore(STORE_DRAFTS, { keyPath: "id" });
          store.createIndex("by-user-updated", ["userId", "updatedAt"]);
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Returns true iff IndexedDB is usable in the current browser context.
 * False in Safari Private Browsing and some content-blocker setups.
 * Result is cached after the first call.
 */
export async function isAvailable(): Promise<boolean> {
  if (_isAvailable !== null) return _isAvailable;
  try {
    await getDb();
    _isAvailable = true;
  } catch {
    _isAvailable = false;
  }
  return _isAvailable;
}

/**
 * Returns all drafts for a given user, sorted by updatedAt DESC.
 * Returns [] when IndexedDB is unavailable.
 */
export async function listDrafts(userId: string): Promise<Draft[]> {
  if (!(await isAvailable())) return [];
  try {
    const db = await getDb();
    const all = (await db.getAll(STORE_DRAFTS)) as Draft[];
    return all
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Returns a single draft by id, or null if not found / unavailable.
 */
export async function loadDraft(id: string): Promise<Draft | null> {
  if (!(await isAvailable())) return null;
  try {
    const db = await getDb();
    const draft = (await db.get(STORE_DRAFTS, id)) as Draft | undefined;
    return draft ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes a draft (insert or replace). Caller catches QuotaExceededError to
 * surface the failure to the user. Other errors are re-thrown — let them
 * bubble for diagnostics.
 */
export async function saveDraft(draft: Draft): Promise<void> {
  if (!(await isAvailable())) return;
  const db = await getDb();
  await db.put(STORE_DRAFTS, draft);
}

/**
 * Removes a draft by id. No-op when unavailable or not found.
 */
export async function deleteDraft(id: string): Promise<void> {
  if (!(await isAvailable())) return;
  const db = await getDb();
  await db.delete(STORE_DRAFTS, id);
}
```

- [ ] **Step 3: Typecheck**

Run from `frontend/`:

```bash
npx tsc --noEmit
```

Expected: clean. The `SellWizardState` import from `useSellWizard` works because that type is exported.

- [ ] **Step 4: Build**

Run from `frontend/`:

```bash
npm run build
```

Expected: PASS. `idb` should appear in the dependency graph; no warnings.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/draftStorage.ts
git commit -m "$(cat <<'EOF'
feat(drafts): IndexedDB-backed draftStorage module + idb dependency

Wraps the idb library (~1KB) with a tiny CRUD surface: isAvailable,
listDrafts (per-user, sorted updatedAt DESC), loadDraft, saveDraft,
deleteDraft. Single object store 'drafts' keyed by UUID. Defines the
Draft schema with PersistableState (SellWizardState minus transient
fields + uploadedImages, which are persisted separately as Blobs).

Module-level db promise + isAvailable caching mean the IDB handshake
only happens once per session.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reducer `LOAD_FROM_DRAFT` action

**Files:**
- Modify: `frontend/src/features/sell-wizard/useSellWizard.ts` (action type, reducer case, action creator)

- [ ] **Step 1: Add the action type to the discriminated union**

In `frontend/src/features/sell-wizard/useSellWizard.ts`, find the `SellWizardAction` union (around line 94-141). Add a new variant immediately before the closing `;`:

```ts
  | { type: "LOAD_FROM_DRAFT"; state: SellWizardState }
```

Place it before the closing `| { type: "PARTIAL_RESET_FROM_BUY_SWITCH" };` line. The full closing of the union should read:

```ts
  | { type: "RESET_FROM_LOGOUT" }
  | { type: "PARTIAL_RESET_FROM_BUY_SWITCH" }
  | { type: "LOAD_FROM_DRAFT"; state: SellWizardState };
```

- [ ] **Step 2: Add the reducer case**

In the same file, find the `sellWizardReducer` function (around line 150). Add a new case immediately before the `default:` or final brace. Find a stable insertion point — the `"PARTIAL_RESET_FROM_BUY_SWITCH"` case ends with a `return` statement near line 557-565. Insert immediately after that case's return, before the closing brace of the switch.

```ts
    case "LOAD_FROM_DRAFT":
      // Replace the entire reducer state with the hydrated payload.
      // Caller is responsible for filtering transient fields out before save
      // (draftStorage.ts) and defaulting them back in on load (SellWizard.tsx).
      return action.state;
```

- [ ] **Step 3: Add the action creator to `SellWizardActions`**

In the same file, find the `SellWizardActions` interface (around line 572). Add a new method to the interface:

```ts
  loadFromDraft: (state: SellWizardState) => void;
```

- [ ] **Step 4: Wire the dispatcher in `useSellWizard`**

In the same file, find the `actions = useMemo<SellWizardActions>(() => ({` block (around line 624). Add the new dispatcher at the end of the object literal (immediately before the closing `}), []);`):

```ts
    loadFromDraft: (state) => dispatch({ type: "LOAD_FROM_DRAFT", state }),
```

The closing of the actions block should now read:

```ts
    partialResetFromBuySwitch: () => dispatch({ type: "PARTIAL_RESET_FROM_BUY_SWITCH" }),
    loadFromDraft: (state) => dispatch({ type: "LOAD_FROM_DRAFT", state }),
  }), []);
```

- [ ] **Step 5: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Build**

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/sell-wizard/useSellWizard.ts
git commit -m "$(cat <<'EOF'
feat(drafts): LOAD_FROM_DRAFT reducer action

Adds a single new action that replaces the entire SellWizardState in
one dispatch. Used by SellWizard.tsx's loadFromDraft orchestration
(Task 4) after IndexedDB rehydration. The caller is responsible for
defaulting transient fields back to initial values before dispatching
— LOAD_FROM_DRAFT is a literal state swap.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Auto-save effect + save-status indicator in SellWizard

**Files:**
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx`

Adds the `currentDraftId` state, the debounced auto-save effect, and the inline save-status indicator. Does NOT yet implement `loadFromDraft` or `clearForNewDraft` (Task 4).

- [ ] **Step 1: Add imports**

In `frontend/src/features/sell-wizard/SellWizard.tsx`, find the existing imports block. Add this import after the existing `useAuth` import (around line 7):

```ts
import * as draftStorage from "../../lib/draftStorage";
import type { Draft, PersistableState, PersistedFile } from "../../lib/draftStorage";
```

The `Loader2` icon from `lucide-react` is already imported (used elsewhere in the wizard). `AlertTriangle` is already imported. No new icon imports needed.

- [ ] **Step 2: Add a constant for the debounce interval**

Add this near the top of the file, after the imports:

```ts
const DRAFT_SAVE_DEBOUNCE_MS = 500;
```

- [ ] **Step 3: Add the SaveStatus type and state inside the SellWizard component**

In `SellWizard.tsx`, find the component body (around line 84). After the existing `useAuth` destructure (`const { isAuthenticated, user, token } = useAuth();`), add:

```ts
  // Drafts: identify which draft this wizard instance is editing.
  // null = no draft yet (pre-first-photo).
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  type SaveStatus =
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "saved"; at: number }
    | { kind: "failed"; reason: "quota" | "unknown" };
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  // Auto-ticking "Saved · Xs ago" — bump every 15s while the indicator shows
  // a `saved` state so the relative timestamp stays fresh.
  const [, setSavedTick] = useState(0);
  useEffect(() => {
    if (saveStatus.kind !== "saved") return;
    const id = setInterval(() => setSavedTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, [saveStatus.kind]);
```

- [ ] **Step 4: Add a helper that builds a `Draft` from current wizard state**

Add this function inside the component, after the state declarations:

```ts
  // Build a Draft payload from the current reducer state + component-level
  // state (selectedCommunityIds, singlePostPhase). Filters transient fields.
  const buildDraftPayload = useCallback((): Draft | null => {
    if (!user?.id) return null;
    if (state.uploadedImages.length === 0) return null;

    const files: PersistedFile[] = state.uploadedImages.map((img) => ({
      name: img.file.name,
      type: img.file.type,
      blob: img.file,
    }));

    // Build PersistableState by stripping transient fields and serializing
    // the Set as a number[]. Avoid passing through uploadedImages —
    // those live in `files`.
    const persistable: PersistableState = {
      bulkReviewPhase: state.bulkReviewPhase,
      segmentation: state.segmentation,
      brandHints: state.brandHints,
      names: state.names,
      rationale: state.rationale,
      rationaleOther: state.rationaleOther,
      productDetails: state.productDetails,
      bulkItems: state.bulkItems,
      currentCardIndex: state.currentCardIndex,
      bulkPickupLocation: state.bulkPickupLocation,
      postPickupLocation: state.postPickupLocation,
      segmentationError: state.segmentationError,
      groupingsModified: state.groupingsModified,
      modifiedGroupIndices: Array.from(state.modifiedGroupIndices),
      newTag: state.newTag,
    };

    const mode: "single" | "bulk" =
      state.bulkItems.length > 0 || state.segmentation !== null ? "bulk" : "single";

    const now = Date.now();
    return {
      id: currentDraftId ?? crypto.randomUUID(),
      userId: user.id,
      createdAt: now, // will be overwritten if the draft already exists
      updatedAt: now,
      mode,
      selectedCommunityIds,
      singlePostPhase,
      state: persistable,
      files,
      lastSaveError: null,
    };
  }, [currentDraftId, selectedCommunityIds, singlePostPhase, state, user?.id]);
```

- [ ] **Step 5: Add the debounced auto-save effect**

After `buildDraftPayload`, add:

```ts
  // Debounced auto-save. Fires whenever the persistable wizard state
  // changes AND the user is authenticated AND at least one photo is
  // uploaded. New drafts get a fresh UUID minted on first save.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (state.uploadedImages.length === 0) {
      // Pre-first-photo: indicator stays idle.
      setSaveStatus({ kind: "idle" });
      return;
    }

    setSaveStatus({ kind: "saving" });
    const timerId = setTimeout(async () => {
      const draft = buildDraftPayload();
      if (!draft) return;

      // If a draft with this id already exists, preserve its createdAt.
      try {
        const existing = currentDraftId ? await draftStorage.loadDraft(currentDraftId) : null;
        if (existing) draft.createdAt = existing.createdAt;

        await draftStorage.saveDraft(draft);

        if (!currentDraftId) setCurrentDraftId(draft.id);
        setSaveStatus({ kind: "saved", at: Date.now() });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name ?? "";
        if (name === "QuotaExceededError") {
          // Best-effort: re-write the draft with lastSaveError set so the
          // gallery banner appears. If that write fails too, swallow.
          try {
            await draftStorage.saveDraft({ ...draft, lastSaveError: "quota" });
          } catch { /* nothing more we can do */ }
          setSaveStatus({ kind: "failed", reason: "quota" });
        } else {
          // Surface but don't crash. Console for diagnostics.
          console.error("Draft save failed:", err);
          setSaveStatus({ kind: "failed", reason: "unknown" });
        }
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timerId);
    // We intentionally do NOT include buildDraftPayload — its identity
    // changes every render (depends on state). The deps below cover the
    // input space that affects the payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isAuthenticated,
    user?.id,
    state,
    selectedCommunityIds,
    singlePostPhase,
    currentDraftId,
  ]);
```

- [ ] **Step 6: Add a `relativeTime` helper near the top of the file**

After the `DRAFT_SAVE_DEBOUNCE_MS` constant, add:

```ts
// Returns a short relative-time string for the save-status indicator.
// "just now" / "Ns ago" / "Nm ago" / "Nh ago".
function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
```

- [ ] **Step 7: Render the save-status indicator in the wizard's render output**

Find the wizard's top-level returned JSX (search for the outermost JSX expression). Near the top of the rendered tree (next to whatever step pill / breadcrumb is at the top of the wizard view), add this indicator. Since the wizard has several top-level rendering paths (UploadStep, GroupsStep, single review, single pickup), the safest universal placement is at the very top of the wizard's root `<div>`, right-aligned:

In the JSX, find the outermost wrapping `<div>` or `<>` of the wizard's return. Insert this as its FIRST child:

```tsx
      {saveStatus.kind !== "idle" && (
        <div className="flex justify-end items-center gap-1.5 px-4 pt-2 text-[11px] font-medium">
          {saveStatus.kind === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin text-muted" aria-hidden />
              <span className="text-muted">Saving…</span>
            </>
          )}
          {saveStatus.kind === "saved" && (
            <>
              <span className="size-1.5 rounded-full bg-primary shrink-0" aria-hidden />
              <span className="text-muted">Saved · {relativeTime(saveStatus.at)}</span>
            </>
          )}
          {saveStatus.kind === "failed" && saveStatus.reason === "quota" && (
            <button
              type="button"
              onClick={onSwitchToBuy}
              className="inline-flex items-center gap-1.5 text-warning hover:underline"
            >
              <AlertTriangle className="size-3" aria-hidden />
              <span>Save failed — storage full. Tap to manage drafts.</span>
            </button>
          )}
          {saveStatus.kind === "failed" && saveStatus.reason === "unknown" && (
            <>
              <AlertTriangle className="size-3 text-warning" aria-hidden />
              <span className="text-warning">Save failed — try again.</span>
            </>
          )}
        </div>
      )}
```

Note: the `quota` branch uses `onSwitchToBuy` as a placeholder navigation back to the home/gallery context (it'll be replaced with a proper `onBackToDrafts` prop in Task 6 when DraftsGallery is wired in). For now, this lets the indicator render. The `failed unknown` branch shows a non-actionable warning — retry happens automatically on the next reducer change.

- [ ] **Step 8: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If there are errors about `crypto.randomUUID` not existing on `typeof crypto`, ensure TypeScript's lib includes `dom` (it does in this project — verify with `cat tsconfig.json | grep lib`).

- [ ] **Step 9: Build**

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "$(cat <<'EOF'
feat(drafts): debounced auto-save + inline save-status indicator

SellWizard gains a currentDraftId state, a buildDraftPayload helper,
and a debounced (500ms) auto-save effect that fires whenever the
persistable wizard state changes AND the user is authenticated AND
at least one photo is uploaded. New drafts mint a UUID on first save.

The save-status indicator shows in the wizard header:
  - idle: hidden (pre-photo)
  - saving: spinner + "Saving…"
  - saved: green dot + "Saved · Xs ago" (auto-ticks every 15s)
  - failed/quota: warning + "Save failed — storage full" (tappable)
  - failed/unknown: warning + "Save failed — try again"

Quota errors also mark the draft with lastSaveError so the gallery
banner (Task 5) picks it up. loadFromDraft and clearForNewDraft are
added in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `loadFromDraft`, `clearForNewDraft`, prune banner

**Files:**
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx` (add functions + banner UI)
- Modify: `frontend/src/features/sell-wizard/SellWizard.tsx` props interface (add `pendingDraftId`, `onDraftDeleted`)

- [ ] **Step 1: Extend `SellWizardProps` with the new draft-routing props**

In `frontend/src/features/sell-wizard/SellWizard.tsx`, find the `SellWizardProps` interface (around line 36). Add two new optional props at the end of the interface, before the closing `}`:

```ts
  // Drafts. Parent sets pendingDraftId when the user taps a draft card; the
  // wizard loads it on mount and clears the parent's state via onDraftLoaded.
  pendingDraftId?: string | null;
  onDraftLoaded?: () => void;
```

- [ ] **Step 2: Destructure the new props**

Find the function signature where props are destructured (around line 70). Add the new ones to the destructure:

```ts
  pendingDraftId = null,
  onDraftLoaded,
```

Place these alongside the existing prop destructures (e.g. after `privateCommunities = []`).

- [ ] **Step 3: Add the prune-banner state**

Inside the component, near the other state declarations from Task 3 (around the `saveStatus` block), add:

```ts
  // When a draft resumes with community IDs the user is no longer a member
  // of, we drop them and show a one-time banner. Cleared on dismiss.
  const [prunedCommunityCount, setPrunedCommunityCount] = useState(0);
```

- [ ] **Step 4: Add the `loadFromDraft` async function**

Inside the component, after `buildDraftPayload` (from Task 3), add:

```ts
  // Hydrate from IndexedDB, reconstruct File objects from Blobs, auto-prune
  // community IDs the user is no longer a member of, then swap reducer state
  // in one LOAD_FROM_DRAFT dispatch.
  const loadFromDraft = useCallback(async (id: string) => {
    const draft = await draftStorage.loadDraft(id);
    if (!draft) return;

    // Reconstruct File + preview URL per persisted blob. Filter failures.
    const rehydratedImages = draft.files
      .map(({ name, type, blob }) => {
        try {
          const file = new File([blob], name, { type });
          return { file, preview: URL.createObjectURL(file) };
        } catch {
          return null;
        }
      })
      .filter((x): x is { file: File; preview: string } => x !== null);

    // Build the SellWizardState the reducer expects. Transient fields
    // default to initial values; uploadedImages = rehydratedImages;
    // modifiedGroupIndices = Set(persisted array).
    const hydratedState: SellWizardState = {
      ...draft.state,
      uploadedImages: rehydratedImages,
      modifiedGroupIndices: new Set(draft.state.modifiedGroupIndices),
      isGenerating: false,
      isPostingBulk: false,
      dragImageState: null,
      dragOverGroup: null,
      dragOverGap: null,
      instructionExiting: false,
      editingTitle: null,
      segmentationError: draft.state.segmentationError ?? null,
    };

    // Auto-prune communities: intersect saved picks with current memberships.
    const currentMemberIds = new Set([
      ...publicCommunities.map((c) => c.id),
      ...privateCommunities.map((c) => c.id),
    ]);
    const validIds = draft.selectedCommunityIds.filter((id) => currentMemberIds.has(id));
    const prunedCount = draft.selectedCommunityIds.length - validIds.length;

    // Apply state in one frame.
    actions.loadFromDraft(hydratedState);
    setSelectedCommunityIds(validIds);
    setSinglePostPhase(draft.singlePostPhase);
    setCurrentDraftId(draft.id);
    if (prunedCount > 0) setPrunedCommunityCount(prunedCount);
  }, [actions, publicCommunities, privateCommunities]);
```

- [ ] **Step 5: Add the `clearForNewDraft` function**

Immediately after `loadFromDraft`, add:

```ts
  // Reset everything for a brand-new draft. Called when the user taps
  // "Start a new listing" from the gallery.
  const clearForNewDraft = useCallback(() => {
    actions.clearAll();
    setSelectedCommunityIds([]);
    setSinglePostPhase("review");
    setCurrentDraftId(null);
    setPrunedCommunityCount(0);
    setSaveStatus({ kind: "idle" });
    initializedFromNeighborhoodRef.current = false;
  }, [actions]);
```

Note: `initializedFromNeighborhoodRef` is a useRef declared in the PR-3 era code in SellWizard. We reset it here so a brand-new draft re-seeds the neighborhood pre-selection.

- [ ] **Step 6: Wire `pendingDraftId` into a mount effect**

Add an effect that fires `loadFromDraft` once when `pendingDraftId` changes from null to a value:

```ts
  // When the parent (App.tsx) routes us to a specific draft, load it once.
  const previousPendingDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingDraftId && pendingDraftId !== previousPendingDraftIdRef.current) {
      previousPendingDraftIdRef.current = pendingDraftId;
      void loadFromDraft(pendingDraftId).then(() => {
        onDraftLoaded?.();
      });
    }
  }, [pendingDraftId, loadFromDraft, onDraftLoaded]);
```

- [ ] **Step 7: Extend `resetForLogout` to clear `currentDraftId`**

The wizard exposes a `resetForLogout` imperative handle via `useImperativeHandle` that App.tsx calls on logout (the existing code calls `sellWizardRef.current?.resetForLogout()` inside `handleLogout`). Find the existing `useImperativeHandle` block:

```bash
grep -n "useImperativeHandle\|resetForLogout" frontend/src/features/sell-wizard/SellWizard.tsx
```

Inside the existing `resetForLogout` function body, immediately before any reducer dispatch, add:

```ts
      setCurrentDraftId(null);
      setSelectedCommunityIds([]);
      setSinglePostPhase("review");
      setPrunedCommunityCount(0);
      setSaveStatus({ kind: "idle" });
```

These mirror what `clearForNewDraft` does — on logout we want a fully clean slate. The draft itself stays in IndexedDB (per spec edge case F); only the wizard's in-memory state resets.

- [ ] **Step 8: Render the prune banner**

Find the wizard's main rendered area (where the upload/groups/review steps render). Near the top of that area, render this banner BELOW the save-status indicator from Task 3:

```tsx
      {prunedCommunityCount > 0 && (
        <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-body">
          <AlertTriangle className="size-3.5 shrink-0 text-warning mt-0.5" aria-hidden />
          <span className="flex-1">
            We removed {prunedCommunityCount} communit{prunedCommunityCount === 1 ? "y" : "ies"} you're no longer a member of.
          </span>
          <button
            type="button"
            onClick={() => setPrunedCommunityCount(0)}
            aria-label="Dismiss"
            className="text-muted hover:text-ink shrink-0"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
```

Note: `X` icon is already imported in SellWizard.tsx.

- [ ] **Step 9: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 10: Build**

```bash
cd frontend && npm run build
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "$(cat <<'EOF'
feat(drafts): loadFromDraft + clearForNewDraft + prune banner

loadFromDraft rehydrates a draft from IndexedDB: reconstructs File
objects from Blobs (skips corrupted ones), regenerates preview URLs,
restores modifiedGroupIndices as a Set, and auto-prunes community IDs
the user is no longer a member of. One LOAD_FROM_DRAFT dispatch swaps
the reducer state; component-level selectedCommunityIds + singlePostPhase
are updated alongside.

A pendingDraftId prop lets App.tsx route a specific draft on mount
without coupling the wizard to navigation state.

When pruning happens, a dismissible warning banner renders inline:
"We removed N communities you're no longer a member of."

clearForNewDraft is the inverse — resets everything for a fresh draft.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `DraftsGallery` component

**Files:**
- Create: `frontend/src/components/DraftsGallery.tsx`

The gallery component reads drafts from IndexedDB, renders cards (top 3 + expand), the "Start a new listing" CTA, and the storage banner.

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/DraftsGallery.tsx` with this exact content:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./ui/button";
import { ModalShell } from "./ui/ModalShell";
import * as draftStorage from "../lib/draftStorage";
import type { Draft } from "../lib/draftStorage";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Top-3 visible by default. Expand to show all.
const DEFAULT_VISIBLE_COUNT = 3;

export interface DraftsGalleryProps {
  userId: string | null;        // null when logged out
  onSelectDraft: (id: string) => void;
  onStartNew: () => void;
  // Bumped by the parent when a draft has just been saved/deleted, so the
  // gallery re-fetches. Simpler than wiring an event bus.
  refreshNonce?: number;
}

function relativeTime(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(ms).toLocaleDateString();
}

function draftTitle(draft: Draft): string {
  if (draft.mode === "bulk" && draft.state.bulkItems.length > 0) {
    return `Bulk · ${draft.state.bulkItems.length} items`;
  }
  const brand = draft.state.productDetails?.brand?.trim() ?? "";
  const name = draft.state.productDetails?.name?.trim() ?? "";
  const title = [brand, name].filter(Boolean).join(" ");
  if (title) return title;
  const photoCount = draft.files.length;
  return `Untitled · ${photoCount} photo${photoCount === 1 ? "" : "s"}`;
}

export function DraftsGallery({
  userId,
  onSelectDraft,
  onStartNew,
  refreshNonce,
}: DraftsGalleryProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate preview URLs for the first file of each draft. Revoke on unmount.
  const previewUrls = useMemo(() => {
    const map = new Map<string, string>();
    for (const draft of drafts) {
      const first = draft.files[0];
      if (first) {
        try {
          const file = new File([first.blob], first.name, { type: first.type });
          map.set(draft.id, URL.createObjectURL(file));
        } catch {
          // skip — thumbnail will fall back to a placeholder
        }
      }
    }
    return map;
  }, [drafts]);
  useEffect(() => {
    return () => {
      for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    };
  }, [previewUrls]);

  const refresh = useCallback(async () => {
    if (!userId) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ok = await draftStorage.isAvailable();
    setAvailable(ok);
    if (!ok) {
      setDrafts([]);
      setLoading(false);
      return;
    }
    const list = await draftStorage.listDrafts(userId);
    setDrafts(list);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshNonce]);

  const handleDelete = useCallback(async (id: string) => {
    await draftStorage.deleteDraft(id);
    setConfirmDeleteId(null);
    void refresh();
  }, [refresh]);

  const hasQuotaError = drafts.some((d) => d.lastSaveError === "quota");
  const visibleDrafts = expanded ? drafts : drafts.slice(0, DEFAULT_VISIBLE_COUNT);
  const overflow = drafts.length - DEFAULT_VISIBLE_COUNT;

  return (
    <div className="max-w-3xl mx-auto space-y-4 px-4 py-6">
      {/* Storage banner — quota errors */}
      {hasQuotaError && (
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning mt-0.5" aria-hidden />
          <span>
            Storage is full on this device. Delete some drafts below to free up space.
          </span>
        </div>
      )}

      {/* Private-browsing banner */}
      {available === false && (
        <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-3 text-sm text-muted">
          <AlertTriangle className="size-4 shrink-0 text-muted mt-0.5" aria-hidden />
          <span>
            Drafts can't be saved in private browsing. Switch to a regular window to enable drafts.
          </span>
        </div>
      )}

      {/* Header */}
      {drafts.length > 0 && (
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Drafts</h1>
          <span className="text-xs text-muted">{drafts.length} in progress</span>
        </div>
      )}

      {/* Start new listing CTA */}
      <Button
        onClick={onStartNew}
        className={`w-full justify-center ${FOCUS_RING}`}
      >
        <Plus className="size-4" aria-hidden />
        Start a new listing
      </Button>

      {/* Empty-state hint */}
      {drafts.length === 0 && !loading && available !== false && userId && (
        <p className="text-xs text-muted-soft text-center">
          Drafts save automatically as you work.
        </p>
      )}

      {/* Draft cards */}
      {visibleDrafts.map((draft) => (
        <div
          key={draft.id}
          className="flex items-stretch gap-3 rounded-md border border-hairline bg-canvas overflow-hidden hover:bg-surface-soft transition-colors"
        >
          <button
            type="button"
            onClick={() => onSelectDraft(draft.id)}
            className={`flex flex-1 items-center gap-3 p-3 text-left min-w-0 ${FOCUS_RING}`}
          >
            <div className="size-16 shrink-0 rounded-md bg-surface-soft border border-hairline overflow-hidden">
              {previewUrls.get(draft.id) ? (
                <img
                  src={previewUrls.get(draft.id)}
                  alt=""
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-ink truncate">{draftTitle(draft)}</div>
              <div className="text-xs text-muted truncate">
                {draft.mode === "single" ? "Single" : "Bulk"} · {relativeTime(draft.updatedAt)}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteId(draft.id)}
            aria-label="Delete draft"
            className={`shrink-0 px-3 text-muted hover:text-error ${FOCUS_RING}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}

      {/* View all / Show less toggle */}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className={`w-full inline-flex items-center justify-center gap-1.5 py-2 text-sm text-muted hover:text-ink ${FOCUS_RING}`}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" aria-hidden />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-4" aria-hidden />
              View all ({overflow} more)
            </>
          )}
        </button>
      )}

      {/* Delete-confirm modal */}
      {confirmDeleteId && (
        <ModalShell
          open
          onClose={() => setConfirmDeleteId(null)}
          z={60}
        >
          <div className="bg-canvas border border-hairline rounded-md max-w-sm w-full mx-4 p-6 shadow-overlay">
            <h3 className="text-base font-semibold text-ink mb-2">Delete this draft?</h3>
            <p className="text-sm text-body leading-relaxed">
              This can't be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className={`h-9 px-4 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-sm font-semibold ${FOCUS_RING}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(confirmDeleteId)}
                className={`h-9 px-4 rounded-md bg-error text-on-primary hover:bg-error/90 text-sm font-semibold ${FOCUS_RING}`}
              >
                Delete
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. The `Trash2`, `Plus`, `ChevronDown`, `ChevronUp` icons from `lucide-react` may need to be available — `lucide-react` exports all of them.

- [ ] **Step 3: Build**

```bash
cd frontend && npm run build
```

Expected: PASS. New `DraftsGallery` chunk may appear in the build output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DraftsGallery.tsx
git commit -m "$(cat <<'EOF'
feat(drafts): DraftsGallery component

Renders the user's drafts on the Sell entry surface: top 3 by default
with a "View all" expand toggle. Each card shows the first photo as a
64x64 thumbnail, the computed title (brand+name / "Bulk · N items" /
"Untitled · N photos"), and a relative timestamp. Per-card delete with
a confirm modal.

A quota banner surfaces when any draft has lastSaveError === "quota".
A private-browsing banner replaces the gallery when IndexedDB is
unavailable. Empty state shows just the CTA with a small hint that
drafts save automatically.

Blob preview URLs are generated per draft list and revoked on unmount.

Not yet wired into App.tsx — Task 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: App.tsx integration + publish-cleanup

**Files:**
- Modify: `frontend/src/App.tsx`

Wires the gallery into the Sell page, plumbs `pendingDraftId` through to the wizard, and adds the publish-cleanup `deleteDraft` calls.

- [ ] **Step 1: Add the `DraftsGallery` import**

In `frontend/src/App.tsx`, after the existing `MobileNavMenu` import (added in PR #17), add:

```ts
import { DraftsGallery } from "./components/DraftsGallery";
import * as draftStorage from "./lib/draftStorage";
```

- [ ] **Step 2: Add state for the drafts-gallery / wizard routing**

In `App.tsx`, near the existing `mobileMenuOpen` state (around line 101), add:

```tsx
  // Drafts: the Sell page shows the gallery first, then mounts the wizard
  // when the user starts new or taps an existing draft.
  // `pendingDraftId` is non-null when we want the wizard to load a specific
  // draft on mount; "new" means start fresh.
  const [draftRouteState, setDraftRouteState] = useState<
    | { kind: "gallery" }
    | { kind: "new" }
    | { kind: "load"; id: string }
  >({ kind: "gallery" });
  const [draftsRefreshNonce, setDraftsRefreshNonce] = useState(0);
```

- [ ] **Step 3: Reset to gallery whenever the user leaves the Sell page**

Add this effect immediately after the state declarations from Step 2:

```tsx
  // When the user navigates away from /newlisting, snap back to the gallery
  // view so re-entry shows drafts first (not the previously-loaded wizard).
  useEffect(() => {
    if (page !== "newlisting") {
      setDraftRouteState({ kind: "gallery" });
    }
  }, [page]);
```

- [ ] **Step 4: Replace the Sell page's wizard mount with the gallery + conditional wizard**

In `App.tsx`, find the `{page === "newlisting" && (` block (around line 1220 area — this is where the Sell page renders). Replace its inner content with this conditional rendering:

Find the existing pattern:

```tsx
      {page === "newlisting" && (
        <section className="min-h-[calc(100vh-64px)] bg-canvas">
          {/* ... existing wizard mount ... */}
        </section>
      )}
```

Replace the inside of the `<section>` to render either gallery or wizard:

```tsx
      {page === "newlisting" && (
        <section className="min-h-[calc(100vh-64px)] bg-canvas">
          {draftRouteState.kind === "gallery" ? (
            <DraftsGallery
              userId={user?.id ?? null}
              onSelectDraft={(id) => setDraftRouteState({ kind: "load", id })}
              onStartNew={() => setDraftRouteState({ kind: "new" })}
              refreshNonce={draftsRefreshNonce}
            />
          ) : (
            <SellWizard
              ref={sellWizardRef}
              categorySchemas={categorySchemas}
              isActive={true}
              mode={newListingMode}
              photosOnly={newListingMode === "manual"}
              publicCommunities={publicCommunities}
              privateCommunities={privateCommunities}
              onSwitchToBuy={() => { setTradeMode("buy"); setPage("home"); }}
              onRequestSignIn={() => setPage("signin")}
              onPosted={() => {
                resetNewListingForm();
                setPage("market");
                fetchListings();
                setDraftsRefreshNonce((n) => n + 1);
              }}
              onRequestSinglePostConfirm={() => setShowPostConfirm(true)}
              pendingDraftId={draftRouteState.kind === "load" ? draftRouteState.id : null}
              onDraftLoaded={() => {
                // Once the wizard loads the draft we don't want to keep
                // re-triggering it. Park the routing in "new" so the wizard
                // continues editing the loaded state without further loads.
                setDraftRouteState({ kind: "new" });
              }}
            />
          )}
        </section>
      )}
```

**IMPORTANT:** The exact props above (`ref={sellWizardRef}`, `categorySchemas={...}`, etc.) must match the existing call site BEFORE this change. Run `grep -n "<SellWizard" frontend/src/App.tsx` first to see the exact props in use; preserve every existing one, then add the two new props (`pendingDraftId`, `onDraftLoaded`) at the end. The list above reflects what the codebase has as of branch `feat/sell-wizard-drafts` start.

- [ ] **Step 5: Add publish-cleanup `deleteDraft` calls**

Find the wizard's `onPosted` callback in the JSX (from Step 4). It currently calls `resetNewListingForm(); setPage("market"); fetchListings();`. Already updated in Step 4 to include `setDraftsRefreshNonce`.

We also need to delete the draft itself. But `currentDraftId` lives inside the wizard, not App. So expose it via a new callback. In Task 4 we added `pendingDraftId` and `onDraftLoaded` props. Now add one more:

Open `frontend/src/features/sell-wizard/SellWizard.tsx` and add to `SellWizardProps` (after `onDraftLoaded`):

```ts
  onPublishedDraft?: (draftId: string | null) => void | Promise<void>;
```

Destructure it alongside the others:

```ts
  onPublishedDraft,
```

Then find the wizard's post-success paths. There are TWO sites where a successful post completes — the single-listing post handler and the bulk post handler. Both call `onPosted()` after a successful post. Find them with:

```bash
grep -n "onPosted()" frontend/src/features/sell-wizard/SellWizard.tsx
```

Expected: 2 hits. In EACH match, immediately after the `onPosted()` line, add:

```ts
      onPublishedDraft?.(currentDraftId);
      setCurrentDraftId(null);
```

For partial bulk failures (some items in the bulk batch succeeded, others didn't), do NOT call `onPublishedDraft` — the draft must persist so the user can retry the failed items. The existing bulk-post loop wraps each item in its own try/catch; the success-counting logic at the end of the loop is what gates the `onPosted()` call. If that gate is "all items posted," then the `onPublishedDraft` call placed after `onPosted()` is correctly conditional on full success.

If the bulk-post loop uses a more nuanced success/failure split, verify by reading the surrounding ~20 lines after each grep hit before inserting.

- [ ] **Step 6: Wire the App-side draft deletion**

Back in `App.tsx`, in the `<SellWizard>` JSX block from Step 4, add the `onPublishedDraft` prop alongside `pendingDraftId` and `onDraftLoaded`:

```tsx
              onPublishedDraft={async (draftId) => {
                if (draftId) {
                  await draftStorage.deleteDraft(draftId);
                  setDraftsRefreshNonce((n) => n + 1);
                }
              }}
```

- [ ] **Step 7: Update the save-status indicator's quota click to navigate back to gallery**

In Task 3 we used `onSwitchToBuy` as a placeholder for the quota error click. Replace it with a proper callback now. Open `SellWizard.tsx`, find the `SaveStatus failed/quota` branch (from Task 3 Step 7), and replace:

```tsx
            <button
              type="button"
              onClick={onSwitchToBuy}
              className="inline-flex items-center gap-1.5 text-warning hover:underline"
            >
```

with:

```tsx
            <button
              type="button"
              onClick={() => onBackToDrafts?.()}
              className="inline-flex items-center gap-1.5 text-warning hover:underline"
            >
```

And add `onBackToDrafts?: () => void;` to `SellWizardProps`, destructure as `onBackToDrafts,` alongside the others.

In App.tsx, wire it in the `<SellWizard>` JSX:

```tsx
              onBackToDrafts={() => setDraftRouteState({ kind: "gallery" })}
```

- [ ] **Step 8: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean. If errors complain about a missing prop on `<SellWizard>`, ensure every prop the existing call site used is preserved alongside the new ones.

- [ ] **Step 9: Build**

```bash
cd frontend && npm run build
```

Expected: PASS, no warnings.

- [ ] **Step 10: Smoke-test on phone**

Start the dev server (from `frontend/`, with `--host`):

```bash
npm run dev -- --host
```

On phone (same Wi-Fi). Walk through:

1. Sign in as a test user. Navigate to Sell. **Expected:** drafts gallery shows the "Start a new listing" CTA. If no prior drafts, no cards.
2. Tap "Start a new listing". Wizard mounts at upload step. Upload one photo.
3. Verify the save-status indicator goes `idle → saving → saved`. Background the tab (switch apps).
4. Return to the tab. Navigate back to Sell. **Expected:** gallery now shows 1 draft card with the photo as thumbnail and the title "Untitled · 1 photo".
5. Tap the card. Wizard rehydrates at the upload step with the photo loaded.
6. Continue to AI generation (single listing). Background again. Return. Verify `productDetails` is persisted on resume.
7. Change neighborhood from `/account`. Return to Sell. Open the draft. **Expected:** if the saved community IDs no longer match memberships, the prune banner shows.
8. Publish the listing (single). Return to Sell. **Expected:** the draft is gone from the gallery.
9. Create 4+ drafts. Verify gallery shows top 3 + "View all (N more)" expand link. Tap to expand.
10. Tap delete on a card. Confirm modal. Verify the draft is removed.
11. Log out. Log back in as the same user. **Expected:** drafts re-appear.
12. (Optional) Open in Safari Private Browsing. Verify the private-browsing banner shows + wizard still works in-session.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/App.tsx frontend/src/features/sell-wizard/SellWizard.tsx
git commit -m "$(cat <<'EOF'
feat(drafts): wire DraftsGallery into Sell page + publish cleanup

The /newlisting route now renders the drafts gallery first. State
machine: gallery → new (start fresh wizard) or gallery → load:{id}
(load a specific draft). The wizard's pendingDraftId / onDraftLoaded /
onPublishedDraft props connect this routing without coupling the
wizard to App-level navigation.

On successful publish (single or bulk all items), the wizard fires
onPublishedDraft(currentDraftId) → App calls draftStorage.deleteDraft
and bumps draftsRefreshNonce so the gallery re-fetches the next time
it's visible.

The save-status indicator's quota-error branch now correctly navigates
back to the gallery via onBackToDrafts (replacing the Task 3 placeholder
that pointed at onSwitchToBuy).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

After all six commits land:

- [ ] **Full typecheck + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: both clean, no warnings.

- [ ] **Grep audit — confirm no stale references**

```bash
grep -rn "draftStorage\|DraftsGallery\|currentDraftId" frontend/src --include="*.ts" --include="*.tsx" | wc -l
```

Expected: several hits across `lib/draftStorage.ts`, `components/DraftsGallery.tsx`, `features/sell-wizard/SellWizard.tsx`, `App.tsx`. Sanity check that the integration points line up.

- [ ] **Push + open PR**

```bash
git push -u origin feat/sell-wizard-drafts
gh pr create --base dev --head feat/sell-wizard-drafts \
  --title "feat(drafts): sell-wizard auto-save + drafts gallery (IndexedDB)" \
  --body "$(cat <<'EOF'
## Summary

Persists in-progress sell-wizard sessions to IndexedDB so users can resume after backgrounding the iOS Safari tab. Drafts gallery on the Sell entry surface shows the 3 most recent + an expand link. Per-user-scoped; no cap or expiry; quota-aware fallback banner; auto-prune of invalid community IDs on resume.

Spec: \`docs/superpowers/specs/2026-05-25-sell-wizard-drafts-design.md\`
Plan: \`docs/superpowers/plans/2026-05-25-sell-wizard-drafts.md\`

## What's in this PR

- **\`draftStorage.ts\`** — IndexedDB wrapper around \`idb\`. CRUD + \`isAvailable()\`. ~1KB added to bundle.
- **Reducer extension** — new \`LOAD_FROM_DRAFT\` action that swaps full state.
- **\`SellWizard.tsx\`** — debounced (500ms) auto-save effect, inline save-status indicator in the wizard header (\`idle / saving / saved · Xs ago / failed - storage full / failed - try again\`), \`loadFromDraft\` + \`clearForNewDraft\` orchestration, prune banner when communities are auto-pruned on resume.
- **\`DraftsGallery.tsx\`** — gallery component with cards (thumbnail + title + relative time), expand toggle, storage banner, private-browsing banner, delete confirm.
- **\`App.tsx\`** — gallery routing on \`/newlisting\`, publish-cleanup hooks delete the draft on successful post.

## Behavior

- Auto-save fires when \`uploadedImages.length > 0\` AND user is authenticated. Pre-auth: wizard works in-session, no draft.
- Drafts are per-user (filter by \`userId\`).
- No cap, no expiry. Quota errors surface a banner instead of failing silently.
- Logout doesn't delete drafts — same user can sign back in and resume.

## Test plan

- [x] Frontend \`npx tsc --noEmit\` clean
- [x] Frontend \`npm run build\` clean
- [ ] Manual smoke (phone): upload photo → indicator → background tab → reopen → gallery shows draft
- [ ] Manual smoke (phone): tap draft → wizard rehydrates at the saved step
- [ ] Manual smoke (phone): change neighborhood mid-draft → resume shows prune banner
- [ ] Manual smoke (phone): publish from a draft → draft auto-deleted from gallery
- [ ] Manual smoke (phone): 4+ drafts → gallery shows top 3 + "View all" expand
- [ ] Manual smoke (phone): per-card delete → confirm modal → draft removed
- [ ] Manual smoke (phone): logout + login same user → drafts persist
- [ ] Manual smoke (private browsing): banner shows + wizard works in-session

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR ready for review.
