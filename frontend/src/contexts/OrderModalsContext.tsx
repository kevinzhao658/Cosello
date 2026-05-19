// Global modal surface for the three order-flow modals — OrderConfirmSummary,
// PickupAttestation, RatingModal — so a notification click opens the relevant
// modal IN PLACE on whatever page the user is on, instead of routing them to
// MyAccount first.
//
// Scope intentionally excludes OrderManagementModal (the seller-side
// pending-order picker). That modal is still defined inline in MyAccountPage
// and the `purchase` notification keeps its current /account-routing flow —
// see backlog.md "OrderManagementModal full lift to App" for the follow-up.
//
// Provider lives in App.tsx so the modals render once at the top level.
// MyAccountPage's internal callers (Punchlist row, Listings-tab tiles,
// pendingListingId auto-open watcher) use the same openers via the
// `useOrderModals` hook — no duplicate state.
//
// After-action callbacks: rating + attestation success mutates server-side
// state that MyAccountPage's local lists mirror (myPurchases, mySellerOrders,
// myListings, punchlist). MyAccountPage subscribes to `subscribeAfterAction`
// to refetch its data when it's mounted. App's notification handlers don't
// need to subscribe because their data is fetched on demand.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { MyListing, OrderData } from "../lib/types";
import { getPickupCountdown } from "../lib/orderStatus";
import {
  OrderConfirmSummaryModal,
  type ConfirmSummaryData,
} from "../pages/MyAccount/modals/OrderConfirmSummaryModal";
import { PickupAttestationModal } from "../pages/MyAccount/modals/PickupAttestationModal";
import { RatingModal } from "../pages/MyAccount/modals/RatingModal";

interface OrderModalsContextValue {
  // Buyer- or seller-side confirmation summary for a `confirmed`-status order
  // on the given listing. Fetches `/api/orders` to find the matching row and
  // assembles the modal payload — same shape MyAccountPage's
  // `openConfirmedOrderSummary` produces.
  openOrderConfirmSummary: (listingId: string) => Promise<void>;
  // Direct opener — caller already has the assembled ConfirmSummaryData (the
  // seller's confirm-slot flow in MyAccountPage builds this synchronously
  // from the OrderManagementModal's selection, so we skip the fetch).
  showOrderConfirmSummary: (data: ConfirmSummaryData) => void;
  // Direct opener — caller already has the order in hand.
  openRatingModal: (order: OrderData) => void;
  // Subscribe to refresh signals fired after a successful rating submit. Used
  // by MyAccountPage to refetch its own lists. Returns an unsubscribe fn.
  subscribeAfterAction: (cb: () => void) => () => void;
}

const OrderModalsContext = createContext<OrderModalsContextValue | undefined>(undefined);

export function useOrderModals(): OrderModalsContextValue {
  const ctx = useContext(OrderModalsContext);
  if (!ctx) {
    throw new Error("useOrderModals must be used within an OrderModalsProvider");
  }
  return ctx;
}

export function OrderModalsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();

  // ── OrderConfirmSummary state ──────────────────────────────
  const [showConfirmSummary, setShowConfirmSummary] = useState(false);
  const [confirmSummaryData, setConfirmSummaryData] = useState<ConfirmSummaryData | null>(null);

  // ── PickupAttestation state ────────────────────────────────
  const [showPickupAttestation, setShowPickupAttestation] = useState(false);

  // ── RatingModal state ──────────────────────────────────────
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingOrder, setRatingOrder] = useState<OrderData | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  // After-action subscribers — Set so MyAccountPage's effect can register and
  // unregister cleanly. Use a ref so the openers' identity doesn't churn when
  // subscribers change.
  const afterActionSubscribers = useRef(new Set<() => void>());
  const fireAfterAction = useCallback(() => {
    afterActionSubscribers.current.forEach((cb) => cb());
  }, []);
  const subscribeAfterAction = useCallback((cb: () => void) => {
    afterActionSubscribers.current.add(cb);
    return () => {
      afterActionSubscribers.current.delete(cb);
    };
  }, []);

  // Recompute when an open ConfirmSummary's underlying order's countdown
  // crosses the expiry boundary. The modal's CTA flips from "Done" to
  // "Confirm Pickup", so we need a periodic re-render — but only when the
  // modal is open and a confirmed-with-pickup order is on screen.
  const [, setCountdownTick] = useState(0);
  useEffect(() => {
    if (!showConfirmSummary || !confirmSummaryData) return;
    const interval = setInterval(() => setCountdownTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [showConfirmSummary, confirmSummaryData]);

  const openRatingModal = useCallback((order: OrderData) => {
    setRatingOrder(order);
    setRatingValue(0);
    setRatingHover(0);
    setRatingComment("");
    setShowRatingModal(true);
  }, []);

  const showOrderConfirmSummary = useCallback((data: ConfirmSummaryData) => {
    setConfirmSummaryData(data);
    setShowConfirmSummary(true);
  }, []);

  const openOrderConfirmSummary = useCallback(async (listingId: string) => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/orders");
      if (!res.ok) return;
      const allOrders: OrderData[] = await res.json();
      const order = allOrders.find((o) => o.listing_id === listingId && o.status === "confirmed");
      if (!order) return;
      const slot = order.selected_pickup_slots[0];
      // Synthesize the partial MyListing the modal renders. The modal only
      // reads imageUrl/brand/name/price, so a minimal shape is sufficient.
      const listing: MyListing = {
        id: order.listing_id,
        title: order.listing_title,
        description: "",
        price: order.listing_price,
        condition: "",
        location: "",
        tags: [],
        imageUrl: order.listing_image,
        postedAt: 0,
        status: "sold",
        brand: "",
        name: order.listing_title,
      };
      setConfirmSummaryData({
        listing,
        buyerName: order.role === "seller" ? order.buyer_name : order.seller_name,
        slot: slot || { date: "", time: "" },
        role: order.role as "seller" | "buyer",
        confirmedTime: order.confirmed_time,
        pickupAddress: order.address_released ? order.pickup_address : null,
        order,
      });
      setShowConfirmSummary(true);
    } catch {
      // ignore — modal stays closed on failure
    }
  }, [token]);

  const handleSubmitRating = useCallback(async () => {
    if (!token || !ratingOrder || ratingValue === 0) return;
    setIsSubmittingRating(true);
    try {
      const res = await apiFetch(`/api/orders/${ratingOrder.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: ratingValue, comment: ratingComment }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to submit review" }));
        throw new Error(err.detail || "Failed to submit review");
      }
      setShowRatingModal(false);
      setRatingOrder(null);
      fireAfterAction();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmittingRating(false);
    }
  }, [token, ratingOrder, ratingValue, ratingComment, fireAfterAction]);

  const value = useMemo<OrderModalsContextValue>(() => ({
    openOrderConfirmSummary,
    showOrderConfirmSummary,
    openRatingModal,
    subscribeAfterAction,
  }), [openOrderConfirmSummary, showOrderConfirmSummary, openRatingModal, subscribeAfterAction]);

  const confirmExpired = confirmSummaryData ? getPickupCountdown(confirmSummaryData.order).expired : false;

  return (
    <OrderModalsContext.Provider value={value}>
      {children}

      <OrderConfirmSummaryModal
        open={showConfirmSummary}
        data={confirmSummaryData}
        countdownExpired={confirmExpired}
        onClose={() => { setShowConfirmSummary(false); setConfirmSummaryData(null); }}
        onConfirmPickup={() => setShowPickupAttestation(true)}
        onDone={() => { setShowConfirmSummary(false); setConfirmSummaryData(null); }}
      />

      <PickupAttestationModal
        open={showPickupAttestation && !!confirmSummaryData}
        onClose={() => setShowPickupAttestation(false)}
        onStillWaiting={() => {
          setShowPickupAttestation(false);
          setShowConfirmSummary(false);
          setConfirmSummaryData(null);
        }}
        onConfirm={() => {
          if (!confirmSummaryData) return;
          setShowPickupAttestation(false);
          setShowConfirmSummary(false);
          openRatingModal(confirmSummaryData.order);
        }}
      />

      <RatingModal
        open={showRatingModal}
        order={ratingOrder}
        ratingValue={ratingValue}
        ratingHover={ratingHover}
        ratingComment={ratingComment}
        isSubmitting={isSubmittingRating}
        onClose={() => { setShowRatingModal(false); setRatingOrder(null); }}
        onHoverChange={setRatingHover}
        onValueChange={setRatingValue}
        onCommentChange={setRatingComment}
        onSubmit={handleSubmitRating}
      />
    </OrderModalsContext.Provider>
  );
}
