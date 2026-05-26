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
