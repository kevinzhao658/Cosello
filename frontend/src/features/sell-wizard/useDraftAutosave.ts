import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import * as draftStorage from "../../lib/draftStorage";
import type { Draft, PersistableState, PersistedFile } from "../../lib/draftStorage";
import type { AuthUser } from "../../contexts/AuthContext";
import type { SellWizardState, SellWizardActions } from "./useSellWizard";

const DRAFT_SAVE_DEBOUNCE_MS = 250;

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "failed"; reason: "quota" | "unknown" };

export interface CommunityOption {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface UseDraftAutosaveDeps {
  state: SellWizardState;
  actions: SellWizardActions;
  isAuthenticated: boolean;
  user: AuthUser | null;
  publicCommunities: CommunityOption[];
  privateCommunities: CommunityOption[];
  currentDraftId: string | null;
  setCurrentDraftId: (id: string | null) => void;
  selectedCommunityIds: number[];
  setSelectedCommunityIds: React.Dispatch<React.SetStateAction<number[]>>;
  singlePostPhase: "review" | "pickup";
  setSinglePostPhase: React.Dispatch<React.SetStateAction<"review" | "pickup">>;
  setPrunedCommunityCount: React.Dispatch<React.SetStateAction<number>>;
  initializedFromNeighborhoodRef: React.MutableRefObject<boolean>;
  pendingDraftId: string | null;
  onDraftLoaded?: () => void;
  /** Editable draft name from the page heading; persisted as Draft.name. */
  draftName?: string;
  /** Called on draft load to push the saved name back up to the page heading. */
  onDraftNameLoaded?: (name: string) => void;
}

export interface UseDraftAutosaveReturn {
  saveStatus: SaveStatus;
  loadFromDraft: (id: string) => Promise<void>;
  clearForNewDraft: () => void;
  /** Reset saveStatus to idle. Call from resetForLogout. */
  resetSaveStatus: () => void;
  /** Clear the cached createdAt ref. Call after publishing a draft. */
  clearDraftCreatedAt: () => void;
}

export function useDraftAutosave({
  state,
  actions,
  isAuthenticated,
  user,
  publicCommunities,
  privateCommunities,
  currentDraftId,
  setCurrentDraftId,
  selectedCommunityIds,
  setSelectedCommunityIds,
  singlePostPhase,
  setSinglePostPhase,
  setPrunedCommunityCount,
  initializedFromNeighborhoodRef,
  pendingDraftId,
  onDraftLoaded,
  draftName = "",
  onDraftNameLoaded,
}: UseDraftAutosaveDeps): UseDraftAutosaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  // Cached createdAt for the current draft. Set on first save; reused on
  // subsequent saves so we don't have to round-trip loadDraft just to
  // preserve the timestamp. Cleared when a new/different draft starts.
  const draftCreatedAtRef = useRef<number | null>(null);

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
      id: currentDraftId ?? draftStorage.generateDraftId(),
      userId: user.id,
      createdAt: now, // will be overwritten if the draft already exists
      updatedAt: now,
      mode,
      name: draftName.trim() || undefined,
      selectedCommunityIds,
      singlePostPhase,
      state: persistable,
      files,
      lastSaveError: null,
    };
  }, [currentDraftId, draftName, selectedCommunityIds, singlePostPhase, state, user?.id]);

  // Debounced auto-save. Fires only after the user has committed to a
  // listing — i.e. the wizard has run segmentation (bulk) or generated
  // product details (single). Just selecting photos in the upload step
  // doesn't create a draft.
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    const hasPhotos = state.uploadedImages.length > 0;
    const hasCommitted = state.segmentation !== null || state.productDetails !== null;
    if (!hasPhotos || !hasCommitted) {
      // Pre-commit (just photos selected, or no photos) — no draft, no save.
      setSaveStatus({ kind: "idle" });
      return;
    }

    // Don't flip to "saving" yet — the debounce window is just a wait, not
    // work. The status flip happens inside the timeout when the write
    // actually starts. Indicator stays on its previous value ("saved" or
    // "idle") until then.
    const timerId = setTimeout(async () => {
      setSaveStatus({ kind: "saving" });
      const draft = buildDraftPayload();
      if (!draft) return;

      // Preserve createdAt across saves of the same draft via a ref —
      // avoids a per-save loadDraft round-trip.
      if (draftCreatedAtRef.current !== null) {
        draft.createdAt = draftCreatedAtRef.current;
      } else {
        draftCreatedAtRef.current = draft.createdAt;
      }

      try {
        await draftStorage.saveDraft(draft);

        if (!currentDraftId) setCurrentDraftId(draft.id);
        setSaveStatus({ kind: "saved", at: Date.now() });
      } catch (err) {
        const name = (err as { name?: string } | null)?.name ?? "";
        if (name === "QuotaExceededError") {
          try {
            await draftStorage.saveDraft({ ...draft, lastSaveError: "quota" });
          } catch { /* nothing more we can do */ }
          setSaveStatus({ kind: "failed", reason: "quota" });
        } else {
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
    draftName,
    currentDraftId,
  ]);

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
    draftCreatedAtRef.current = draft.createdAt;
    if (prunedCount > 0) setPrunedCommunityCount(prunedCount);
    onDraftNameLoaded?.(draft.name ?? "");
  }, [actions, publicCommunities, privateCommunities, onDraftNameLoaded]);

  // Reset everything for a brand-new draft. Called when the user taps
  // "Start a new listing" from the gallery.
  const clearForNewDraft = useCallback(() => {
    actions.clearAll();
    setSelectedCommunityIds([]);
    setSinglePostPhase("review");
    setCurrentDraftId(null);
    draftCreatedAtRef.current = null;
    setPrunedCommunityCount(0);
    setSaveStatus({ kind: "idle" });
    initializedFromNeighborhoodRef.current = false;
  }, [actions]);

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

  const resetSaveStatus = useCallback(() => {
    setSaveStatus({ kind: "idle" });
  }, []);

  const clearDraftCreatedAt = useCallback(() => {
    draftCreatedAtRef.current = null;
  }, []);

  return {
    saveStatus,
    loadFromDraft,
    clearForNewDraft,
    resetSaveStatus,
    clearDraftCreatedAt,
  };
}
