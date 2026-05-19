import { buildSlotTarget, formatCountdown, parseClockPeriod, parseSlotEndHour } from "./pickupTime";

interface PickupCountdownOrder {
  status: string;
  selected_pickup_slots: { date: string; time: string }[];
  confirmed_time?: string;
}

// Pickup-countdown derivation for a confirmed order. Returns expired + a
// human-readable label + the raw diff so callers can drive both UI text and
// gating logic.
export function getPickupCountdown(order: PickupCountdownOrder): { expired: boolean; label: string; diff: number } {
  if (order.status !== "confirmed" || order.selected_pickup_slots.length === 0) {
    return { expired: false, label: "", diff: Infinity };
  }
  const slot = order.selected_pickup_slots[0];
  let targetHour = 18;
  let targetMin = 0;
  if (order.confirmed_time) {
    const clock = parseClockPeriod(order.confirmed_time);
    if (clock) {
      targetHour = clock.hour;
      targetMin = clock.minute;
    }
  } else {
    const endHour = parseSlotEndHour(slot.time);
    if (endHour !== null) targetHour = endHour;
    const legacyEnd: Record<string, number> = { morning: 12, afternoon: 17, evening: 21 };
    if (legacyEnd[slot.time]) targetHour = legacyEnd[slot.time];
  }
  const target = buildSlotTarget(slot.date, targetHour, targetMin);
  const diff = target.getTime() - Date.now();
  if (diff <= 0) return { expired: true, label: "Ready", diff };
  return { expired: false, label: formatCountdown(diff).label, diff };
}

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
