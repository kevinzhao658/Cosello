import type { ProductDetails } from "./useSellWizard";

export interface WizardStep {
  current: number;
  total: number;
  /** One-word label per step (length === total), rendered above each bubble. */
  labels: string[];
}

const BULK_LABELS = ["Photos", "Items", "Reason", "Review", "Pickup"];
const SINGLE_LABELS = ["Photos", "Review", "Pickup"];

/**
 * Map the wizard's current phase state to a step indicator, or null when no bar
 * should show. Bulk AI flow = of 5; single AI flow = of 3; manual = no bar.
 *
 * Single vs bulk isn't known until the AI produces productDetails (single) or
 * bulkReviewPhase (bulk). Before that (the upload step) we default to bulk's
 * "1 of 5"; in the single case it resolves to "of 3" once productDetails exists.
 */
export function computeWizardStep(args: {
  mode: "ai" | "manual";
  productDetails: ProductDetails | null;
  singlePostPhase: "review" | "pickup";
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
}): WizardStep | null {
  const { mode, productDetails, singlePostPhase, bulkReviewPhase } = args;
  // Manual mode is a single-page form — no stepped progress.
  if (mode === "manual") return null;
  // Single-listing AI flow (3 consecutive steps): Photos → Review → Pickup.
  if (productDetails) {
    return {
      current: singlePostPhase === "pickup" ? 3 : 2,
      total: 3,
      labels: SINGLE_LABELS,
    };
  }
  // Bulk AI flow (5 steps).
  const bulkCurrent =
    bulkReviewPhase === "review"
      ? 2
      : bulkReviewPhase === "reason"
        ? 3
        : bulkReviewPhase === "cards"
          ? 4
          : bulkReviewPhase === "pickup"
            ? 5
            : 1; // Upload step / flow not yet determined.
  return { current: bulkCurrent, total: 5, labels: BULK_LABELS };
}
