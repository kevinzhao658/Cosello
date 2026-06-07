import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, startTransition, forwardRef } from "react";
import { Loader2, X, Plus, AlertTriangle, MapPin, ImagePlus, ArrowRight } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { apiFetch } from "../../lib/api";
import { uploadToStorage } from "../../lib/uploadToStorage";
import { compressImage } from "../../lib/compressImage";
import type { CategorySchema, CategorySlug } from "../../lib/types";
import { useDraftAutosave } from "./useDraftAutosave";
import { usePostListing } from "./usePostListing";
import {
  useSellWizard,
  selectBulkPreview,
  selectGroupsPreview,
  selectUploadPreview,
  type BulkPreview,
  type BulkPreviewBase,
  type PreviewStep,
  type BulkItemDetails,
  type ProductDetails,
  type SegmentationResult,
  type SellWizardState,
} from "./useSellWizard";
import { UploadStep } from "./steps/UploadStep";
import { GroupsStep } from "./steps/GroupsStep";
import { AIReviewStep } from "./steps/AIReviewStep";
import { PickupStep } from "./steps/PickupStep";
import { SingleListingForm } from "./SingleListingForm";
import { SinglePickupStep } from "./SinglePickupStep";
import { StepProgressBar } from "./StepProgressBar";
import { computeWizardStep } from "./wizardStep";

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
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<number[]>([]);
  const initializedFromNeighborhoodRef = useRef(false);
  // Single-listing wizard has its own two-phase split (review → pickup) to
  // mirror bulk's PickupStep. Bulk uses bulkReviewPhase; single uses this.
  const [singlePostPhase, setSinglePostPhase] = useState<"review" | "pickup">("review");
  const [isCompressing, setIsCompressing] = useState(false);
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

  const draft = useDraftAutosave({
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
  });

  const post = usePostListing({
    state,
    actions,
    isAuthenticated,
    currentDraftId,
    setCurrentDraftId,
    selectedCommunityIds,
    onPosted,
    onPublishedDraft,
    onRequestSignIn,
    clearDraftCreatedAt: draft.clearDraftCreatedAt,
  });

  // Auto-ticking "Saved · Xs ago" — bump every 15s while the indicator shows
  // a `saved` state so the relative timestamp stays fresh.
  const [, setSavedTick] = useState(0);
  useEffect(() => {
    if (draft.saveStatus.kind !== "saved") return;
    const id = setInterval(() => setSavedTick((n) => n + 1), 15000);
    return () => clearInterval(id);
  }, [draft.saveStatus.kind]);

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
  // Gated on mode === "ai" — manual mode is unaffected.
  // Attaches step + communitySelected + pickupLocationSet so BulkPreviewAside
  // can render step-aware checklist rows without needing wizard internals.
  useEffect(() => {
    let base: BulkPreviewBase | null = null;
    let step: PreviewStep | null = null;
    if (mode === "ai") {
      if (bulkItems.length > 0) {
        base = selectBulkPreview(bulkItems, currentCardIndex, segmentation?.image_urls, uploadedImages);
        step = bulkReviewPhase === "pickup" ? "pickup" : "review";
      } else if (segmentation) {
        base = selectGroupsPreview(segmentation, brandHints, names, currentCardIndex, uploadedImages);
        step = "groups";
      } else if (uploadedImages.length > 0) {
        base = selectUploadPreview(uploadedImages, currentCardIndex);
        step = "upload";
      }
    }
    const communitySelected = selectedCommunityIds.length > 0;
    const pickupLocationSet = bulkPickupLocation.trim() !== "";
    const preview: BulkPreview | null =
      base && step ? { ...base, step, communitySelected, pickupLocationSet } : null;
    onBulkPreviewChange?.(preview);
  }, [mode, bulkItems, currentCardIndex, segmentation, brandHints, names, uploadedImages, bulkReviewPhase, selectedCommunityIds, bulkPickupLocation, onBulkPreviewChange]);

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
    const formData = new FormData();
    if (token) {
      // Authenticated path: pre-upload to Supabase Storage, then send URLs.
      const urls = await uploadToStorage(files, token);
      formData.append("image_urls", JSON.stringify(urls));
    } else {
      // Guest path: skip storage upload, send raw files directly as multipart.
      // Backend saves them via _save_uploaded_images and returns image_urls.
      for (const f of files) {
        formData.append("images", f);
      }
    }
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
    setIsCompressing(true);
    const compressed = await Promise.all(incoming.map(compressImage));
    setIsCompressing(false);
    const newImages = compressed.map((file) => ({
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

  const addPhotoToBulkItem = async (index: number, files: FileList) => {
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
    setIsCompressing(true);
    const compressed = await Promise.all(incoming.map(compressImage));
    setIsCompressing(false);
    const newImages = compressed.map((file) => ({
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

  const resetForLogout = useCallback(() => {
    setCurrentDraftId(null);
    draft.clearDraftCreatedAt();
    setSelectedCommunityIds([]);
    setSinglePostPhase("review");
    setPrunedCommunityCount(0);
    draft.resetSaveStatus();
    segmentationAbortRef.current?.abort();
    segmentationAbortRef.current = null;
    for (const img of uploadedImages) URL.revokeObjectURL(img.preview);
    actions.resetToUpload();
  }, [uploadedImages, actions, draft]);

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
    setIsCompressing(true);
    void Promise.all(trimmed.map(compressImage))
      .then((compressed) => {
        const newImages = compressed.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
        }));
        actions.appendImages(newImages);
      })
      .finally(() => setIsCompressing(false));
  }, [uploadedImages.length, actions]);

  useImperativeHandle(ref, () => ({
    postSingleListing: post.postSingleListing,
    resetForLogout,
    addImages: addImagesFromFiles,
    getImageCount: () => uploadedImagesRef.current.length,
    getProductDetails: () => productDetailsRef.current,
    getCoverImageUrl: computeCoverImageUrl,
    setProductDetails: (details) => actions.setProductDetails(details),
    setPostPickupLocation: (value) => actions.setPostPickupLocation(value),
    setBulkCardIndex: (index) => actions.setCurrentCardIndex(index),
  }), [post.postSingleListing, resetForLogout, addImagesFromFiles, computeCoverImageUrl, actions]);

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

  const wizardStep = computeWizardStep({
    mode,
    productDetails,
    singlePostPhase,
    bulkReviewPhase,
  });

  // Jump back to a completed step from the progress bar. Bulk phases all share
  // the same persisted data, so any backward jump is safe; the single flow only
  // jumps back to Review. Step 1 (upload) and forward steps aren't jumpable.
  const handleStepJump = (step: number) => {
    if (inWizardPhase) {
      const phaseForStep: Record<number, "review" | "reason" | "cards" | "pickup"> = {
        2: "review",
        3: "reason",
        4: "cards",
        5: "pickup",
      };
      const target = phaseForStep[step];
      if (target && target !== bulkReviewPhase) transitionToPhase(target);
      return;
    }
    if (productDetails && step === 2 && singlePostPhase !== "review") {
      setSinglePostPhase("review");
    }
  };

  if (!isActive) return null;

  return (
    <>
      {draft.saveStatus.kind !== "idle" && (
        <div className="flex justify-end items-center gap-1.5 px-4 pt-2 text-[11px] font-medium">
          {draft.saveStatus.kind === "saving" && (
            <>
              <Loader2 className="size-3 animate-spin text-muted" aria-hidden />
              <span className="text-muted">Saving…</span>
            </>
          )}
          {draft.saveStatus.kind === "saved" && (
            <>
              <span className="size-1.5 rounded-full bg-primary shrink-0" aria-hidden />
              <span className="text-muted">Saved · {relativeTime(draft.saveStatus.at)}</span>
            </>
          )}
          {draft.saveStatus.kind === "failed" && draft.saveStatus.reason === "quota" && (
            <button
              type="button"
              onClick={() => onBackToDrafts?.()}
              className="inline-flex items-center gap-1.5 text-warning hover:underline"
            >
              <AlertTriangle className="size-3" aria-hidden />
              <span>Save failed — storage full. Tap to manage drafts.</span>
            </button>
          )}
          {draft.saveStatus.kind === "failed" && draft.saveStatus.reason === "unknown" && (
            <>
              <AlertTriangle className="size-3 text-warning" aria-hidden />
              <span className="text-warning">Save failed — try again.</span>
            </>
          )}
        </div>
      )}
      {wizardStep && (
        <StepProgressBar
          current={wizardStep.current}
          total={wizardStep.total}
          labels={wizardStep.labels}
          onStepClick={handleStepJump}
        />
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
      {bulkReviewPhase === null && (
        <header className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink">Photos</h2>
        </header>
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

      {isCompressing && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 text-sm text-muted" aria-live="polite">
          <Loader2 className="size-4 animate-spin shrink-0" aria-hidden />
          <span>Preparing photos…</span>
        </div>
      )}

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
              onFillManually={() => actions.initBulkManual()}
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
                              className="absolute -top-1.5 -right-1.5 z-20 size-5 inline-flex items-center justify-center rounded-full bg-ink/45 text-on-dark backdrop-blur-sm hover:bg-ink/65 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
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
                  <div key={index} className="relative size-[72px] rounded-md border border-hairline bg-surface-soft">
                    <img
                      src={img.preview}
                      alt={`Upload ${index + 1}`}
                      className="size-full object-cover rounded-md"
                    />
                    <button
                      type="button"
                      aria-label={`Delete photo ${index + 1}`}
                      onMouseDown={handleDeletePhotoMouseDown}
                      onClick={handleDeletePhotoClick(index)}
                      className="absolute -top-1.5 -right-1.5 z-20 size-5 inline-flex items-center justify-center rounded-full bg-ink/45 text-on-dark backdrop-blur-sm hover:bg-ink/65 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
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
              post.postBulkFromPickup();
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
