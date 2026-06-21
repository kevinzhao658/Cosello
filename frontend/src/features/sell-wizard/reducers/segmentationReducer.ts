/**
 * Segmentation sub-reducer.
 *
 * Handles actions that primarily mutate `segmentation`, `brandHints`, `names`,
 * `isGenerating`, and `segmentationError`. Actions that modify these fields
 * alongside unrelated domains (e.g. DELETE_PHOTO) remain in the root reducer.
 *
 * Covered actions:
 *   SEGMENTATION_START       — mark generating, clear error + productDetails
 *   SEGMENTATION_SUCCESS     — store result, init hints/names arrays, open review phase
 *   SEGMENTATION_FAILURE     — clear generating flag, store error
 *   RE_SEGMENT_SUCCESS       — update result + reinit hints/names (no phase change)
 *   SET_BRAND_HINT           — update one entry in brandHints
 *   SET_NAME                 — update one entry in names
 *   REVIEW_REASSIGN_IMAGE    — move an image between segmentation groups; removes
 *                              empty source group and its hints/names entry
 *   REVIEW_SPLIT_IMAGE       — split an image out of its group into a new group;
 *                              inserts new blank hints/names entry
 *   REVIEW_MERGE_GROUPS      — merge a source group into a dest group; removes
 *                              source group and its hints/names entry
 *   BACK_FROM_REVIEW         — clear segmentation + hints/names + rationale fields
 *
 * Note: BACK_FROM_REVIEW also touches `bulkReviewPhase`, `rationale`, and
 * `rationaleOther`. Because these are all simple scalar resets and are
 * co-owned by this domain conceptually, the action is handled here by
 * receiving and returning the full SellWizardState slice needed.
 */

import type { SellWizardState, SellWizardAction } from "../useSellWizard";

export type SegmentationAction =
  | Extract<SellWizardAction, { type: "SEGMENTATION_START" }>
  | Extract<SellWizardAction, { type: "SEGMENTATION_SUCCESS" }>
  | Extract<SellWizardAction, { type: "SEGMENTATION_FAILURE" }>
  | Extract<SellWizardAction, { type: "RE_SEGMENT_SUCCESS" }>
  | Extract<SellWizardAction, { type: "SET_BRAND_HINT" }>
  | Extract<SellWizardAction, { type: "SET_NAME" }>
  | Extract<SellWizardAction, { type: "REVIEW_REASSIGN_IMAGE" }>
  | Extract<SellWizardAction, { type: "REVIEW_SPLIT_IMAGE" }>
  | Extract<SellWizardAction, { type: "REVIEW_MERGE_GROUPS" }>
  | Extract<SellWizardAction, { type: "BACK_FROM_REVIEW" }>;

/**
 * Operates on the full state because BACK_FROM_REVIEW and the REVIEW_* drag
 * actions also reset drag cursor state (`dragImageState`, `dragOverGroup`,
 * `dragOverGap`), which live outside the segmentation slice.
 */
export function segmentationReducer(
  state: SellWizardState,
  action: SegmentationAction,
): SellWizardState {
  switch (action.type) {
    case "SEGMENTATION_START":
      return { ...state, isGenerating: true, segmentationError: null, productDetails: null };

    case "SEGMENTATION_SUCCESS":
      return {
        ...state,
        isGenerating: false,
        segmentation: action.result,
        brandHints: action.result.groupings.map(() => ""),
        names: action.result.groupings.map(() => ""),
        rationale: action.resetRationale ? "" : state.rationale,
        rationaleOther: action.resetRationale ? "" : state.rationaleOther,
        bulkItems: [],
        currentCardIndex: 0,
        bulkReviewPhase: "review",
        groupingsModified: false,
        modifiedGroupIndices: new Set<number>(),
        postPickupLocation: action.postPickupLocation,
      };

    case "SEGMENTATION_FAILURE":
      return { ...state, isGenerating: false, segmentationError: action.error };

    case "RE_SEGMENT_SUCCESS":
      return {
        ...state,
        isGenerating: false,
        segmentation: action.result,
        brandHints: action.result.groupings.map(() => ""),
        names: action.result.groupings.map(() => ""),
      };

    case "SET_BRAND_HINT": {
      const next = [...state.brandHints];
      next[action.index] = action.value;
      return { ...state, brandHints: next };
    }

    case "SET_NAME": {
      const next = [...state.names];
      next[action.index] = action.value;
      return { ...state, names: next };
    }

    case "REVIEW_REASSIGN_IMAGE": {
      if (!state.segmentation || action.sourceGroup === action.targetGroup) return state;
      const groupings = state.segmentation.groupings;
      const isLastInSource = groupings[action.sourceGroup].length <= 1;
      let next = groupings.map((g, idx) => {
        if (idx === action.sourceGroup) return g.filter((i) => i !== action.imageIndex);
        if (idx === action.targetGroup) return [...g, action.imageIndex];
        return g;
      });
      let nextHints = state.brandHints;
      let nextNames = state.names;
      if (isLastInSource) {
        next = next.filter((_, idx) => idx !== action.sourceGroup);
        nextHints = state.brandHints.filter((_, idx) => idx !== action.sourceGroup);
        nextNames = state.names.filter((_, idx) => idx !== action.sourceGroup);
      }
      return {
        ...state,
        segmentation: { ...state.segmentation, groupings: next },
        brandHints: nextHints,
        names: nextNames,
        dragImageState: null,
        dragOverGroup: null,
      };
    }

    case "REVIEW_SPLIT_IMAGE": {
      if (!state.segmentation) return state;
      const groupings = state.segmentation.groupings;
      if (groupings[action.sourceGroup].length <= 1) {
        return { ...state, dragImageState: null, dragOverGroup: null, dragOverGap: null };
      }
      const next = groupings.map((g, idx) =>
        idx === action.sourceGroup ? g.filter((i) => i !== action.imageIndex) : g,
      );
      next.splice(action.gapIndex, 0, [action.imageIndex]);
      const nextHints = [...state.brandHints];
      nextHints.splice(action.gapIndex, 0, "");
      const nextNames = [...state.names];
      nextNames.splice(action.gapIndex, 0, "");
      return {
        ...state,
        segmentation: { ...state.segmentation, groupings: next },
        brandHints: nextHints,
        names: nextNames,
        dragImageState: null,
        dragOverGroup: null,
        dragOverGap: null,
      };
    }

    case "REVIEW_MERGE_GROUPS": {
      if (!state.segmentation || action.sourceGroup === action.destGroup) return state;
      const groupings = state.segmentation.groupings;
      if (action.sourceGroup < 0 || action.sourceGroup >= groupings.length) return state;
      if (action.destGroup < 0 || action.destGroup >= groupings.length) return state;
      const merged = groupings
        .map((g, idx) => {
          if (idx === action.destGroup) return [...g, ...groupings[action.sourceGroup]];
          return g;
        })
        .filter((_, idx) => idx !== action.sourceGroup);
      const nextHints = state.brandHints.filter((_, idx) => idx !== action.sourceGroup);
      const nextNames = state.names.filter((_, idx) => idx !== action.sourceGroup);
      return {
        ...state,
        segmentation: { ...state.segmentation, groupings: merged },
        brandHints: nextHints,
        names: nextNames,
      };
    }

    case "BACK_FROM_REVIEW":
      return {
        ...state,
        bulkReviewPhase: null,
        segmentation: null,
        brandHints: [],
        names: [],
        rationale: "",
        rationaleOther: "",
      };
  }
}
