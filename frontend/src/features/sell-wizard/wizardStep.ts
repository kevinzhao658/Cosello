import type { ProductDetails } from "./useSellWizard";

export interface WizardStep {
  current: number;
  total: number;
  /** One-word label per step (length === total), rendered above each bubble. */
  labels: string[];
}

const STEP_LABELS = ["Photos", "Items", "Reason", "Review", "Pickup"];

/**
 * Map the wizard's current phase state to a step indicator, or null when no bar
 * should show. Both the bulk and single AI flows are 5 steps with the SAME
 * labels — they share Upload → Items → Reason, then diverge at step 4 (the bulk
 * cards vs the single listing form) and step 5 (pickup). Manual mode = no bar.
 *
 * A single-item generation sets productDetails (steps 4-5 via singlePostPhase);
 * the bulk path uses bulkReviewPhase (steps 2-5). Before either resolves (upload)
 * we show step 1 of 5.
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
  // Single-listing AI flow: review form = step 4, pickup = step 5 (of 5),
  // keeping the same 5-step bar as bulk.
  if (productDetails) {
    return {
      current: singlePostPhase === "pickup" ? 5 : 4,
      total: 5,
      labels: STEP_LABELS,
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
  return { current: bulkCurrent, total: 5, labels: STEP_LABELS };
}
