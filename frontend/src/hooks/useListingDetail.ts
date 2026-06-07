/**
 * useListingDetail — listing-detail interaction cluster
 *
 * Owns all state, handlers, and effects for the listing detail modal, buyer
 * order status, buy modal, edit-listing modal, and user profile overlay that
 * were previously inline in App.tsx.
 *
 * Verbatim lift from App.tsx (decomposition wall #5). Zero behavior changes.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../lib/api";
import { formatTitle } from "../lib/format";
import { logView, type ViewSource } from "../lib/events";
import type { AuthUser } from "../contexts/AuthContext";
import type { Listing, ListingUpdatePatch } from "../lib/types";
import type { SellerProfile } from "../features/listings/ListingDetailModal";
import type { EditingOrderSeed } from "../features/orders/BuyModal";

type Page = "home" | "market" | "terms" | "signin" | "signup" | "account" | "help" | "mission" | "newlisting";

type HistoryItem = {
  id: string;
  title: string;
  imageUrl: string;
  price: string;
  type: "viewed" | "purchased" | "listed" | "sold";
};

interface UseListingDetailDeps {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  page: Page;
  addToHistory: (item: HistoryItem) => void;
  refetchListings: () => void;
  registerViewUserHandler: (fn: ((userId: string) => void) | null) => void;
}

export interface UseListingDetailReturn {
  // values
  listing: Listing | null;
  detailOpen: boolean;
  sellerProfile: SellerProfile | null;
  isLoadingSeller: boolean;
  buyerOrderStatus: { status: string | null; order_id?: number } | null;
  buyOpen: boolean;
  buyEditingOrder: EditingOrderSeed | null;
  editOpen: boolean;
  viewingUserId: string | null;

  // composed handlers
  openListingDetail: (listing: Listing, source?: ViewSource) => Promise<void>;
  openUserDashboard: (userId: string) => void;
  saveListingEdit: (patch: ListingUpdatePatch) => Promise<void>;
  onBuyConfirmed: (orderId: number, listing: Listing) => void;
  onBuyUpdated: () => void;
  editPickupSlots: () => Promise<void>;

  // modal primitives
  closeDetail: () => void;
  /** Only closes the flag — does NOT clear listing data. Used by onSignInPrompt. */
  dismissDetail: () => void;
  openEdit: () => void;
  closeEdit: () => void;
  openBuy: () => void;
  closeBuy: () => void;
  /** Closes buy modal flag only — does NOT null buyEditingOrder. Used by onNavigateToTerms. */
  dismissBuy: () => void;
  closeUserDashboard: () => void;
  setViewingUserId: (id: string | null) => void;
}

export function useListingDetail(deps: UseListingDetailDeps): UseListingDetailReturn {
  const { token, user, page, addToHistory, refetchListings, registerViewUserHandler } = deps;

  // ── User profile overlay ──────────────────────────────────────────────────
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // ── Listing detail modal ──────────────────────────────────────────────────
  const [showListingDetailModal, setShowListingDetailModal] = useState(false);
  const [listingDetailData, setListingDetailData] = useState<Listing | null>(null);
  const [listingDetailSellerProfile, setListingDetailSellerProfile] = useState<SellerProfile | null>(null);
  const [isLoadingListingDetail, setIsLoadingListingDetail] = useState(false);

  // ── Buy / edit modal ──────────────────────────────────────────────────────
  const [buyerOrderStatus, setBuyerOrderStatus] = useState<{ status: string | null; order_id?: number } | null>(null);
  // NOTE: myOrderStatuses is write-only — it is set here but never read
  // anywhere in the application. It has been preserved verbatim to avoid
  // any behavior change. Follow-up: remove as dead state in a future PR.
  const [myOrderStatuses, setMyOrderStatuses] = useState<Record<string, { status: string; orderId: number }>>({});
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyEditingOrder, setBuyEditingOrder] = useState<EditingOrderSeed | null>(null);
  const [showEditListingModal, setShowEditListingModal] = useState(false);

  // ── View source ref ───────────────────────────────────────────────────────
  const listingViewSourceRef = useRef<ViewSource>("direct");

  // ── Register openUserDashboard with OrderModalsProvider ───────────────────
  const openUserDashboard = useCallback((userId: string) => {
    if (!token || userId === user?.id) return;
    setViewingUserId(userId);
  }, [token, user?.id]);

  useEffect(() => {
    registerViewUserHandler(openUserDashboard);
    return () => registerViewUserHandler(null);
  }, [registerViewUserHandler, openUserDashboard]);

  // ── Dwell-time logView ────────────────────────────────────────────────────
  useEffect(() => {
    if (!showListingDetailModal || !listingDetailData) return;
    const listingId = listingDetailData.id;
    const source = listingViewSourceRef.current;
    const startTs = performance.now();
    let fired = false;

    const flush = () => {
      if (fired) return;
      fired = true;
      logView({
        listing_id: listingId,
        source,
        dwell_ms: Math.max(0, Math.round(performance.now() - startTs)),
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [showListingDetailModal, listingDetailData?.id, page]);

  // ── fetchMyOrderStatuses on token ─────────────────────────────────────────
  const fetchMyOrderStatuses = async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/api/orders");
      if (res.ok) {
        const orders: { id: number; listing_id: string; status: string; role: string; selected_pickup_slots: { date: string; time: string }[] }[] = await res.json();
        const statuses: Record<string, { status: string; orderId: number }> = {};
        for (const o of orders) {
          if (o.role === "buyer") statuses[o.listing_id] = { status: o.status, orderId: o.id };
        }
        setMyOrderStatuses(statuses);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (token) fetchMyOrderStatuses();
  }, [token]);

  // ── Composed handlers ─────────────────────────────────────────────────────

  const openListingDetail = async (listing: Listing, source: ViewSource = "direct") => {
    listingViewSourceRef.current = source;
    setShowListingDetailModal(true);
    setListingDetailData(listing);
    setListingDetailSellerProfile(null);
    setBuyerOrderStatus(null);
    addToHistory({ id: listing.id, title: formatTitle(listing.brand, listing.name), imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "viewed" });
    if (token && listing.userId) {
      setIsLoadingListingDetail(true);
      try {
        const [profileRes, orderStatusRes] = await Promise.all([
          apiFetch(`/api/friends/profile/${listing.userId}`),
          listing.userId !== user?.id
            ? apiFetch(`/api/orders/status/${listing.id}`)
            : Promise.resolve(null),
        ]);
        if (profileRes.ok) setListingDetailSellerProfile(await profileRes.json());
        if (orderStatusRes && orderStatusRes.ok) setBuyerOrderStatus(await orderStatusRes.json());
      } catch { /* ignore */ }
      finally { setIsLoadingListingDetail(false); }
    }
  };

  const saveListingEdit = async (patch: ListingUpdatePatch) => {
    if (!listingDetailData || !token) return;
    const formData = new FormData();
    formData.append("data", JSON.stringify(patch));
    const res = await apiFetch(`/api/listings/${listingDetailData.id}`, {
      method: "PUT",
      body: formData,
    });
    if (res.ok) {
      setShowEditListingModal(false);
      setShowListingDetailModal(false);
      setListingDetailData(null);
      refetchListings();
    }
  };

  const openEditPickupSlots = (listing: Listing, orderId: number, existingSlots: { date: string; time: string }[]) => {
    setListingDetailData(listing);
    setBuyEditingOrder({ id: orderId, existingSlots });
    setShowBuyModal(true);
  };

  const editPickupSlots = async () => {
    if (buyerOrderStatus?.order_id && listingDetailData) {
      try {
        const res = await apiFetch(`/api/orders/status/${listingDetailData.id}`);
        if (res.ok) {
          const data = await res.json();
          openEditPickupSlots(listingDetailData, data.order_id, data.selected_pickup_slots || []);
        }
      } catch { /* ignore */ }
    }
  };

  const onBuyConfirmed = (orderId: number, listing: Listing) => {
    addToHistory({ id: listing.id, title: formatTitle(listing.brand, listing.name), imageUrl: listing.imageUrls?.[0] || listing.imageUrl, price: listing.price, type: "purchased" });
    setBuyerOrderStatus({ status: "pending", order_id: orderId });
    setMyOrderStatuses((prev) => ({ ...prev, [listing.id]: { status: "pending", orderId } }));
    setShowBuyModal(false);
    setShowListingDetailModal(false);
    setListingDetailData(null);
    setListingDetailSellerProfile(null);
    refetchListings();
  };

  const onBuyUpdated = () => {
    setShowBuyModal(false);
    setBuyEditingOrder(null);
  };

  // ── Modal primitives ──────────────────────────────────────────────────────

  const closeDetail = () => {
    setShowListingDetailModal(false);
    setListingDetailData(null);
    setListingDetailSellerProfile(null);
  };

  /** Only closes the flag — does NOT clear listing data. Used by onSignInPrompt. */
  const dismissDetail = () => {
    setShowListingDetailModal(false);
  };

  const openEdit = () => setShowEditListingModal(true);
  const closeEdit = () => setShowEditListingModal(false);

  const openBuy = () => {
    setBuyEditingOrder(null);
    setShowBuyModal(true);
  };

  const closeBuy = () => {
    setShowBuyModal(false);
    setBuyEditingOrder(null);
  };

  /** Closes buy modal flag only — does NOT null buyEditingOrder.
   *  Used by onNavigateToTerms to preserve the original setShowBuyModal(false) body. */
  const dismissBuy = () => {
    setShowBuyModal(false);
  };

  const closeUserDashboard = () => setViewingUserId(null);

  return {
    // values
    listing: listingDetailData,
    detailOpen: showListingDetailModal,
    sellerProfile: listingDetailSellerProfile,
    isLoadingSeller: isLoadingListingDetail,
    buyerOrderStatus,
    buyOpen: showBuyModal,
    buyEditingOrder,
    editOpen: showEditListingModal,
    viewingUserId,

    // composed handlers
    openListingDetail,
    openUserDashboard,
    saveListingEdit,
    onBuyConfirmed,
    onBuyUpdated,
    editPickupSlots,

    // modal primitives
    closeDetail,
    dismissDetail,
    openEdit,
    closeEdit,
    openBuy,
    closeBuy,
    dismissBuy,
    closeUserDashboard,
    setViewingUserId,
  };
}
