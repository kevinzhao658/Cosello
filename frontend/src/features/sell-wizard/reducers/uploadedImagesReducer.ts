/**
 * Uploaded-images sub-reducer.
 *
 * Handles actions that primarily mutate `uploadedImages`. Actions that also
 * touch sibling domains (segmentation, bulkItems) are left in the root reducer
 * to keep slice boundaries honest.
 *
 * Covered actions:
 *   APPEND_IMAGES  — push new UploadedImage entries onto the array
 *   SET_IMAGES     — replace the whole array (used during re-segmentation)
 */

import type { SellWizardState, SellWizardAction } from "../useSellWizard";

export type UploadedImagesAction =
  | Extract<SellWizardAction, { type: "APPEND_IMAGES" }>
  | Extract<SellWizardAction, { type: "SET_IMAGES" }>;

/**
 * Returns the updated `uploadedImages` array for covered actions, or the
 * unchanged current array when the action is not in scope.
 *
 * Takes only the slice it owns so callers can spread into the full state:
 *   `return { ...state, uploadedImages: uploadedImagesReducer(state.uploadedImages, action) }`
 */
export function uploadedImagesReducer(
  images: SellWizardState["uploadedImages"],
  action: UploadedImagesAction,
): SellWizardState["uploadedImages"] {
  switch (action.type) {
    case "APPEND_IMAGES":
      return [...images, ...action.images];
    case "SET_IMAGES":
      return action.images;
  }
}
