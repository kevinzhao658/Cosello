// View states for a buyer's order row in MyAccountPage purchases list. These
// are derived from raw OrderData.status plus pickup-countdown / review state
// so the four parallel ternaries (container className, message text, badge,
// withdraw-button gate) all key off the same union.
export type BuyerOrderViewState =
  | "declined"
  | "withdrawn"
  | "expired"
  | "waitingForOther"
  | "pickupReady"
  | "confirmedCountdown"
  | "completed"
  | "pending";

type BuyerOrderInputs = {
  status: string;
  countdownExpired: boolean;
  hasReviewed: boolean;
  otherReviewed: boolean;
};

export function getBuyerOrderViewState({ status, countdownExpired, hasReviewed, otherReviewed }: BuyerOrderInputs): BuyerOrderViewState {
  if (status === "declined") return "declined";
  if (status === "withdrawn") return "withdrawn";
  if (status === "expired") return "expired";
  if (status === "confirmed" && countdownExpired && hasReviewed && !otherReviewed) return "waitingForOther";
  if (status === "confirmed" && countdownExpired && !hasReviewed) return "pickupReady";
  if (status === "confirmed" && !countdownExpired) return "confirmedCountdown";
  if (status === "completed") return "completed";
  return "pending";
}

export const BUYER_ORDER_CONTAINER_CLASS: Record<BuyerOrderViewState, string> = {
  declined:           "bg-red-500/[0.03] border-red-500/10 opacity-60",
  withdrawn:          "bg-white/[0.02] border-white/5 opacity-50",
  expired:            "bg-white/[0.02] border-white/5 opacity-50",
  waitingForOther:    "bg-amber-500/[0.05] border-amber-400/20",
  pickupReady:        "bg-green-500/[0.05] border-green-400/30 hover:bg-green-500/[0.08] cursor-pointer",
  confirmedCountdown: "bg-green-500/[0.03] border-green-400/20 hover:bg-green-500/[0.06] cursor-pointer",
  completed:          "bg-white/[0.03] border-white/5",
  pending:            "bg-white/[0.03] border-white/5",
};

type BadgeStyle = { label: string; className: string };

const BADGE_PILL = "text-[10px] px-2 py-0.5 rounded-full border";

export const BUYER_ORDER_BADGE: Record<BuyerOrderViewState, BadgeStyle> = {
  declined:           { label: "Declined",        className: `${BADGE_PILL} text-red-400 bg-red-500/10 border-red-400/20` },
  withdrawn:          { label: "Withdrawn",       className: `${BADGE_PILL} text-white/40 bg-white/5 border-white/10` },
  expired:            { label: "Expired",         className: `${BADGE_PILL} text-white/40 bg-white/5 border-white/10` },
  waitingForOther:    { label: "Awaiting Seller", className: `${BADGE_PILL} text-amber-400 bg-amber-500/10 border-amber-400/20` },
  pickupReady:        { label: "Confirm Pickup",  className: `${BADGE_PILL} text-green-400 bg-green-500/10 border-green-400/20` },
  confirmedCountdown: { label: "Confirmed",       className: `${BADGE_PILL} text-green-400 bg-green-500/10 border-green-400/20` },
  completed:          { label: "Completed",       className: `${BADGE_PILL} text-white/40 bg-white/5 border-white/10` },
  pending:            { label: "Pending",         className: `${BADGE_PILL} text-amber-400 bg-amber-500/10 border-amber-400/20` },
};

// Seller-side states for the listing-row CTA in the My Listings panel.
export type SellerListingCtaState =
  | "expired"           // not really CTA — caller renders Relist button
  | "awaitingBuyer"
  | "pickupReady"
  | "confirmed"
  | "review"
  | "default";

type SellerListingInputs = {
  timeExpired: boolean;
  isSellerWaitingForBuyer: boolean;
  isSellerPickupReady: boolean;
  sellerOrderStatus: string | null;
  hasPendingOrders: boolean;
};

export function getSellerListingCtaState({
  timeExpired, isSellerWaitingForBuyer, isSellerPickupReady, sellerOrderStatus, hasPendingOrders,
}: SellerListingInputs): SellerListingCtaState {
  if (timeExpired) return "expired";
  if (isSellerWaitingForBuyer) return "awaitingBuyer";
  if (isSellerPickupReady) return "pickupReady";
  if (sellerOrderStatus === "confirmed") return "confirmed";
  if (hasPendingOrders) return "review";
  return "default";
}

export const SELLER_LISTING_CTA_BADGE: Record<Exclude<SellerListingCtaState, "expired" | "default">, BadgeStyle> = {
  awaitingBuyer: { label: "Awaiting Buyer", className: `${BADGE_PILL} text-amber-400 bg-amber-500/10 border-amber-400/20` },
  pickupReady:   { label: "Confirm Pickup", className: `${BADGE_PILL} text-green-400 bg-green-500/10 border-green-400/20` },
  confirmed:     { label: "Confirmed",      className: `${BADGE_PILL} text-green-400 bg-green-500/10 border-green-400/20` },
  review:        { label: "Review",         className: `${BADGE_PILL} text-cyan-400 bg-cyan-500/10 border-cyan-400/20` },
};
