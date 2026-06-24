/**
 * MyAccountContext — shared state and handlers for the MyAccount tab area.
 *
 * Only state genuinely consumed by multiple tabs is placed here.
 * Tab-local state stays local to the tab component.
 *
 * MyAccountPage owns all state and handlers; it wraps the tab area in the
 * provider. Tab components consume via useMyAccount().
 */
import { createContext, useContext, type ReactNode } from "react";
import type { Listing, MyListing, OrderData } from "../../lib/types";

export interface MyAccountSharedState {
  // Data
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];

  // Loading gates
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  isLoadingStats: boolean;
  isLoadingSaved: boolean;

  // Listing-state handlers shared by Overview + Listings tabs
  openEditListing: (l: MyListing) => void;
  openRemoveListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  handleRelist: (id: string) => void;
  relistingId: string | null;

  // Friends/profile openers used by Overview + Settings tabs
  openEditProfileModal: () => void;
  openAddFriendsModal: () => void;
  openFriendsModal: () => void;

  // Navigation used across all tabs
  onNavigate: (page: string) => void;
  onViewUser?: (userId: string) => void;

  // Order helpers used by Overview + Listings tabs
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
}

const MyAccountContext = createContext<MyAccountSharedState | null>(null);

export function MyAccountProvider({
  value,
  children,
}: {
  value: MyAccountSharedState;
  children: ReactNode;
}) {
  return (
    <MyAccountContext.Provider value={value}>
      {children}
    </MyAccountContext.Provider>
  );
}

export function useMyAccount(): MyAccountSharedState {
  const ctx = useContext(MyAccountContext);
  if (!ctx) {
    throw new Error("useMyAccount must be used inside MyAccountProvider");
  }
  return ctx;
}
