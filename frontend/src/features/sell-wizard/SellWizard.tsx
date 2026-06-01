import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, startTransition, forwardRef } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PriceInput } from "../../components/ui/price-input";
import { CategorySelector, CategoryAttributeFields } from "../../components/CategoryFields";
import { Loader2, X, Plus, AlertTriangle, MapPin, ImagePlus, ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import * as draftStorage from "../../lib/draftStorage";
import type { Draft, PersistableState, PersistedFile } from "../../lib/draftStorage";
import { apiFetch } from "../../lib/api";
import { uploadToStorage } from "../../lib/uploadToStorage";
import { formatTitle } from "../../lib/format";
import { CONDITIONS } from "../../lib/listings";
import type { CategorySchema, CategorySlug } from "../../lib/types";
import {
  useSellWizard,
  selectBulkPreview,
  type BulkPreview,
  type BulkItemDetails,
  type ProductDetails,
  type SegmentationResult,
  type SellWizardState,
} from "./useSellWizard";
import { UploadStep } from "./steps/UploadStep";
import { GroupsStep } from "./steps/GroupsStep";
import { AIReviewStep } from "./steps/AIReviewStep";
import { PickupStep } from "./steps/PickupStep";
import { CommunityPicker, type CommunityOption } from "./CommunityPicker";
import { TypedInstruction } from "./TypedInstruction";

export interface SellWizardHandle {
  postSingleListing: (override?: { details: ProductDetails; pickupLocation: string }) => Promise<void>;
  resetForLogout: () => void;
  addImages: (files: FileList | File[]) => void;
  getImageCount: () => number;
  getProductDetails: () => ProductDetails | null;
  getCoverImageUrl: () => string | null;
  setProductDetails: (details: ProductDetails) => void;
  setPostPickupLocation: (value: string) => void;
  setBulkCardIndex: (index: number) => void;
}

export interface SellWizardProps {
  categorySchemas: Record<string, CategorySchema>;
  isActive: boolean;
  // Wizard mode. `"ai"` runs the existing segmentation → cards → pickup flow.
  // `"manual"` keeps the photo composer mounted but skips segmentation entirely;
  // the page-level form supplies productDetails via the imperative handle.
  mode?: "ai" | "manual";
  // When true the wizard renders only the photo composer (no upload affordance,
  // no submit arrow, no downstream phases). Used by the #newlisting page where
  // the page owns the publish button.
  photosOnly?: boolean;
  // The user's communities (from /mine). Used to pre-select the neighborhood
  // community in the community selector and populate the picker.
  publicCommunities?: { id: number; name: string; neighborhood?: string; is_public?: boolean }[];
  privateCommunities?: { id: number; name: string; neighborhood?: string; is_public?: boolean }[];
  onRequestSignIn: () => void;
  onPosted: () => void;
  onRequestSinglePostConfirm: () => void;
  onSwitchToBuy: () => void;
  onPhaseChange?: (phase: "review" | "reason" | "cards" | "pickup" | null) => void;
  onBulkPreviewChange?: (preview: BulkPreview | null) => void;
  onImagesChange?: (count: number) => void;
  onProductDetailsChange?: (details: ProductDetails | null) => void;
  onCoverImageChange?: (url: string | null) => void;
  // Drafts. Parent sets pendingDraftId when the user taps a draft card; the
  // wizard loads it on mount and clears the parent's state via onDraftLoaded.
  pendingDraftId?: string | null;
  onDraftLoaded?: () => void;
  onPublishedDraft?: (draftId: string | null) => void | Promise<void>;
  onBackToDrafts?: () => void;
}

const DRAFT_SAVE_DEBOUNCE_MS = 250;

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

const priceStringToCents = (raw: string): number | null => {
  const cleaned = raw.replace(/^\$/, "").trim();
  if (cleaned === "") return null;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
};

export const SellWizard = forwardRef<SellWizardHandle, SellWizardProps>(function SellWizard({
  categorySchemas,
  isActive,
  mode = "ai",
  photosOnly = false,
  publicCommunities = [],
  privateCommunities = [],
  onRequestSignIn,
  onPosted,
  onRequestSinglePostConfirm,
  onSwitchToBuy,
  onPhaseChange,
  onBulkPreviewChange,
  onImagesChange,
  onProductDetailsChange,
  onCoverImageChange,
  pendingDraftId = null,
  onDraftLoaded,
  onPublishedDraft,
  onBackToDrafts,
}, ref) {
  const { isAuthenticated, user, token } = useAuth();

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

  // When a draft resumes with community IDs the user is no longer a member
  // of, we drop them and show a one-time banner. Cleared on dismiss.
  const [prunedCommunityCount, setPrunedCommunityCount] = useState(0);

  // PR 3: seller picks up to 3 communities per listing. We pre-select the
  // user's neighborhood community as a default; the seller can deselect it.
  // The picker lives in PickupStep — see Task 7.
  const availableCommunities = useMemo(
    () => [...publicCommunities, ...privateCommunities],
    [publicCommunities, privateCommunities],
  );
  const userNeighborhoodCommunityId = useMemo(
    () => publicCommunities.find((c) => c.neighborhood === user?.neighborhood)?.id ?? null,
    [publicCommunities, user?.neighborhood],
  );
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<number[]>([]);
  // Initial pre-selection: when the user's neighborhood community resolves,
  // seed the picker with it (only if the seller hasn't touched the picker yet).
  const initializedFromNeighborhoodRef = useRef(false);
  useEffect(() => {
    if (initializedFromNeighborhoodRef.current) return;
    if (userNeighborhoodCommunityId !== null) {
      setSelectedCommunityIds([userNeighborhoodCommunityId]);
      initializedFromNeighborhoodRef.current = true;
    }
  }, [userNeighborhoodCommunityId]);
  // Single-listing wizard has its own two-phase split (review → pickup) to
  // mirror bulk's PickupStep. Bulk uses bulkReviewPhase; single uses this.
  const [singlePostPhase, setSinglePostPhase] = useState<"review" | "pickup">("review");
  const [state, actions] = useSellWizard();

  const {
    uploadedImages, bulkReviewPhase, segmentation, brandHints, names, rationale, rationaleOther,
    productDetails, bulkItems, currentCardIndex, bulkPickupLocation, postPickupLocation,
    isGenerating, isPostingBulk, segmentationError, dragImageState, dragOverGroup, dragOverGap,
    newTag, editingTitle, instructionExiting,
  } = state;

  // Reset the single-listing two-phase split whenever a new productDetails
  // cycle begins (i.e. productDetails clears between submissions).
  useEffect(() => {
    if (productDetails === null) {
      setSinglePostPhase("review");
    }
  }, [productDetails]);

  // On phase transition (single-listing only), scroll to the top of the
  // wizard area so the new step is visible. Otherwise iOS Safari preserves
  // the scroll position of the previous step, which can leave the new
  // (shorter) step off-screen — looking like a blank page to the user.
  useEffect(() => {
    if (!isActive) return;
    if (!productDetails) return;
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [singlePostPhase, isActive, productDetails]);

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
      selectedCommunityIds,
      singlePostPhase,
      state: persistable,
      files,
      lastSaveError: null,
    };
  }, [currentDraftId, selectedCommunityIds, singlePostPhase, state, user?.id]);

  // Cached createdAt for the current draft. Set on first save; reused on
  // subsequent saves so we don't have to round-trip loadDraft just to
  // preserve the timestamp. Cleared when a new/different draft starts.
  const draftCreatedAtRef = useRef<number | null>(null);

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
  }, [actions, publicCommunities, privateCommunities]);

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

  // Suppress unused warning — clearForNewDraft is called externally (Task 6).
  void clearForNewDraft;

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const wizardAnchorRef = useRef<HTMLDivElement>(null);

  // Revoke blob URLs on unmount; revoke happens via state.uploadedImages ref so
  // any leftover URLs are released even if the wizard is torn down without
  // hitting CLEAR/DELETE paths.
  const uploadedImagesRef = useRef(uploadedImages);
  const productDetailsRef = useRef(productDetails);
  const segmentationRef = useRef(segmentation);
  const computeCoverImageUrl = useCallback((): string | null => {
    const images = uploadedImagesRef.current;
    if (images.length > 0) return images[0].preview;
    const seg = segmentationRef.current;
    if (seg && seg.image_urls.length > 0) return seg.image_urls[0];
    return null;
  }, []);
  useEffect(() => {
    uploadedImagesRef.current = uploadedImages;
    onImagesChange?.(uploadedImages.length);
    onCoverImageChange?.(computeCoverImageUrl());
  }, [uploadedImages, onImagesChange, onCoverImageChange, computeCoverImageUrl]);
  useEffect(() => {
    productDetailsRef.current = productDetails;
    onProductDetailsChange?.(productDetails);
  }, [productDetails, onProductDetailsChange]);
  useEffect(() => {
    segmentationRef.current = segmentation;
    onCoverImageChange?.(computeCoverImageUrl());
  }, [segmentation, onCoverImageChange, computeCoverImageUrl]);
  useEffect(() => {
    return () => {
      for (const img of uploadedImagesRef.current) {
        URL.revokeObjectURL(img.preview);
      }
    };
  }, []);

  // Reset editingTitle whenever the current card changes (Step 4).
  useEffect(() => {
    actions.setEditingTitle(null);
  }, [currentCardIndex, actions]);

  // Notify parent on phase changes (used by App.tsx to hide/show the homepage
  // hero + nav logo while the wizard is in a deep step).
  useEffect(() => {
    onPhaseChange?.(bulkReviewPhase);
  }, [bulkReviewPhase, onPhaseChange]);

  // Emit bulk preview snapshot on every index/edit change so App.tsx can render
  // the live aside. Fires on bulkItems (new array on every updateBulkItem*) and
  // currentCardIndex, which covers index flips, edits, generates, and deletes.
  useEffect(() => {
    onBulkPreviewChange?.(
      selectBulkPreview(bulkItems, currentCardIndex, segmentation?.image_urls, uploadedImages),
    );
  }, [bulkItems, currentCardIndex, segmentation, uploadedImages, onBulkPreviewChange]);

  // When App.tsx switches away from sell mode, partial-reset bulk state
  // (matches the original effect's behavior): bulkItems + phase + cardIndex
  // clear, but uploadedImages and segmentation survive.
  useEffect(() => {
    if (!isActive) {
      actions.partialResetFromBuySwitch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Smooth-scroll the wizard subheader into view ONLY when entering Step 5.
  // Gated on isActive inside the effect — the hook itself must run every render
  // to satisfy Rules of Hooks (cannot sit after an `if (!isActive) return null`).
  useEffect(() => {
    if (!isActive) return;
    if (bulkReviewPhase === "pickup") {
      const id = requestAnimationFrame(() => {
        wizardAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return () => cancelAnimationFrame(id);
    }
  }, [bulkReviewPhase, isActive]);

  // Step 5 prefill: when entering "pickup" phase, default the input to the
  // seller's saved pickup_address — but ONLY if the user hasn't already typed something.
  useEffect(() => {
    if (!isActive) return;
    if (bulkReviewPhase === "pickup" && bulkPickupLocation === "") {
      actions.setBulkPickupLocation(user?.pickup_address || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkReviewPhase, isActive]);

  // ─── Network calls ──────────────────────────────────────────────────────
  const segmentationAbortRef = useRef<AbortController | null>(null);

  const segmentPhotos = useCallback(async (files: File[], signal?: AbortSignal): Promise<SegmentationResult> => {
    if (files.length > 20) throw new Error("Maximum 20 photos per upload");
    if (!token) throw new Error("Sign in to upload");
    const urls = await uploadToStorage(files, token);
    const formData = new FormData();
    formData.append("image_urls", JSON.stringify(urls));
    const res = await apiFetch("/api/segment-photos", {
      method: "POST",
      body: formData,
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Server error" }));
      throw new Error(err.detail || "Failed to segment photos");
    }
    return (await res.json()) as SegmentationResult;
  }, [token]);

  const generateListings = useCallback(async (payload: {
    groupings: number[][];
    image_urls: string[];
    vision_signals: unknown[];
    brand_hints: string[];
    names: string[];
    rationale: string;
    rationale_other: string;
  }): Promise<BulkItemDetails[]> => {
    if (!token) throw new Error("Sign in to upload");
    const res = await apiFetch("/api/generate-listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Server error" }));
      throw new Error(err.detail || "Failed to generate listings");
    }
    return (await res.json()) as BulkItemDetails[];
  }, [token]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const incoming = Array.from(files);
    e.target.value = "";

    const remaining = 20 - uploadedImages.length;
    if (remaining <= 0) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    if (incoming.length > remaining) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    const newImages = incoming.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    // Step 2 (review): re-run segmentation in place with the combined photo set.
    // In manual mode we skip segmentation entirely — just append.
    if (mode !== "manual" && bulkReviewPhase === "review") {
      const updatedImages = [...uploadedImages, ...newImages];
      actions.setImages(updatedImages);
      actions.setSegmentationError(null);
      actions.setGenerating(true);
      segmentationAbortRef.current?.abort();
      const controller = new AbortController();
      segmentationAbortRef.current = controller;
      try {
        const result = await segmentPhotos(updatedImages.map((img) => img.file), controller.signal);
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.groupings) || result.groupings.length === 0) {
          throw new Error("Segmentation returned no groupings");
        }
        actions.reSegmentSuccess(result);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Re-segment after +Add failed:", err);
        actions.setSegmentationError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        if (segmentationAbortRef.current === controller) {
          segmentationAbortRef.current = null;
          actions.setGenerating(false);
        }
      }
      return;
    }

    // Step 1 (null) — flat upload state. Just append.
    actions.appendImages(newImages);
  };

  const handleDeletePhotoMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const deletePhoto = useCallback((originalIndex: number) => {
    const removed = uploadedImages[originalIndex];
    if (!removed) return;
    actions.deletePhoto(originalIndex);
    URL.revokeObjectURL(removed.preview);
  }, [uploadedImages, actions]);

  const handleDeletePhotoClick = (originalIndex: number) =>
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      deletePhoto(originalIndex);
    };

  const addPhotoToBulkItem = (index: number, files: FileList) => {
    const remaining = 20 - uploadedImages.length;
    if (remaining <= 0) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    const incoming = Array.from(files);
    if (incoming.length > remaining) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    const newImages = incoming.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    actions.addPhotosToBulkItem(index, newImages);
  };

  const clearAllUploads = useCallback(() => {
    segmentationAbortRef.current?.abort();
    segmentationAbortRef.current = null;
    for (const img of uploadedImages) {
      URL.revokeObjectURL(img.preview);
    }
    actions.clearAll();
  }, [uploadedImages, actions]);

  const handleSellSubmit = async () => {
    if (mode === "manual") return;
    if (uploadedImages.length === 0) return;
    if (uploadedImages.length > 20) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    if (!token) {
      actions.setSegmentationError("Sign in to upload");
      return;
    }
    actions.segmentationStart();
    segmentationAbortRef.current?.abort();
    const controller = new AbortController();
    segmentationAbortRef.current = controller;
    try {
      const result = await segmentPhotos(uploadedImages.map((img) => img.file), controller.signal);
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.groupings) || result.groupings.length === 0) {
        throw new Error("Segmentation returned no groupings");
      }
      actions.segmentationSuccess({
        result,
        resetRationale: true,
        postPickupLocation: user?.pickup_address || "",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("Segment photos failed:", err);
      actions.segmentationFailure(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      if (segmentationAbortRef.current === controller) {
        segmentationAbortRef.current = null;
      }
    }
  };

  const handleGenerateListings = async () => {
    if (!segmentation) return;
    if (segmentation.groupings.some((g) => g.length === 0)) return;
    if (rationale === "Other" && rationaleOther.trim() === "") return;
    actions.generateStart();
    try {
      const items = await generateListings({
        groupings: segmentation.groupings,
        image_urls: segmentation.image_urls,
        vision_signals: segmentation.vision_signals,
        brand_hints: brandHints,
        names: names,
        rationale: rationale,
        rationale_other: rationaleOther,
      });
      const sellerNeighborhood = user?.neighborhood;
      items.forEach((item, i) => {
        if (!item.imageIndices || item.imageIndices.length === 0) {
          item.imageIndices = segmentation.groupings[i] || [];
        }
        if (sellerNeighborhood) item.location = sellerNeighborhood;
        if (!item.category) item.category = "other";
        if (!item.categoryAttributes) item.categoryAttributes = {};
        if (!item.identifierConfidence) item.identifierConfidence = "low";
        if (item.retrieval_fallback === undefined) item.retrieval_fallback = false;
        if (item.brand === undefined || item.brand === null) item.brand = "";
        if (item.name === undefined || item.name === null) item.name = "";
      });

      if (items.length === 1) {
        const single: ProductDetails = {
          brand: items[0].brand || "",
          name: items[0].name || "",
          description: items[0].description,
          price: items[0].price,
          condition: items[0].condition,
          location: user?.neighborhood || items[0].location,
          tags: items[0].tags,
          category: items[0].category || "other",
          categoryAttributes: items[0].categoryAttributes || {},
          identifierConfidence: items[0].identifierConfidence || "low",
          retrieval_fallback: items[0].retrieval_fallback === true,
        };
        actions.generateSingle(single);
      } else {
        actions.generateBulk(items);
      }
    } catch (err) {
      console.error("Generate listings failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
      actions.generateEnd();
    }
  };

  const regenerateBulkItem = async (groupIdx: number) => {
    if (!segmentation || !segmentation.groupings[groupIdx]) return;
    actions.generateStart();
    try {
      const items = await generateListings({
        groupings: [segmentation.groupings[groupIdx]],
        image_urls: segmentation.image_urls,
        vision_signals: segmentation.vision_signals,
        brand_hints: [brandHints[groupIdx] || ""],
        names: [names[groupIdx] || ""],
        rationale: rationale,
        rationale_other: rationaleOther,
      });
      if (items.length === 0) throw new Error("No listing returned");
      const fresh = items[0];
      if (!fresh.imageIndices || fresh.imageIndices.length === 0) {
        fresh.imageIndices = segmentation.groupings[groupIdx];
      }
      if (user?.neighborhood) fresh.location = user.neighborhood;
      if (!fresh.category) fresh.category = "other";
      if (!fresh.categoryAttributes) fresh.categoryAttributes = {};
      if (!fresh.identifierConfidence) fresh.identifierConfidence = "low";
      if (fresh.retrieval_fallback === undefined) fresh.retrieval_fallback = false;
      if (fresh.brand === undefined || fresh.brand === null) fresh.brand = "";
      if (fresh.name === undefined || fresh.name === null) fresh.name = "";
      actions.regenerateBulkItem(groupIdx, fresh);
    } catch (err) {
      console.error("Regenerate item failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
      actions.generateEnd();
    }
  };

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupIndex: number) => {
    e.preventDefault();
    actions.dragOverGroup(groupIndex);
  }, [actions]);
  const handleGroupDragLeave = useCallback(() => actions.dragOverGroup(null), [actions]);
  const handleDragStart = useCallback((imageIndex: number, sourceGroup: number) => {
    actions.dragStart(imageIndex, sourceGroup);
  }, [actions]);
  const handleDragEnd = useCallback(() => actions.dragEnd(), [actions]);
  const handleCardSelect = useCallback((idx: number) => actions.setCurrentCardIndex(idx), [actions]);

  const handleDrop = (targetGroup: number) => {
    if (!dragImageState) {
      actions.dragOverGroup(null);
      return;
    }
    const { imageIndex, sourceGroup } = dragImageState;
    if (bulkReviewPhase === "review") {
      actions.reviewReassignImage(imageIndex, sourceGroup, targetGroup);
      return;
    }
    actions.cardsReassignImage(imageIndex, sourceGroup, targetGroup);
  };

  const handleDropNewGroup = (gapIndex: number) => {
    if (!dragImageState) {
      actions.dragOverGap(null);
      actions.dragOverGroup(null);
      return;
    }
    const { imageIndex, sourceGroup } = dragImageState;
    if (bulkReviewPhase === "review") {
      actions.reviewSplitImage(imageIndex, sourceGroup, gapIndex);
      return;
    }
    actions.cardsSplitImage(imageIndex, sourceGroup, gapIndex);
  };

  const updateBrandHint = useCallback((groupIdx: number, value: string) => {
    actions.setBrandHint(groupIdx, value);
  }, [actions]);
  const updateName = useCallback((groupIdx: number, value: string) => {
    actions.setName(groupIdx, value);
  }, [actions]);

  const updateBulkItemField = useCallback((index: number, field: string, value: unknown) => {
    actions.updateBulkItemField(index, field, value);
  }, [actions]);

  const handlePostListing = useCallback(async (override?: { details: ProductDetails; pickupLocation: string }) => {
    // Override path lets the New Listing page publish in Manual mode without
    // waiting for setProductDetails to flush through React state.
    const details = override?.details ?? productDetails;
    const pickup = override?.pickupLocation ?? postPickupLocation;
    if (!details || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }

    const priceCents = priceStringToCents(details.price);
    if (priceCents === null) { alert("Enter a valid price before posting."); return; }

    try {
      const formData = new FormData();
      const draftUrls = segmentation
        ? segmentation.image_urls.filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
        : [];
      if (draftUrls.length > 0) {
        formData.append("draft_urls", JSON.stringify(draftUrls));
      } else {
        uploadedImages.forEach((img) => formData.append("images", img.file));
      }
      const { identifierConfidence: _, retrieval_fallback: _rf, ...rest } = details;
      void _; void _rf;
      const postData = { ...rest, priceCents };
      formData.append("data", JSON.stringify(postData));
      // Seller's community picks from the PickupStep picker (PR 3). Capped to
      // 3 client-side; backend re-validates cap + membership.
      formData.append("communities", selectedCommunityIds.join(","));
      formData.append("visibility", "public");
      formData.append("pickup_location", pickup);

      const res = await apiFetch("/api/listings", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed to post listing");
      await res.json();

      // Cleanup: revoke blob URLs before resetting state.
      for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
      actions.postListingReset();
      onPosted();
      onPublishedDraft?.(currentDraftId);
      setCurrentDraftId(null);
      draftCreatedAtRef.current = null;
    } catch (err) {
      console.error("Post listing failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    }
  }, [productDetails, uploadedImages, isAuthenticated, segmentation, postPickupLocation, selectedCommunityIds, actions, onPosted, onPublishedDraft, currentDraftId, onRequestSignIn]);

  const resetForLogout = useCallback(() => {
    setCurrentDraftId(null);
    draftCreatedAtRef.current = null;
    setSelectedCommunityIds([]);
    setSinglePostPhase("review");
    setPrunedCommunityCount(0);
    setSaveStatus({ kind: "idle" });
    segmentationAbortRef.current?.abort();
    segmentationAbortRef.current = null;
    for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
    actions.resetToUpload();
  }, [uploadedImages, actions]);

  const addImagesFromFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const remaining = 20 - uploadedImages.length;
    if (remaining <= 0) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
      return;
    }
    const trimmed = incoming.slice(0, remaining);
    if (incoming.length > remaining) {
      actions.setSegmentationError("Maximum 20 photos per listing batch");
    }
    const newImages = trimmed.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    actions.appendImages(newImages);
  }, [uploadedImages.length, actions]);

  useImperativeHandle(ref, () => ({
    postSingleListing: handlePostListing,
    resetForLogout,
    addImages: addImagesFromFiles,
    getImageCount: () => uploadedImagesRef.current.length,
    getProductDetails: () => productDetailsRef.current,
    getCoverImageUrl: computeCoverImageUrl,
    setProductDetails: (details) => actions.setProductDetails(details),
    setPostPickupLocation: (value) => actions.setPostPickupLocation(value),
    setBulkCardIndex: (index) => actions.setCurrentCardIndex(index),
  }), [handlePostListing, resetForLogout, addImagesFromFiles, computeCoverImageUrl, actions]);

  const handleBulkPostListing = async () => {
    if (bulkItems.length === 0 || uploadedImages.length === 0) return;
    if (!isAuthenticated) { onRequestSignIn(); return; }

    const invalidIdx = bulkItems.findIndex((item) => priceStringToCents(item.price) === null);
    if (invalidIdx !== -1) {
      const offender = bulkItems[invalidIdx];
      alert(`Enter a valid price for "${formatTitle(offender.brand, offender.name)}" before posting.`);
      return;
    }

    actions.setPostingBulk(true);

    try {
      const trimmedBulkDefault = bulkPickupLocation.trim();
      const fallbackPickup = trimmedBulkDefault !== "" ? trimmedBulkDefault : postPickupLocation;

      const results = await Promise.allSettled(
        bulkItems.map(async (item) => {
          const formData = new FormData();
          const draftUrlsForItem = segmentation
            ? item.imageIndices
                .map((i) => segmentation.image_urls[i])
                .filter((url): url is string => typeof url === "string" && url.length > 0)
            : [];
          if (draftUrlsForItem.length > 0) {
            formData.append("draft_urls", JSON.stringify(draftUrlsForItem));
          } else {
            for (const imgIdx of item.imageIndices) {
              if (uploadedImages[imgIdx]) {
                formData.append("images", uploadedImages[imgIdx].file);
              }
            }
          }
          const { imageIndices: _indices, identifierConfidence: _conf, retrieval_fallback: _rf, pickupLocation: _itemPickup, ...rest } = item;
          void _indices; void _conf; void _rf; void _itemPickup;
          const productData = { ...rest, priceCents: priceStringToCents(item.price) as number };
          formData.append("data", JSON.stringify(productData));
          // Bulk items share one community selection from PickupStep.
          formData.append("communities", selectedCommunityIds.join(","));
          formData.append("visibility", "public");
          const itemPickup =
            item.pickupLocation && item.pickupLocation.trim() !== ""
              ? item.pickupLocation
              : fallbackPickup;
          formData.append("pickup_location", itemPickup);

          const res = await apiFetch("/api/listings", { method: "POST", body: formData });
          if (!res.ok) throw new Error(`Failed to post listing: ${formatTitle(item.brand, item.name)}`);
        }),
      );

      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failures.length > 0) {
        const messages = failures
          .map((f) => (f.reason instanceof Error ? f.reason.message : String(f.reason)))
          .join("\n");
        throw new Error(messages);
      }

      for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
      actions.postListingReset();
      onPosted();
      onPublishedDraft?.(currentDraftId);
      setCurrentDraftId(null);
      draftCreatedAtRef.current = null;
    } catch (err) {
      console.error("Bulk post failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      actions.setPostingBulk(false);
    }
  };

  const handleBulkPostFromPickupStep = async () => {
    const trimmedDefault = bulkPickupLocation.trim();
    if (trimmedDefault !== "") {
      actions.setBulkItems(
        bulkItems.map((item) => ({
          ...item,
          pickupLocation:
            item.pickupLocation && item.pickupLocation.trim() !== ""
              ? item.pickupLocation
              : trimmedDefault,
        })),
      );
    }
    await handleBulkPostListing();
  };

  const transitionToPhase = (next: "review" | "reason" | "cards" | "pickup") => {
    actions.setInstructionExiting(true);
    setTimeout(() => {
      startTransition(() => {
        actions.setInstructionExiting(false);
        actions.setPhase(next);
      });
    }, 300);
  };

  const handleBackArrow = () => {
    if (bulkReviewPhase === "pickup") transitionToPhase("cards");
    else if (bulkReviewPhase === "cards") transitionToPhase("reason");
    else if (bulkReviewPhase === "reason") transitionToPhase("review");
    else if (bulkReviewPhase === "review") actions.backFromReview();
  };

  // Memoize the category type for select onChange
  const setSingleCategory = (slug: CategorySlug) => {
    if (!productDetails) return;
    actions.setProductDetails({
      ...productDetails,
      category: slug,
      categoryAttributes: productDetails.categoryAttributes || {},
    });
  };

  const inWizardPhase = useMemo(
    () => bulkReviewPhase === "review" || bulkReviewPhase === "reason" || bulkReviewPhase === "cards" || bulkReviewPhase === "pickup",
    [bulkReviewPhase],
  );

  if (!isActive) return null;

  return (
    <>
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
              onClick={() => onBackToDrafts?.()}
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
      <UploadStep
        uploadedImagesCount={uploadedImages.length}
        isGenerating={isGenerating}
        collapsed={inWizardPhase}
        fileInputRef={fileInputRef}
        onUpload={handleImageUpload}
        onSubmit={handleSellSubmit}
        onSwitchToBuy={onSwitchToBuy}
      />

      {uploadedImages.length > 0 && (
        <>
          {inWizardPhase && segmentation ? (
            <GroupsStep
              bulkReviewPhase={bulkReviewPhase}
              segmentation={segmentation}
              uploadedImages={uploadedImages}
              bulkItems={bulkItems}
              brandHints={brandHints}
              names={names}
              rationale={rationale}
              rationaleOther={rationaleOther}
              isGenerating={isGenerating}
              instructionExiting={instructionExiting}
              currentCardIndex={currentCardIndex}
              dragImageState={dragImageState}
              dragOverGroup={dragOverGroup}
              dragOverGap={dragOverGap}
              wizardAnchorRef={wizardAnchorRef}
              onBackArrow={handleBackArrow}
              onAdvanceToReason={() => transitionToPhase("reason")}
              onGenerate={handleGenerateListings}
              setRationale={actions.setRationale}
              setRationaleOther={actions.setRationaleOther}
              setDragOverGap={actions.dragOverGap}
              setDragOverGroup={actions.dragOverGroup}
              onDropNewGroup={handleDropNewGroup}
              onDragOver={handleGroupDragOver}
              onDragLeave={handleGroupDragLeave}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDeleteMouseDown={handleDeletePhotoMouseDown}
              onDeleteClick={deletePhoto}
              onBrandChange={updateBrandHint}
              onNameChange={updateName}
              onCardSelect={handleCardSelect}
              fileInputRef={fileInputRef}
              onClearAll={clearAllUploads}
            />
          ) : bulkReviewPhase && bulkItems.length > 0 ? (
            <div className="flex items-center mt-3 mb-2 overflow-x-auto pb-2 pt-3 pl-2 scrollbar-thin">
              {bulkItems.map((item, groupIdx) => {
                const isDropTarget = dragOverGroup === groupIdx;
                const isActive = bulkReviewPhase === "cards" && currentCardIndex === groupIdx;
                return (
                  <React.Fragment key={groupIdx}>
                    <div
                      className={`shrink-0 transition-all self-stretch flex items-center ${
                        dragImageState ? "w-4 mx-0.5" : "w-3"
                      } ${dragOverGap === groupIdx ? "w-6 mx-0.5" : ""}`}
                      onDragOver={(e) => { e.preventDefault(); actions.dragOverGap(groupIdx); actions.dragOverGroup(null); }}
                      onDragLeave={() => actions.dragOverGap(null)}
                      onDrop={() => handleDropNewGroup(groupIdx)}
                    >
                      {dragImageState && (
                        <div className={`w-0.5 h-full mx-auto rounded-full transition-all ${
                          dragOverGap === groupIdx ? "bg-primary w-1" : "bg-hairline"
                        }`} />
                      )}
                    </div>
                    <div
                      className={`relative flex items-center gap-1.5 rounded-md px-1.5 py-1 border shrink-0 transition-colors cursor-pointer ${
                        isDropTarget ? "bg-primary-soft ring-1 ring-primary border-primary" :
                        isActive ? "border-primary bg-primary-soft" : "border-hairline"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas`}
                      onDragOver={(e) => handleGroupDragOver(e, groupIdx)}
                      onDragLeave={() => actions.dragOverGroup(null)}
                      onDrop={() => handleDrop(groupIdx)}
                      onClick={() => {
                        actions.setCurrentCardIndex(groupIdx);
                        actions.setPhase("cards");
                      }}
                    >
                      <span className="absolute -top-1.5 -left-1.5 size-4 rounded-full bg-ink flex items-center justify-center text-[8px] font-bold text-on-dark z-10">
                        {groupIdx + 1}
                      </span>
                      {item.imageIndices.map((imgIdx) => {
                        const img = uploadedImages[imgIdx];
                        if (!img) return null;
                        const isDragging = dragImageState?.imageIndex === imgIdx;
                        return (
                          <div
                            key={imgIdx}
                            draggable
                            onDragStart={() => handleDragStart(imgIdx, groupIdx)}
                            onDragEnd={handleDragEnd}
                            className={`relative size-16 rounded-md border border-hairline cursor-grab active:cursor-grabbing transition-opacity ${
                              isDragging ? "opacity-40" : "opacity-100"
                            }`}
                          >
                            <img
                              src={img.preview}
                              alt={`Upload ${imgIdx + 1}`}
                              className="size-full object-cover rounded-md"
                              draggable={false}
                            />
                            <button
                              type="button"
                              aria-label={`Delete photo ${imgIdx + 1}`}
                              onMouseDown={handleDeletePhotoMouseDown}
                              onClick={handleDeletePhotoClick(imgIdx)}
                              className="absolute -top-2 -right-2 size-5 flex items-center justify-center rounded-full bg-ink/70 text-on-dark hover:bg-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                            >
                              <X className="size-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}
              <div
                className={`shrink-0 transition-all self-stretch flex items-center ${
                  dragImageState ? "w-4 mx-0.5" : "w-3"
                } ${dragOverGap === bulkItems.length ? "w-6 mx-0.5" : ""}`}
                onDragOver={(e) => { e.preventDefault(); actions.dragOverGap(bulkItems.length); actions.dragOverGroup(null); }}
                onDragLeave={() => actions.dragOverGap(null)}
                onDrop={() => handleDropNewGroup(bulkItems.length)}
              >
                {dragImageState && (
                  <div className={`w-0.5 h-full mx-auto rounded-full transition-all ${
                    dragOverGap === bulkItems.length ? "bg-primary w-1" : "bg-hairline"
                  }`} />
                )}
              </div>
              <div className="shrink-0 ml-auto flex flex-col gap-1">
                <button
                  type="button"
                  onClick={clearAllUploads}
                  className="text-[10px] text-muted hover:text-error transition-colors px-2 py-1 rounded-md border border-transparent hover:border-error/30 hover:bg-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Clear all
                </button>
              </div>
            </div>
          ) : segmentation || productDetails ? (
            // Post-segmentation / post-AI: the photos box was the upload-step
            // UI. Once the wizard has moved past upload (segmentation ran or
            // a single product was generated), hide it — the wizard's review
            // and pickup steps own the surface from here.
            null
          ) : (
            <div
              className="relative w-full bg-surface-card border border-hairline rounded-lg p-4 pb-14 mt-2 mb-2"
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("ring-2","ring-primary","bg-primary-tint"); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2","ring-primary","bg-primary-tint"); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("ring-2","ring-primary","bg-primary-tint");
                if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
                const synthetic = { target: { files: e.dataTransfer.files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>;
                handleImageUpload(synthetic);
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                {uploadedImages.map((img, index) => (
                  <div key={index} className="relative size-[72px] rounded-md overflow-hidden border border-hairline bg-surface-soft">
                    <img
                      src={img.preview}
                      alt={`Upload ${index + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Delete photo ${index + 1}`}
                      onMouseDown={handleDeletePhotoMouseDown}
                      onClick={handleDeletePhotoClick(index)}
                      className="absolute top-1 right-1 size-5 inline-flex items-center justify-center rounded-full bg-ink/70 text-on-dark text-xs hover:bg-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  aria-label="Add more photos"
                  onClick={() => fileInputRef.current?.click()}
                  className="size-[72px] rounded-md border border-dashed border-border-strong inline-flex items-center justify-center text-muted hover:text-primary hover:border-primary transition-colors"
                >
                  <Plus className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={clearAllUploads}
                  className="ml-auto shrink-0 text-[11px] text-muted hover:text-error transition-colors px-2 py-1 rounded"
                >
                  Clear all
                </button>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3 pt-2 w-full flex items-center gap-3 border-t border-hairline-soft text-sm text-muted hover:text-ink transition-colors"
              >
                <ImagePlus className="size-[18px] text-primary shrink-0" />
                <span>Or drop more photos here</span>
              </button>

              {/* Continue arrow only shows BEFORE segmentation has run.
                  Once the wizard has segmented (bulk path) or generated a
                  single listing (productDetails set), this button is no
                  longer the right action — the user advances via the
                  SingleListingForm's "Continue →" button or the bulk wizard's
                  step controls. Without this guard, tapping the arrow on
                  mobile while on the review step re-triggers segmentation
                  and the wizard appears to blank out. */}
              {mode !== "manual" && !segmentation && !productDetails && (
                <button
                  type="button"
                  aria-label="Continue"
                  disabled={isGenerating}
                  onClick={handleSellSubmit}
                  className="absolute right-3 bottom-3 inline-flex items-center justify-center size-10 rounded-full bg-primary text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  {isGenerating ? <Loader2 className="size-[18px] animate-spin" /> : <ArrowRight className="size-[18px]" />}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {segmentationError && !isGenerating && (
        <div className="mt-3 flex items-start gap-3 p-3 rounded-md border border-error/30 bg-error/5 text-body">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-error" />
          <div className="flex-1 text-xs">
            <div className="font-semibold text-error">Couldn't analyze your photos</div>
            <div className="mt-1 text-muted">{segmentationError}</div>
          </div>
          <button
            onClick={() => { actions.setSegmentationError(null); handleSellSubmit(); }}
            className="shrink-0 text-[11px] text-error hover:text-on-primary hover:bg-error px-2 py-1 rounded border border-error/40 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="mt-6 p-6 bg-surface-card rounded-lg border border-hairline text-center">
          <Loader2 className="size-6 text-primary animate-spin mx-auto mb-3" />
          <p className="text-muted text-sm">Analyzing your images...</p>
        </div>
      )}

      {bulkReviewPhase === "pickup" && !isGenerating && segmentation && (
        <div
          key="pickup"
          className="mt-4 wizard-step-enter"
          style={{ animation: "wizardStepIn 300ms ease-out both" }}
        >
          <PickupStep
            bulkPickupLocation={bulkPickupLocation}
            bulkItemsCount={bulkItems.length}
            isPostingBulk={isPostingBulk}
            isAuthenticated={isAuthenticated}
            onChange={actions.setBulkPickupLocation}
            onPost={() => {
              if (!isAuthenticated) { onRequestSignIn(); return; }
              handleBulkPostFromPickupStep();
            }}
            availableCommunities={availableCommunities}
            selectedCommunityIds={selectedCommunityIds}
            onToggleCommunity={(id) => {
              setSelectedCommunityIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              );
            }}
            userNeighborhood={user?.neighborhood ?? null}
          />
        </div>
      )}

      {productDetails && !isGenerating && !photosOnly && singlePostPhase === "review" && (
        <SingleListingForm
          productDetails={productDetails}
          setProductDetails={actions.setProductDetails}
          categorySchemas={categorySchemas}
          setSingleCategory={setSingleCategory}
          newTag={newTag}
          setNewTag={(v) => actions.setNewTag(v)}
          onContinue={() => {
            if (!isAuthenticated) { onRequestSignIn(); return; }
            setSinglePostPhase("pickup");
          }}
          isAuthenticated={isAuthenticated}
        />
      )}

      {productDetails && !isGenerating && !photosOnly && singlePostPhase === "pickup" && (
        <SinglePickupStep
          postPickupLocation={postPickupLocation}
          setPostPickupLocation={(v) => actions.setPostPickupLocation(v)}
          onBack={() => setSinglePostPhase("review")}
          onPost={() => {
            if (!isAuthenticated) { onRequestSignIn(); return; }
            onRequestSinglePostConfirm();
          }}
          isAuthenticated={isAuthenticated}
          availableCommunities={availableCommunities}
          selectedCommunityIds={selectedCommunityIds}
          onToggleCommunity={(id) => {
            setSelectedCommunityIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
            );
          }}
          userNeighborhood={user?.neighborhood ?? null}
          instructionExiting={instructionExiting}
        />
      )}

      {bulkReviewPhase === "cards" && !isGenerating && bulkItems.length > 0 && (
        <AIReviewStep
          bulkItems={bulkItems}
          currentCardIndex={currentCardIndex}
          uploadedImages={uploadedImages}
          imageUrls={segmentation?.image_urls}
          categorySchemas={categorySchemas}
          editingTitle={editingTitle}
          newTag={newTag}
          isGenerating={isGenerating}
          setEditingTitle={actions.setEditingTitle}
          setNewTag={actions.setNewTag}
          setCurrentCardIndex={actions.setCurrentCardIndex}
          deleteBulkItem={actions.deleteBulkItem}
          updateBulkItem={actions.updateBulkItem}
          updateBulkItemField={updateBulkItemField}
          regenerateBulkItem={regenerateBulkItem}
          addPhotoToBulkItem={addPhotoToBulkItem}
          onAdvance={() => transitionToPhase("pickup")}
        />
      )}

      {!productDetails && !isGenerating && !bulkReviewPhase && !photosOnly && mode !== "manual" && (
        <p className="text-sm text-muted text-center mt-2">
          {uploadedImages.length > 0
            ? `${uploadedImages.length} photo${uploadedImages.length > 1 ? 's' : ''} ready • Hit submit to generate listing`
            : "Selling • Click above to upload photos"}
        </p>
      )}
    </>
  );
});

// ─── Single Listing Form (extracted from inline JSX) ────────────────────────
// Step 3 of the single-listing wizard: product details review only. Pickup +
// community picker were moved to a dedicated step 4 (SinglePickupStep).
interface SingleListingFormProps {
  productDetails: ProductDetails;
  setProductDetails: (details: ProductDetails | null) => void;
  categorySchemas: Record<string, CategorySchema>;
  setSingleCategory: (slug: CategorySlug) => void;
  newTag: string;
  setNewTag: (v: string) => void;
  onContinue: () => void;
  isAuthenticated: boolean;
}

function SingleListingForm({
  productDetails, setProductDetails, categorySchemas, setSingleCategory,
  newTag, setNewTag, onContinue, isAuthenticated,
}: SingleListingFormProps) {
  return (
    <div className="mt-6 p-6 bg-surface-card rounded-lg border border-hairline space-y-4 text-left">
      {productDetails.retrieval_fallback === true && (
        <div className="flex gap-3 p-3 rounded-md border border-warning/40 bg-warning/5 text-body">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
          <div className="text-xs">
            <div className="font-semibold text-ink">Listing created with limited enrichment</div>
            <div className="mt-1 text-muted">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Brand</label>
          <Input
            value={productDetails.brand}
            onChange={(e) => setProductDetails({ ...productDetails, brand: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Name</label>
          <Input
            value={productDetails.name}
            onChange={(e) => setProductDetails({ ...productDetails, name: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted uppercase tracking-wider">Description</label>
        <textarea
          value={productDetails.description}
          onChange={(e) => setProductDetails({ ...productDetails, description: e.target.value })}
          rows={3}
          className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Price ($)</label>
          <PriceInput
            value={productDetails.price}
            onChange={(next) => setProductDetails({ ...productDetails, price: next })}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Condition</label>
          <select
            value={productDetails.condition}
            onChange={(e) => setProductDetails({ ...productDetails, condition: e.target.value })}
            className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 h-9"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      {Object.keys(categorySchemas).length > 0 && (
        <>
          <CategorySelector
            category={productDetails.category || "other"}
            schemas={categorySchemas}
            onChange={setSingleCategory}
          />
          <CategoryAttributeFields
            category={productDetails.category || "other"}
            schemas={categorySchemas}
            attributes={productDetails.categoryAttributes || {}}
            identifierConfidence={productDetails.identifierConfidence}
            onChange={(key, value) => setProductDetails({
              ...productDetails,
              categoryAttributes: { ...(productDetails.categoryAttributes || {}), [key]: value },
            })}
          />
        </>
      )}
      <div>
        <label className="text-xs text-muted uppercase tracking-wider">Tags</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {productDetails.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary-soft border border-primary/20 text-primary-active"
            >
              {tag}
              <button
                onClick={() =>
                  setProductDetails({
                    ...productDetails,
                    tags: productDetails.tags.filter((_, i) => i !== index),
                  })
                }
                className="hover:text-ink transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newTag.trim();
              if (trimmed && !productDetails.tags.includes(trimmed)) {
                setProductDetails({
                  ...productDetails,
                  tags: [...productDetails.tags, trimmed],
                });
                setNewTag("");
              }
            }}
            className="inline-flex"
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="w-24 px-2 py-1 rounded-full text-xs bg-canvas border border-border-strong text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors"
            />
          </form>
        </div>
      </div>
      <Button
        onClick={onContinue}
        className="w-full mt-3"
      >
        {isAuthenticated ? "Continue →" : "Sign in to Continue"}
      </Button>
    </div>
  );
}

// ─── Single-listing pickup step (mirrors PickupStep for bulk) ───────────────
// Step 4 of the single-listing wizard. Owns the typed "Where are you
// selling?" header, pickup input, community picker, back chevron, and the
// final Post Listing button.
interface SinglePickupStepProps {
  postPickupLocation: string;
  setPostPickupLocation: (v: string) => void;
  onBack: () => void;
  onPost: () => void;
  isAuthenticated: boolean;
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
  instructionExiting: boolean;
}

function SinglePickupStep({
  postPickupLocation, setPostPickupLocation, onBack, onPost, isAuthenticated,
  availableCommunities, selectedCommunityIds, onToggleCommunity, userNeighborhood,
  instructionExiting,
}: SinglePickupStepProps) {
  return (
    <>
      <TypedInstruction
        bulkReviewPhase="pickup"
        exiting={instructionExiting}
        stepLabel="Step 4 of 4"
        onBack={onBack}
      />
      <div className="mt-8 space-y-5 max-w-md mx-auto">
        <div>
          <label htmlFor="single-pickup-location" className="text-xs text-muted uppercase tracking-wider">
            Pickup location
          </label>
          <Input
            id="single-pickup-location"
            value={postPickupLocation}
            onChange={(e) => setPostPickupLocation(e.target.value)}
            placeholder="e.g. Lower East Side, NYC"
            maxLength={200}
            className="mt-1"
          />
          <p className="text-[10px] text-muted-soft mt-1.5 leading-relaxed">
            Your address will not be shared until pickup is confirmed.
          </p>
        </div>
        <CommunityPicker
          availableCommunities={availableCommunities}
          selectedCommunityIds={selectedCommunityIds}
          onToggleCommunity={onToggleCommunity}
          userNeighborhood={userNeighborhood}
        />
        <Button
          onClick={onPost}
          className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {isAuthenticated ? "Post listing" : "Sign in to Post"}
        </Button>
      </div>
    </>
  );
}
