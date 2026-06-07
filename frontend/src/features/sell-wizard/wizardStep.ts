import type { ProductDetails } from "./useSellWizard";

export interface WizardStep {
  current: number;
  total: number;
}

/**
 * Map the wizard's current phase state to a step indicator, or null when no bar
 * should show. Bulk AI flow = of 5; single AI flow = of 4; manual = no bar.
 *
 * Single vs bulk isn't known until the AI produces productDetails (single) or
 * bulkReviewPhase (bulk). Before that (the upload step) we default to "1 of 5".
 * In the single case the denominator resolves to 4 once productDetails exists.
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
  // Single-listing AI flow (total 4): review = 3, pickup = 4 (matches the prior
  // "Step 4 of 4" label; step 2 is the generate/transition).
  if (productDetails) {
    return { current: singlePostPhase === "pickup" ? 4 : 3, total: 4 };
  }
  // Bulk AI flow (total 5).
  switch (bulkReviewPhase) {
    case "review":
      return { current: 2, total: 5 };
    case "reason":
      return { current: 3, total: 5 };
    case "cards":
      return { current: 4, total: 5 };
    case "pickup":
      return { current: 5, total: 5 };
    default:
      // Upload step / flow not yet determined.
      return { current: 1, total: 5 };
  }
}
