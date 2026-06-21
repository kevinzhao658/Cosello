import { useReducer, useMemo } from "react";
import type { CategorySlug } from "../../lib/types";
import {
  uploadedImagesReducer,
  segmentationReducer,
  bulkItemsReducer,
} from "./reducers";

export interface ProductDetails {
  brand: string;
  name: string;
  description: string;
  price: string;
  condition: string;
  location: string;
  tags: string[];
  category?: CategorySlug;
  categoryAttributes?: Record<string, string>;
  identifierConfidence?: "high" | "medium" | "low";
  retrieval_fallback?: boolean;
}

export interface BulkItemDetails extends ProductDetails {
  imageIndices: number[];
  _error?: string;
  pickupLocation?: string;
}

export interface SegmentationResult {
  groupings: number[][];
  image_urls: string[];
  vision_signals: unknown[];
}

export interface UploadedImage {
  file: File;
  preview: string;
}

export type BulkReviewPhase = "review" | "reason" | "cards" | "pickup" | null;

export interface DragState {
  imageIndex: number;
  sourceGroup: number;
}

export interface SellWizardState {
  uploadedImages: UploadedImage[];
  bulkReviewPhase: BulkReviewPhase;
  segmentation: SegmentationResult | null;
  brandHints: string[];
  names: string[];
  rationale: string;
  rationaleOther: string;
  productDetails: ProductDetails | null;
  bulkItems: BulkItemDetails[];
  currentCardIndex: number;
  bulkPickupLocation: string;
  postPickupLocation: string;
  isGenerating: boolean;
  isPostingBulk: boolean;
  segmentationError: string | null;
  dragImageState: DragState | null;
  dragOverGroup: number | null;
  dragOverGap: number | null;
  groupingsModified: boolean;
  modifiedGroupIndices: Set<number>;
  newTag: string;
  editingTitle: string | null;
  instructionExiting: boolean;
}

export const initialSellWizardState: SellWizardState = {
  uploadedImages: [],
  bulkReviewPhase: null,
  segmentation: null,
  brandHints: [],
  names: [],
  rationale: "",
  rationaleOther: "",
  productDetails: null,
  bulkItems: [],
  currentCardIndex: 0,
  bulkPickupLocation: "",
  postPickupLocation: "",
  isGenerating: false,
  isPostingBulk: false,
  segmentationError: null,
  dragImageState: null,
  dragOverGroup: null,
  dragOverGap: null,
  groupingsModified: false,
  modifiedGroupIndices: new Set<number>(),
  newTag: "",
  editingTitle: null,
  instructionExiting: false,
};

export type SellWizardAction =
  | { type: "APPEND_IMAGES"; images: UploadedImage[] }
  | { type: "SET_IMAGES"; images: UploadedImage[] }
  | { type: "RESET_TO_UPLOAD" }
  | { type: "CLEAR_ALL" }
  | { type: "SEGMENTATION_START" }
  | { type: "SEGMENTATION_SUCCESS"; result: SegmentationResult; resetRationale: boolean; postPickupLocation: string }
  | { type: "SEGMENTATION_FAILURE"; error: string }
  | { type: "RE_SEGMENT_SUCCESS"; result: SegmentationResult }
  | { type: "GENERATE_START" }
  | { type: "GENERATE_END" }
  | { type: "GENERATE_SINGLE"; details: ProductDetails }
  | { type: "GENERATE_BULK"; items: BulkItemDetails[] }
  | { type: "INIT_BULK_MANUAL" }
  | { type: "REGENERATE_BULK_ITEM"; index: number; item: BulkItemDetails }
  | { type: "SET_PHASE"; phase: BulkReviewPhase }
  | { type: "SET_BRAND_HINT"; index: number; value: string }
  | { type: "SET_NAME"; index: number; value: string }
  | { type: "SET_RATIONALE"; value: string }
  | { type: "SET_RATIONALE_OTHER"; value: string }
  | { type: "SET_BULK_PICKUP_LOCATION"; value: string }
  | { type: "SET_POST_PICKUP_LOCATION"; value: string }
  | { type: "SET_PRODUCT_DETAILS"; details: ProductDetails | null }
  | { type: "SET_BULK_ITEMS"; items: BulkItemDetails[] }
  | { type: "UPDATE_BULK_ITEM_FIELD"; index: number; field: string; value: unknown }
  | { type: "UPDATE_BULK_ITEM"; index: number; patch: Partial<BulkItemDetails> }
  | { type: "DELETE_BULK_ITEM"; index: number }
  | { type: "SET_CURRENT_CARD_INDEX"; index: number }
  | { type: "SET_EDITING_TITLE"; value: string | null }
  | { type: "SET_NEW_TAG"; value: string }
  | { type: "SET_INSTRUCTION_EXITING"; value: boolean }
  | { type: "DRAG_START"; imageIndex: number; sourceGroup: number }
  | { type: "DRAG_OVER_GROUP"; groupIndex: number | null }
  | { type: "DRAG_OVER_GAP"; gapIndex: number | null }
  | { type: "DRAG_END" }
  | { type: "REVIEW_REASSIGN_IMAGE"; imageIndex: number; sourceGroup: number; targetGroup: number }
  | { type: "REVIEW_SPLIT_IMAGE"; imageIndex: number; sourceGroup: number; gapIndex: number }
  | { type: "REVIEW_MERGE_GROUPS"; sourceGroup: number; destGroup: number }
  | { type: "CARDS_REASSIGN_IMAGE"; imageIndex: number; sourceGroup: number; targetGroup: number }
  | { type: "CARDS_SPLIT_IMAGE"; imageIndex: number; sourceGroup: number; gapIndex: number }
  | { type: "DELETE_PHOTO"; index: number }
  | { type: "ADD_PHOTOS_TO_BULK_ITEM"; index: number; images: UploadedImage[] }
  | { type: "POST_LISTING_RESET" }
  | { type: "SET_POSTING_BULK"; value: boolean }
  | { type: "SET_GENERATING"; value: boolean }
  | { type: "SET_SEGMENTATION_ERROR"; value: string | null }
  | { type: "BACK_FROM_REVIEW" }
  | { type: "RESET_FROM_LOGOUT" }
  | { type: "PARTIAL_RESET_FROM_BUY_SWITCH" }
  | { type: "LOAD_FROM_DRAFT"; state: SellWizardState }
  | { type: "REORDER_BULK_ITEM_PHOTOS"; index: number; from: number; to: number }
  | { type: "REORDER_SINGLE_PHOTOS"; from: number; to: number };

function emptyWizardState(): SellWizardState {
  return {
    ...initialSellWizardState,
    modifiedGroupIndices: new Set<number>(),
  };
}

/**
 * Immutably moves an element from index `from` to index `to` in `arr`.
 * Returns the original array reference unchanged when `from === to` or
 * either index is out of bounds.
 */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function sellWizardReducer(state: SellWizardState, action: SellWizardAction): SellWizardState {
  switch (action.type) {
    // ── Uploaded-images domain ──────────────────────────────────────────────
    case "APPEND_IMAGES":
    case "SET_IMAGES":
      return {
        ...state,
        uploadedImages: uploadedImagesReducer(state.uploadedImages, action),
      };

    // ── Full-reset actions ─────────────────────────────────────────────────
    case "RESET_TO_UPLOAD":
    case "CLEAR_ALL":
    case "RESET_FROM_LOGOUT":
      return emptyWizardState();

    // ── Segmentation domain ────────────────────────────────────────────────
    case "SEGMENTATION_START":
    case "SEGMENTATION_SUCCESS":
    case "SEGMENTATION_FAILURE":
    case "RE_SEGMENT_SUCCESS":
    case "SET_BRAND_HINT":
    case "SET_NAME":
    case "REVIEW_REASSIGN_IMAGE":
    case "REVIEW_SPLIT_IMAGE":
    case "REVIEW_MERGE_GROUPS":
    case "BACK_FROM_REVIEW":
      return segmentationReducer(state, action);

    // ── Generate-single (cross-domain: productDetails + bulk clear) ────────
    case "GENERATE_START":
      return { ...state, isGenerating: true };
    case "GENERATE_END":
      return { ...state, isGenerating: false };
    case "GENERATE_SINGLE":
      return {
        ...state,
        isGenerating: false,
        productDetails: action.details,
        bulkItems: [],
        bulkReviewPhase: null,
        groupingsModified: false,
        modifiedGroupIndices: new Set<number>(),
      };

    // ── Bulk-items domain ──────────────────────────────────────────────────
    case "GENERATE_BULK":
    case "INIT_BULK_MANUAL":
    case "REGENERATE_BULK_ITEM":
    case "SET_PHASE":
    case "SET_BULK_ITEMS":
    case "UPDATE_BULK_ITEM_FIELD":
    case "UPDATE_BULK_ITEM":
    case "DELETE_BULK_ITEM":
    case "SET_CURRENT_CARD_INDEX":
    case "CARDS_REASSIGN_IMAGE":
    case "CARDS_SPLIT_IMAGE":
    case "REORDER_BULK_ITEM_PHOTOS":
      return bulkItemsReducer(state, action);

    // ── Simple scalar setters ──────────────────────────────────────────────
    case "SET_RATIONALE":
      return {
        ...state,
        rationale: action.value,
        rationaleOther: action.value !== "Other" ? "" : state.rationaleOther,
      };
    case "SET_RATIONALE_OTHER":
      return { ...state, rationaleOther: action.value };
    case "SET_BULK_PICKUP_LOCATION":
      return { ...state, bulkPickupLocation: action.value };
    case "SET_POST_PICKUP_LOCATION":
      return { ...state, postPickupLocation: action.value };
    case "SET_PRODUCT_DETAILS":
      return { ...state, productDetails: action.details };
    case "SET_EDITING_TITLE":
      return { ...state, editingTitle: action.value };
    case "SET_NEW_TAG":
      return { ...state, newTag: action.value };
    case "SET_INSTRUCTION_EXITING":
      return { ...state, instructionExiting: action.value };

    // ── Drag cursor state ──────────────────────────────────────────────────
    case "DRAG_START":
      return {
        ...state,
        dragImageState: { imageIndex: action.imageIndex, sourceGroup: action.sourceGroup },
      };
    case "DRAG_OVER_GROUP":
      return { ...state, dragOverGroup: action.groupIndex };
    case "DRAG_OVER_GAP":
      return { ...state, dragOverGap: action.gapIndex };
    case "DRAG_END":
      return { ...state, dragImageState: null, dragOverGroup: null, dragOverGap: null };

    // ── Cross-domain photo mutations ───────────────────────────────────────
    case "DELETE_PHOTO": {
      const originalIndex = action.index;
      const removed = state.uploadedImages[originalIndex];
      if (!removed) return state;
      const remap = (i: number): number => (i > originalIndex ? i - 1 : i);
      const nextImages = state.uploadedImages.filter((_, i) => i !== originalIndex);

      if (nextImages.length === 0) {
        return emptyWizardState();
      }

      let nextSegmentation = state.segmentation;
      let nextBrandHints = state.brandHints;
      let nextNames = state.names;
      const emptiedGroupPositions: number[] = [];

      if (state.segmentation) {
        const nextGroupings: number[][] = [];
        state.segmentation.groupings.forEach((group, gIdx) => {
          const filtered = group.filter((i) => i !== originalIndex).map(remap);
          if (filtered.length === 0) {
            emptiedGroupPositions.push(gIdx);
          } else {
            nextGroupings.push(filtered);
          }
        });
        const nextImageUrls = state.segmentation.image_urls.filter((_, i) => i !== originalIndex);
        const nextVisionSignals = state.segmentation.vision_signals.filter((_, i) => i !== originalIndex);
        nextSegmentation = {
          ...state.segmentation,
          groupings: nextGroupings,
          image_urls: nextImageUrls,
          vision_signals: nextVisionSignals,
        };
        if (emptiedGroupPositions.length > 0) {
          const emptiedSet = new Set(emptiedGroupPositions);
          nextBrandHints = state.brandHints.filter((_, idx) => !emptiedSet.has(idx));
          nextNames = state.names.filter((_, idx) => !emptiedSet.has(idx));
        }
      }

      let nextBulk = state.bulkItems;
      let nextPhase = state.bulkReviewPhase;
      let nextCardIndex = state.currentCardIndex;
      if (state.bulkItems.length > 0) {
        let bulkChanged = false;
        const candidate: BulkItemDetails[] = [];
        state.bulkItems.forEach((item) => {
          if (!item.imageIndices.includes(originalIndex)) {
            const remapped = item.imageIndices.map(remap);
            if (remapped.some((v, i) => v !== item.imageIndices[i])) {
              bulkChanged = true;
              candidate.push({ ...item, imageIndices: remapped });
            } else {
              candidate.push(item);
            }
            return;
          }
          bulkChanged = true;
          const filtered = item.imageIndices.filter((i) => i !== originalIndex).map(remap);
          if (filtered.length > 0) {
            candidate.push({ ...item, imageIndices: filtered });
          }
        });
        if (bulkChanged) {
          nextBulk = candidate;
          if (candidate.length === 0) {
            nextPhase = null;
            nextCardIndex = 0;
          } else if (state.currentCardIndex >= candidate.length) {
            nextCardIndex = candidate.length - 1;
          }
        }
      }

      return {
        ...state,
        uploadedImages: nextImages,
        segmentation: nextSegmentation,
        brandHints: nextBrandHints,
        names: nextNames,
        bulkItems: nextBulk,
        bulkReviewPhase: nextPhase,
        currentCardIndex: nextCardIndex,
      };
    }

    case "ADD_PHOTOS_TO_BULK_ITEM": {
      const startIdx = state.uploadedImages.length;
      const nextImages = [...state.uploadedImages, ...action.images];
      const newIndices = action.images.map((_, i) => startIdx + i);
      const updated = [...state.bulkItems];
      updated[action.index] = {
        ...updated[action.index],
        imageIndices: [...updated[action.index].imageIndices, ...newIndices],
      };
      return { ...state, uploadedImages: nextImages, bulkItems: updated };
    }

    // ── Status flags ───────────────────────────────────────────────────────
    case "POST_LISTING_RESET":
      return emptyWizardState();
    case "SET_POSTING_BULK":
      return { ...state, isPostingBulk: action.value };
    case "SET_GENERATING":
      return { ...state, isGenerating: action.value };
    case "SET_SEGMENTATION_ERROR":
      return { ...state, segmentationError: action.value };

    // ── Lifecycle resets ───────────────────────────────────────────────────
    case "PARTIAL_RESET_FROM_BUY_SWITCH":
      // Matches original effect: when user switches tradeMode → buy mid-flow,
      // bulkItems + phase + currentCardIndex are cleared, but uploadedImages,
      // segmentation, hints, etc. survive so the user can resume on return.
      return {
        ...state,
        bulkItems: [],
        bulkReviewPhase: null,
        currentCardIndex: 0,
      };
    case "LOAD_FROM_DRAFT":
      // Replace the entire reducer state with the hydrated payload.
      // Caller is responsible for filtering transient fields out before save
      // (draftStorage.ts) and defaulting them back in on load (SellWizard.tsx).
      return action.state;

    // ── Single-photo reorder (uploadedImages + segmentation.image_urls) ───
    case "REORDER_SINGLE_PHOTOS": {
      const nextImages = arrayMove(state.uploadedImages, action.from, action.to);
      if (nextImages === state.uploadedImages) return state;
      let nextSeg = state.segmentation;
      if (state.segmentation) {
        // image_urls is string[] — pad missing entries with "" so the array
        // stays aligned with uploadedImages after reorder.
        const urls = state.segmentation.image_urls ?? [];
        const padded: string[] = state.uploadedImages.map((_, i) => urls[i] ?? "");
        nextSeg = { ...state.segmentation, image_urls: arrayMove(padded, action.from, action.to) };
      }
      return { ...state, uploadedImages: nextImages, segmentation: nextSeg };
    }

    default:
      return state;
  }
}

export interface SellWizardActions {
  appendImages: (images: UploadedImage[]) => void;
  setImages: (images: UploadedImage[]) => void;
  resetToUpload: () => void;
  clearAll: () => void;
  segmentationStart: () => void;
  segmentationSuccess: (args: { result: SegmentationResult; resetRationale: boolean; postPickupLocation: string }) => void;
  segmentationFailure: (error: string) => void;
  reSegmentSuccess: (result: SegmentationResult) => void;
  generateStart: () => void;
  generateEnd: () => void;
  generateSingle: (details: ProductDetails) => void;
  generateBulk: (items: BulkItemDetails[]) => void;
  initBulkManual: () => void;
  regenerateBulkItem: (index: number, item: BulkItemDetails) => void;
  setPhase: (phase: BulkReviewPhase) => void;
  setBrandHint: (index: number, value: string) => void;
  setName: (index: number, value: string) => void;
  setRationale: (value: string) => void;
  setRationaleOther: (value: string) => void;
  setBulkPickupLocation: (value: string) => void;
  setPostPickupLocation: (value: string) => void;
  setProductDetails: (details: ProductDetails | null) => void;
  setBulkItems: (items: BulkItemDetails[]) => void;
  updateBulkItemField: (index: number, field: string, value: unknown) => void;
  updateBulkItem: (index: number, patch: Partial<BulkItemDetails>) => void;
  deleteBulkItem: (index: number) => void;
  setCurrentCardIndex: (index: number) => void;
  setEditingTitle: (value: string | null) => void;
  setNewTag: (value: string) => void;
  setInstructionExiting: (value: boolean) => void;
  dragStart: (imageIndex: number, sourceGroup: number) => void;
  dragOverGroup: (groupIndex: number | null) => void;
  dragOverGap: (gapIndex: number | null) => void;
  dragEnd: () => void;
  reviewReassignImage: (imageIndex: number, sourceGroup: number, targetGroup: number) => void;
  reviewSplitImage: (imageIndex: number, sourceGroup: number, gapIndex: number) => void;
  reviewMergeGroups: (sourceGroup: number, destGroup: number) => void;
  cardsReassignImage: (imageIndex: number, sourceGroup: number, targetGroup: number) => void;
  cardsSplitImage: (imageIndex: number, sourceGroup: number, gapIndex: number) => void;
  deletePhoto: (index: number) => void;
  addPhotosToBulkItem: (index: number, images: UploadedImage[]) => void;
  postListingReset: () => void;
  setPostingBulk: (value: boolean) => void;
  setGenerating: (value: boolean) => void;
  setSegmentationError: (value: string | null) => void;
  backFromReview: () => void;
  partialResetFromBuySwitch: () => void;
  loadFromDraft: (state: SellWizardState) => void;
  reorderBulkItemPhotos: (index: number, from: number, to: number) => void;
  reorderSinglePhotos: (from: number, to: number) => void;
}

// ─── BulkPreview type + selector ───────────────────────────────────────────

export type PreviewStep = "upload" | "groups" | "review" | "pickup";

export interface BulkPreviewBase {
  index: number;
  count: number;
  unit: "Photo" | "Preview";
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

export interface BulkPreview extends BulkPreviewBase {
  step: PreviewStep;
  communitySelected: boolean;
  pickupLocationSet: boolean;
}

/**
 * Build a BulkPreviewBase from wizard state. Returns null when there are no bulk items.
 * Resolves the cover image URL inside the selector so callers (SellWizard.tsx) need no
 * image-index knowledge. The emit effect in SellWizard.tsx attaches step + signals.
 */
export function selectBulkPreview(
  bulkItems: BulkItemDetails[],
  currentCardIndex: number,
  imageUrls: string[] | undefined,
  uploadedImages: UploadedImage[],
): BulkPreviewBase | null {
  if (bulkItems.length === 0) return null;
  const i = Math.min(Math.max(currentCardIndex, 0), bulkItems.length - 1);
  const it = bulkItems[i];
  const firstIdx = it.imageIndices[0] ?? null;
  const imageUrl: string | null =
    firstIdx !== null
      ? (imageUrls?.[firstIdx] ?? uploadedImages[firstIdx]?.preview ?? null)
      : null;
  return {
    index: i,
    count: bulkItems.length,
    unit: "Preview",
    item: {
      brand: it.brand,
      name: it.name,
      price: it.price,
      condition: it.condition,
      description: it.description,
      location: it.location,
      tagsCount: it.tags.length,
      imageUrl,
    },
  };
}

/**
 * Build a BulkPreviewBase from a photo group (Groups phase, before details exist).
 * Returns null when there is no segmentation / no groups. price & description are
 * null (pending); photoCount carries the group size for the "{n} photos" pill.
 * The emit effect in SellWizard.tsx attaches step + signals.
 */
export function selectGroupsPreview(
  segmentation: SegmentationResult | null,
  brandHints: string[],
  names: string[],
  currentCardIndex: number,
  uploadedImages: UploadedImage[],
): BulkPreviewBase | null {
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
    unit: "Preview",
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

/**
 * Build a BulkPreviewBase from raw uploaded photos (Upload step, AI mode, pre-segmentation).
 * One slide per photo; unit "Photo"; all listing fields pending. Returns null when no photos.
 * The emit effect in SellWizard.tsx attaches step + signals.
 */
export function selectUploadPreview(
  uploadedImages: UploadedImage[],
  currentCardIndex: number,
): BulkPreviewBase | null {
  if (uploadedImages.length === 0) return null;
  const count = uploadedImages.length;
  const i = Math.min(Math.max(currentCardIndex, 0), count - 1);
  const imageUrl = uploadedImages[i]?.preview ?? null;
  return {
    index: i,
    count,
    unit: "Photo",
    item: {
      brand: "",
      name: "",
      price: null,
      condition: "",
      description: null,
      location: "",
      tagsCount: 0,
      imageUrl,
    },
  };
}

export function useSellWizard(): [SellWizardState, SellWizardActions] {
  const [state, dispatch] = useReducer(sellWizardReducer, undefined, emptyWizardState);

  const actions = useMemo<SellWizardActions>(() => ({
    appendImages: (images) => dispatch({ type: "APPEND_IMAGES", images }),
    setImages: (images) => dispatch({ type: "SET_IMAGES", images }),
    resetToUpload: () => dispatch({ type: "RESET_TO_UPLOAD" }),
    clearAll: () => dispatch({ type: "CLEAR_ALL" }),
    segmentationStart: () => dispatch({ type: "SEGMENTATION_START" }),
    segmentationSuccess: ({ result, resetRationale, postPickupLocation }) =>
      dispatch({ type: "SEGMENTATION_SUCCESS", result, resetRationale, postPickupLocation }),
    segmentationFailure: (error) => dispatch({ type: "SEGMENTATION_FAILURE", error }),
    reSegmentSuccess: (result) => dispatch({ type: "RE_SEGMENT_SUCCESS", result }),
    generateStart: () => dispatch({ type: "GENERATE_START" }),
    generateEnd: () => dispatch({ type: "GENERATE_END" }),
    generateSingle: (details) => dispatch({ type: "GENERATE_SINGLE", details }),
    generateBulk: (items) => dispatch({ type: "GENERATE_BULK", items }),
    initBulkManual: () => dispatch({ type: "INIT_BULK_MANUAL" }),
    regenerateBulkItem: (index, item) => dispatch({ type: "REGENERATE_BULK_ITEM", index, item }),
    setPhase: (phase) => dispatch({ type: "SET_PHASE", phase }),
    setBrandHint: (index, value) => dispatch({ type: "SET_BRAND_HINT", index, value }),
    setName: (index, value) => dispatch({ type: "SET_NAME", index, value }),
    setRationale: (value) => dispatch({ type: "SET_RATIONALE", value }),
    setRationaleOther: (value) => dispatch({ type: "SET_RATIONALE_OTHER", value }),
    setBulkPickupLocation: (value) => dispatch({ type: "SET_BULK_PICKUP_LOCATION", value }),
    setPostPickupLocation: (value) => dispatch({ type: "SET_POST_PICKUP_LOCATION", value }),
    setProductDetails: (details) => dispatch({ type: "SET_PRODUCT_DETAILS", details }),
    setBulkItems: (items) => dispatch({ type: "SET_BULK_ITEMS", items }),
    updateBulkItemField: (index, field, value) =>
      dispatch({ type: "UPDATE_BULK_ITEM_FIELD", index, field, value }),
    updateBulkItem: (index, patch) => dispatch({ type: "UPDATE_BULK_ITEM", index, patch }),
    deleteBulkItem: (index) => dispatch({ type: "DELETE_BULK_ITEM", index }),
    setCurrentCardIndex: (index) => dispatch({ type: "SET_CURRENT_CARD_INDEX", index }),
    setEditingTitle: (value) => dispatch({ type: "SET_EDITING_TITLE", value }),
    setNewTag: (value) => dispatch({ type: "SET_NEW_TAG", value }),
    setInstructionExiting: (value) => dispatch({ type: "SET_INSTRUCTION_EXITING", value }),
    dragStart: (imageIndex, sourceGroup) =>
      dispatch({ type: "DRAG_START", imageIndex, sourceGroup }),
    dragOverGroup: (groupIndex) => dispatch({ type: "DRAG_OVER_GROUP", groupIndex }),
    dragOverGap: (gapIndex) => dispatch({ type: "DRAG_OVER_GAP", gapIndex }),
    dragEnd: () => dispatch({ type: "DRAG_END" }),
    reviewReassignImage: (imageIndex, sourceGroup, targetGroup) =>
      dispatch({ type: "REVIEW_REASSIGN_IMAGE", imageIndex, sourceGroup, targetGroup }),
    reviewSplitImage: (imageIndex, sourceGroup, gapIndex) =>
      dispatch({ type: "REVIEW_SPLIT_IMAGE", imageIndex, sourceGroup, gapIndex }),
    reviewMergeGroups: (sourceGroup, destGroup) =>
      dispatch({ type: "REVIEW_MERGE_GROUPS", sourceGroup, destGroup }),
    cardsReassignImage: (imageIndex, sourceGroup, targetGroup) =>
      dispatch({ type: "CARDS_REASSIGN_IMAGE", imageIndex, sourceGroup, targetGroup }),
    cardsSplitImage: (imageIndex, sourceGroup, gapIndex) =>
      dispatch({ type: "CARDS_SPLIT_IMAGE", imageIndex, sourceGroup, gapIndex }),
    deletePhoto: (index) => dispatch({ type: "DELETE_PHOTO", index }),
    addPhotosToBulkItem: (index, images) =>
      dispatch({ type: "ADD_PHOTOS_TO_BULK_ITEM", index, images }),
    postListingReset: () => dispatch({ type: "POST_LISTING_RESET" }),
    setPostingBulk: (value) => dispatch({ type: "SET_POSTING_BULK", value }),
    setGenerating: (value) => dispatch({ type: "SET_GENERATING", value }),
    setSegmentationError: (value) => dispatch({ type: "SET_SEGMENTATION_ERROR", value }),
    backFromReview: () => dispatch({ type: "BACK_FROM_REVIEW" }),
    partialResetFromBuySwitch: () => dispatch({ type: "PARTIAL_RESET_FROM_BUY_SWITCH" }),
    loadFromDraft: (state) => dispatch({ type: "LOAD_FROM_DRAFT", state }),
    reorderBulkItemPhotos: (index, from, to) =>
      dispatch({ type: "REORDER_BULK_ITEM_PHOTOS", index, from, to }),
    reorderSinglePhotos: (from, to) => dispatch({ type: "REORDER_SINGLE_PHOTOS", from, to }),
  }), []);

  return [state, actions];
}
