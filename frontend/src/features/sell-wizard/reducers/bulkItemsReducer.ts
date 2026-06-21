/**
 * Bulk-items sub-reducer.
 *
 * Handles actions that primarily mutate `bulkItems`, `currentCardIndex`,
 * `bulkReviewPhase`, `groupingsModified`, and `modifiedGroupIndices`.
 *
 * Covered actions:
 *   GENERATE_BULK          — store AI-generated items, open cards phase
 *   INIT_BULK_MANUAL       — build items from segmentation groupings + hints,
 *                            open cards phase without calling AI
 *   REGENERATE_BULK_ITEM   — replace one item after a per-item re-generate
 *   SET_BULK_ITEMS         — wholesale replace the items array
 *   UPDATE_BULK_ITEM_FIELD — update one typed field on one item
 *   UPDATE_BULK_ITEM       — apply a partial patch to one item
 *   DELETE_BULK_ITEM       — remove one item; adjusts currentCardIndex and
 *                            clears bulkReviewPhase when the last item is gone
 *   SET_CURRENT_CARD_INDEX — move the focused card
 *   CARDS_REASSIGN_IMAGE   — drag an image from one card to another; removes
 *                            source card when it becomes empty; shifts indices
 *                            and modifiedGroupIndices accordingly
 *   CARDS_SPLIT_IMAGE      — drag an image out of a card into a new blank card
 *                            at a given gap position; shifts indices
 *   REORDER_BULK_ITEM_PHOTOS — reorder photos within one card
 *   SET_PHASE              — directly set bulkReviewPhase
 */

import type { SellWizardState, SellWizardAction, BulkItemDetails } from "../useSellWizard";

/** Helper: immutably move element `from` to `to` in `arr`. */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export type BulkItemsAction =
  | Extract<SellWizardAction, { type: "GENERATE_BULK" }>
  | Extract<SellWizardAction, { type: "INIT_BULK_MANUAL" }>
  | Extract<SellWizardAction, { type: "REGENERATE_BULK_ITEM" }>
  | Extract<SellWizardAction, { type: "SET_BULK_ITEMS" }>
  | Extract<SellWizardAction, { type: "UPDATE_BULK_ITEM_FIELD" }>
  | Extract<SellWizardAction, { type: "UPDATE_BULK_ITEM" }>
  | Extract<SellWizardAction, { type: "DELETE_BULK_ITEM" }>
  | Extract<SellWizardAction, { type: "SET_CURRENT_CARD_INDEX" }>
  | Extract<SellWizardAction, { type: "CARDS_REASSIGN_IMAGE" }>
  | Extract<SellWizardAction, { type: "CARDS_SPLIT_IMAGE" }>
  | Extract<SellWizardAction, { type: "REORDER_BULK_ITEM_PHOTOS" }>
  | Extract<SellWizardAction, { type: "SET_PHASE" }>;

/**
 * Operates on the full state because CARDS_REASSIGN_IMAGE / CARDS_SPLIT_IMAGE
 * also clear drag cursor state (`dragImageState`, `dragOverGroup`, `dragOverGap`).
 * INIT_BULK_MANUAL reads `segmentation`, `brandHints`, and `names` from state.
 */
export function bulkItemsReducer(
  state: SellWizardState,
  action: BulkItemsAction,
): SellWizardState {
  switch (action.type) {
    case "SET_PHASE":
      return { ...state, bulkReviewPhase: action.phase };

    case "GENERATE_BULK":
      return {
        ...state,
        isGenerating: false,
        bulkItems: action.items,
        currentCardIndex: 0,
        bulkReviewPhase: "cards",
        groupingsModified: false,
        modifiedGroupIndices: new Set<number>(),
      };

    case "INIT_BULK_MANUAL": {
      if (!state.segmentation) return state;
      const items: BulkItemDetails[] = state.segmentation.groupings.map((group, i) => ({
        brand: state.brandHints[i] ?? "",
        name: state.names[i] ?? "",
        description: "",
        price: "",
        condition: "Good",
        location: "",
        tags: [],
        imageIndices: group,
      }));
      return {
        ...state,
        isGenerating: false,
        bulkItems: items,
        currentCardIndex: 0,
        bulkReviewPhase: "cards",
        groupingsModified: false,
        modifiedGroupIndices: new Set<number>(),
      };
    }

    case "REGENERATE_BULK_ITEM": {
      const updated = [...state.bulkItems];
      if (updated[action.index]) updated[action.index] = action.item;
      return { ...state, isGenerating: false, bulkItems: updated };
    }

    case "SET_BULK_ITEMS":
      return { ...state, bulkItems: action.items };

    case "UPDATE_BULK_ITEM_FIELD": {
      const updated = [...state.bulkItems];
      updated[action.index] = { ...updated[action.index], [action.field]: action.value };
      return { ...state, bulkItems: updated };
    }

    case "UPDATE_BULK_ITEM": {
      const updated = [...state.bulkItems];
      updated[action.index] = { ...updated[action.index], ...action.patch };
      return { ...state, bulkItems: updated };
    }

    case "DELETE_BULK_ITEM": {
      const updated = state.bulkItems.filter((_, i) => i !== action.index);
      if (updated.length === 0) {
        return { ...state, bulkItems: updated, bulkReviewPhase: null, currentCardIndex: 0 };
      }
      const nextIndex =
        state.currentCardIndex >= updated.length ? updated.length - 1 : state.currentCardIndex;
      return { ...state, bulkItems: updated, currentCardIndex: nextIndex };
    }

    case "SET_CURRENT_CARD_INDEX":
      return { ...state, currentCardIndex: action.index };

    case "CARDS_REASSIGN_IMAGE": {
      if (action.sourceGroup === action.targetGroup) {
        return { ...state, dragImageState: null, dragOverGroup: null };
      }
      const isLastInSource = state.bulkItems[action.sourceGroup].imageIndices.length <= 1;
      const updated = state.bulkItems.map((item, idx) => {
        if (idx === action.sourceGroup) {
          return { ...item, imageIndices: item.imageIndices.filter((i) => i !== action.imageIndex) };
        }
        if (idx === action.targetGroup) {
          return { ...item, imageIndices: [...item.imageIndices, action.imageIndex] };
        }
        return item;
      });
      const nextBulk = isLastInSource
        ? updated.filter((_, idx) => idx !== action.sourceGroup)
        : updated;
      let nextCardIndex = state.currentCardIndex;
      if (isLastInSource && action.sourceGroup <= state.currentCardIndex) {
        nextCardIndex = Math.max(0, state.currentCardIndex - 1);
      }
      const prevModified = state.modifiedGroupIndices;
      let nextModified: Set<number>;
      if (isLastInSource) {
        nextModified = new Set<number>();
        for (const idx of prevModified) {
          if (idx === action.sourceGroup) continue;
          nextModified.add(idx > action.sourceGroup ? idx - 1 : idx);
        }
        const adjustedTarget =
          action.targetGroup > action.sourceGroup ? action.targetGroup - 1 : action.targetGroup;
        nextModified.add(adjustedTarget);
        if (action.sourceGroup > 0) {
          nextModified.add(Math.min(action.sourceGroup - 1, adjustedTarget));
        } else {
          nextModified.add(0);
        }
      } else {
        nextModified = new Set(prevModified);
        nextModified.add(action.sourceGroup);
        nextModified.add(action.targetGroup);
      }
      return {
        ...state,
        bulkItems: nextBulk,
        currentCardIndex: nextCardIndex,
        groupingsModified: true,
        modifiedGroupIndices: nextModified,
        dragImageState: null,
        dragOverGroup: null,
      };
    }

    case "CARDS_SPLIT_IMAGE": {
      if (state.bulkItems[action.sourceGroup].imageIndices.length <= 1) {
        return { ...state, dragImageState: null, dragOverGroup: null, dragOverGap: null };
      }
      const updated = state.bulkItems.map((item, idx) => {
        if (idx === action.sourceGroup) {
          return { ...item, imageIndices: item.imageIndices.filter((i) => i !== action.imageIndex) };
        }
        return item;
      });
      const newItem: BulkItemDetails = {
        brand: "",
        name: "",
        description: "",
        price: "",
        condition: "Good",
        location: "",
        tags: [],
        imageIndices: [action.imageIndex],
      };
      updated.splice(action.gapIndex, 0, newItem);
      let nextCardIndex = state.currentCardIndex;
      if (action.gapIndex <= state.currentCardIndex) {
        nextCardIndex = state.currentCardIndex + 1;
      }
      const prevModified = state.modifiedGroupIndices;
      const adjustedSource =
        action.gapIndex <= action.sourceGroup ? action.sourceGroup + 1 : action.sourceGroup;
      const nextModified = new Set<number>();
      for (const idx of prevModified) {
        nextModified.add(action.gapIndex <= idx ? idx + 1 : idx);
      }
      nextModified.add(adjustedSource);
      nextModified.add(action.gapIndex);
      return {
        ...state,
        bulkItems: updated,
        currentCardIndex: nextCardIndex,
        groupingsModified: true,
        modifiedGroupIndices: nextModified,
        dragImageState: null,
        dragOverGroup: null,
        dragOverGap: null,
      };
    }

    case "REORDER_BULK_ITEM_PHOTOS": {
      const item = state.bulkItems[action.index];
      if (!item) return state;
      const updated = [...state.bulkItems];
      updated[action.index] = {
        ...item,
        imageIndices: arrayMove(item.imageIndices, action.from, action.to),
      };
      return { ...state, bulkItems: updated };
    }
  }
}
