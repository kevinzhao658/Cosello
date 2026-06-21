import { useState, useEffect, type ComponentType } from "react";
import { Check, Loader2, ChevronDown, CalendarCheck, Coins, MessageSquare, Pencil } from "lucide-react";
import { ListingImage } from "../../../components/ui/ListingImage";
import { ListingRowSkeleton } from "../../../components/ListingRowSkeleton";
import { PunchlistRowSkeleton } from "../../../components/PunchlistRowSkeleton";
import { formatTitle } from "../../../lib/format";
import { PLACEHOLDER_COMMUNITY } from "../../../lib/listings";
import { getBuyerOrderViewState, getSellerListingCtaState } from "../../../lib/orderStatus";
import { FOCUS_RING, SEG_BTN_BASE, PANEL_TITLE } from "../constants";
import type { Listing, MyListing, OrderData } from "../../../lib/types";

// ── Types shared between sub-panels ──────────────────────────

interface PunchlistPickup {
  order_id: number;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  slot: string | null;
  role: "seller" | "buyer";
  pickup_expired: boolean;
  countdown_label: string;
}

interface PunchlistResponse {
  pickups_to_confirm: PunchlistPickup[];
  offers_to_review: MyListing[];
  unread_messages: unknown[];
  draft_listings: MyListing[];
}

// ── Priority helper (used by OverviewListingsPanel) ───────────

function getSellingRowPriority(
  listing: MyListing,
  mySellerOrders: OrderData[],
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string },
  getPickupCountdownFn: (o: OrderData) => { expired: boolean; label: string; diff: number },
): number {
  const timeInfo = getListingTimeInfo(listing.postedAt);
  const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
  const sellerCountdown = sellerOrder ? getPickupCountdownFn(sellerOrder) : null;
  const sellerReviewed = sellerOrder?.seller_reviewed ?? false;
  const buyerReviewed = sellerOrder?.buyer_reviewed ?? false;
  const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;

  if (sellerOrder?.status === "completed") return 5;
  if (timeInfo.expired) return 5;
  if (sellerOrder?.status === "confirmed" && sellerCountdown?.expired && !sellerReviewed) return 0;
  if (sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired) return 1;
  if (hasPendingOrders) return 2;
  if (sellerOrder?.status === "confirmed" && sellerCountdown?.expired && sellerReviewed && !buyerReviewed) return 3;
  return 4;
}

// ── OverviewListingsPanel ─────────────────────────────────────

interface OverviewListingsPanelProps {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  openEditListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  onNavigate: (page: string) => void;
}

function OverviewListingsPanel({
  listingsTab,
  setListingsTab,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingMyListings,
  isLoadingMyOrders,
  openEditListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  openListingDetail,
  getListingTimeInfo,
  getPickupCountdown: getPickupCountdownFn,
  onNavigate,
}: OverviewListingsPanelProps) {
  const sellingRows = [...myListings].sort((a, b) => {
    const pa = getSellingRowPriority(a, mySellerOrders, getListingTimeInfo, getPickupCountdownFn);
    const pb = getSellingRowPriority(b, mySellerOrders, getListingTimeInfo, getPickupCountdownFn);
    if (pa !== pb) return pa - pb;
    const aTime = a.latestOrderAt || "";
    const bTime = b.latestOrderAt || "";
    if (aTime !== bTime) return bTime > aTime ? 1 : -1;
    return 0;
  });

  return (
    <div className="bg-canvas border border-hairline rounded-md p-6 h-[560px] overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className={`text-base ${PANEL_TITLE}`}>Your listings</h3>
        <div role="tablist" aria-label="Selling or buying" className="inline-flex items-center gap-1 bg-surface-soft p-1 rounded-md">
          {(["selling", "buying"] as const).map((side) => {
            const active = listingsTab === side;
            return (
              <button
                key={side}
                role="tab"
                aria-selected={active}
                onClick={() => setListingsTab(side)}
                className={`${SEG_BTN_BASE} ${active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink"}`}
              >
                {side === "selling" ? "Selling" : "Buying"}
              </button>
            );
          })}
        </div>
      </div>

      {listingsTab === "selling" ? (
        isLoadingMyListings && myListings.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
          </div>
        ) : myListings.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm text-muted mb-4">No listings yet</p>
            <button
              onClick={() => onNavigate("newlisting")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Create listing
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* 3-col grid: Item (with community subtitle) / Price / Status.
                Each value gets its own cell — no flex wrapper. Min-widths on
                Price and Status lock the Status column's left edge at the same
                x-position across all rows regardless of pill content length.
                Identical to the Buying table below so the two read as one
                visual system. */}
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            <div>
              {sellingRows.map((listing) => {
                const timeInfo = getListingTimeInfo(listing.postedAt);
                const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
                const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
                const sellerCountdown = sellerOrder ? getPickupCountdownFn(sellerOrder) : null;
                const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
                const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
                const isSellerPickupReady = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed;
                const isSellerWaitingForBuyer = sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed;
                const isCompleted = sellerOrder?.status === "completed";
                const cta = getSellerListingCtaState({
                  timeExpired: timeInfo.expired,
                  isSellerWaitingForBuyer: !!isSellerWaitingForBuyer,
                  isSellerPickupReady: !!isSellerPickupReady,
                  sellerOrderStatus: sellerOrder?.status ?? null,
                  hasPendingOrders,
                });

                // Confirmed-and-still-ticking state renders the countdown label
                // as text ("Pickup in Xh Ym"). Other states keep their existing labels.
                const isConfirmedTicking = sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired;

                const statusLabel = listing.status === "draft"
                  ? "Draft"
                  : listing.status === "sold"
                    ? "Sold"
                    : isCompleted
                      ? "Completed"
                      : isSellerPickupReady
                        ? "Pickup ready"
                        : isSellerWaitingForBuyer
                          ? "Awaiting buyer"
                          : isConfirmedTicking
                            ? `Pickup in ${sellerCountdown.label}`
                            : hasPendingOrders
                              ? `${listing.pendingOrderCount} offers`
                              : timeInfo.expired
                                ? "Expired"
                                : "Live";

                // Terminal states (expired / completed / sold) open the
                // product details modal. Awaiting-buyer falls through to the
                // confirmed-order summary via the existing `sellerOrder`
                // branch. Every row is clickable now.
                const isTerminal = timeInfo.expired || isCompleted || listing.status === "sold";

                return (
                  <button
                    key={listing.id}
                    onClick={() => {
                      if (isTerminal) {
                        openListingDetail?.(listing as Listing);
                        return;
                      }
                      if (isSellerPickupReady && sellerOrder) openRatingModal(sellerOrder);
                      else if (hasPendingOrders) openOrderModal(listing);
                      else if (sellerOrder) openConfirmedOrderSummary(listing.id);
                      else openEditListing(listing);
                    }}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors cursor-pointer hover:bg-surface-soft ${FOCUS_RING}`}
                  >
                    {/* Item cell — thumb + community subtitle (muted) above title. */}
                    <div className="flex items-center gap-3 min-w-0">
                      <ListingImage src={listing.imageUrl} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
                        <p className="text-sm font-semibold text-ink truncate">{formatTitle(listing.brand, listing.name)}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-ink tabular-nums">${listing.price}</span>
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                        ? "bg-surface-strong text-muted"
                        : statusLabel === "Awaiting buyer"
                          ? "bg-warning-soft text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      ) : (
        isLoadingMyOrders && myPurchases.length === 0 ? (
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            {Array.from({ length: 4 }).map((_, i) => <ListingRowSkeleton key={i} />)}
          </div>
        ) : myPurchases.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm text-muted mb-4">No purchases yet</p>
            <button
              onClick={() => onNavigate("market")}
              className={`inline-flex items-center justify-center h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
            >
              Browse market
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* 3-col grid: Item (with community subtitle) / Price / Status —
                identical template to the Selling table above. */}
            <div className="grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 gap-y-0 text-[11px] text-muted pb-2 border-b border-hairline">
              <span>Item</span>
              <span>Price</span>
              <span>Status</span>
            </div>
            <div>
              {myPurchases.map((order) => {
                const countdown = getPickupCountdownFn(order);
                const viewState = getBuyerOrderViewState({
                  status: order.status,
                  countdownExpired: countdown.expired,
                  hasReviewed: order.buyer_reviewed,
                  otherReviewed: order.seller_reviewed,
                });
                const isConfirmedTicking = viewState === "confirmedCountdown";
                const statusLabel = viewState === "declined" ? "Declined"
                  : viewState === "withdrawn" ? "Withdrawn"
                  : viewState === "expired" ? "Expired"
                  : viewState === "cancelledBySeller" ? "Cancelled by seller"
                  : viewState === "waitingForOther" ? "Awaiting seller"
                  : viewState === "pickupReady" ? "Pickup ready"
                  : isConfirmedTicking ? `Pickup in ${countdown.label}`
                  : order.status === "completed" ? "Completed"
                  : "Pending";
                const isClickable = !(viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || viewState === "cancelledBySeller" || viewState === "waitingForOther");
                return (
                  <button
                    key={order.id}
                    onClick={() => {
                      if (!isClickable) return;
                      if (viewState === "pickupReady") openRatingModal(order);
                      else if (order.status === "confirmed") openConfirmedOrderSummary(order.listing_id);
                    }}
                    disabled={!isClickable}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_max-content_minmax(108px,max-content)] gap-x-3 items-center py-3 border-b border-hairline-soft text-left transition-colors ${FOCUS_RING} ${isClickable ? "hover:bg-surface-soft cursor-pointer" : "cursor-default"}`}
                  >
                    {/* Item cell — thumb + community subtitle above title.
                        Seller @handle no longer rendered in the table; still
                        available via the order summary modal. */}
                    <div className="flex items-center gap-3 min-w-0">
                      <ListingImage src={order.listing_image} alt="" size="small" className="size-10 rounded-md object-cover border border-hairline shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted truncate">{PLACEHOLDER_COMMUNITY.name}</p>
                        <p className="text-sm font-semibold text-ink truncate">{order.listing_title}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-primary tabular-nums">${order.listing_price}</span>
                    <span className={`justify-self-start text-[10px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-full whitespace-nowrap ${
                      viewState === "declined" || viewState === "withdrawn" || viewState === "expired" || order.status === "completed"
                        ? "bg-surface-strong text-muted"
                        : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                          ? "bg-warning-soft text-warning"
                          : "bg-primary-soft text-primary"
                    }`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── PunchlistPanel ────────────────────────────────────────────

interface PunchlistPanelProps {
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
  openOrderModal: (l: MyListing) => void;
  openEditListing: (l: MyListing) => void;
  openRatingModal: (o: OrderData) => void;
  openConfirmedOrderSummary: (listingId: string) => void;
  mySellerOrders: OrderData[];
  myPurchases: OrderData[];
}

function PunchlistPanel({
  punchlist,
  punchlistLoaded,
  openOrderModal,
  openEditListing,
  openRatingModal,
  openConfirmedOrderSummary,
  mySellerOrders,
  myPurchases,
}: PunchlistPanelProps) {
  // Each cat entry uses a typed discriminated union so the render loop can
  // dispatch without `any`. Pickups carry PunchlistPickup items; offers and
  // drafts carry MyListing items; messages carry unknown[].
  type PickupCat = {
    id: "pickups";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: PunchlistPickup[];
    cta: string;
    onAction: (item: PunchlistPickup) => void;
  };
  type ListingCat = {
    id: "offers" | "drafts";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: MyListing[];
    cta: string;
    onAction: (item: MyListing) => void;
  };
  type MessageCat = {
    id: "messages";
    label: string;
    icon: ComponentType<{ className?: string }>;
    items: unknown[];
    cta: string;
    onAction: () => void;
  };
  type PunchCat = PickupCat | ListingCat | MessageCat;

  const cats: PunchCat[] = [
    {
      id: "pickups",
      label: "Confirm pickups",
      icon: CalendarCheck,
      items: punchlist?.pickups_to_confirm ?? [],
      cta: "Confirm slot",
      onAction: (item: PunchlistPickup) => {
        // Disabled until slot passes — both roles.
        if (!item.pickup_expired) return;

        if (item.role === "seller") {
          const order = mySellerOrders.find((o) => o.id === item.order_id);
          if (order) openRatingModal(order);
          return;
        }
        // Buyer side
        const order = myPurchases.find((o) => o.id === item.order_id);
        if (order) openRatingModal(order);
      },
    },
    {
      id: "offers",
      label: "Review offers",
      icon: Coins,
      items: punchlist?.offers_to_review ?? [],
      cta: "Review offer",
      onAction: (item: MyListing) => openOrderModal(item),
    },
    {
      id: "messages",
      label: "Respond to messages",
      icon: MessageSquare,
      items: punchlist?.unread_messages ?? [],
      cta: "Open thread",
      onAction: () => {},
    },
    {
      id: "drafts",
      label: "Finish drafts",
      icon: Pencil,
      items: punchlist?.draft_listings ?? [],
      cta: "Resume draft",
      onAction: (item: MyListing) => openEditListing(item),
    },
  ];

  const totalTodo = cats.reduce((n, c) => n + c.items.length, 0);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const top = cats.reduce<PunchCat | null>((acc, c) => (c.items.length > (acc?.items.length || 0) ? c : acc), null);
    return top && top.items.length > 0 ? { [top.id]: true } : {};
  });
  useEffect(() => {
    setOpen((cur) => {
      if (Object.values(cur).some(Boolean)) return cur;
      const top = cats.reduce<PunchCat | null>((acc, c) => (c.items.length > (acc?.items.length || 0) ? c : acc), null);
      return top && top.items.length > 0 ? { [top.id]: true } : cur;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchlist]);

  const handleRowClick = (cat: { id: string }, item: unknown) => {
    if (cat.id === "pickups") {
      const pickup = item as PunchlistPickup;
      openConfirmedOrderSummary(pickup.listing_id);
      return;
    }
    if (cat.id === "offers") {
      openOrderModal(item as MyListing);
      return;
    }
    if (cat.id === "drafts") {
      openEditListing(item as MyListing);
      return;
    }
    // messages — no-op
  };

  return (
    <div className="bg-canvas border border-hairline rounded-md p-6 h-[560px] overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <h3 className={`text-base ${PANEL_TITLE}`}>Punchlist</h3>
        <span className="text-xs text-muted">{totalTodo} to do today</span>
      </div>
      <ul className="space-y-2 flex-1">
        {!punchlistLoaded
          ? Array.from({ length: 4 }).map((_, i) => <PunchlistRowSkeleton key={i} />)
          : cats.map((cat) => {
          const empty = cat.items.length === 0;
          const isOpen = !!open[cat.id] && !empty;
          const Icon = cat.icon;
          return (
            <li key={cat.id} className={`rounded-md border ${empty ? "border-hairline-soft" : "border-hairline"}`}>
              <button
                onClick={() => !empty && setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
                aria-expanded={isOpen}
                disabled={empty}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left ${FOCUS_RING} rounded-md ${empty ? "cursor-default" : "hover:bg-surface-soft"}`}
              >
                <span className={`size-7 rounded-md flex items-center justify-center ${empty ? "bg-surface-soft text-muted-soft" : "bg-primary-soft text-primary"}`}>
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className={`flex-1 text-sm font-semibold ${empty ? "text-muted-soft" : "text-ink"}`}>{cat.label}</span>
                {empty ? (
                  <span className="text-[11px] text-muted-soft inline-flex items-center gap-1">
                    <Check className="size-3" aria-hidden="true" />
                    All clear
                  </span>
                ) : (
                  <>
                    <span className="text-[11px] font-semibold bg-primary text-on-primary px-2 py-0.5 rounded-full">{cat.items.length}</span>
                    <ChevronDown className={`size-4 text-muted transition-transform motion-safe:duration-150 ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                  </>
                )}
              </button>
              {isOpen && (
                <ul className="px-3 pb-3 space-y-2">
                  {cat.items.map((it, i) => {
                    const isPickup = cat.id === "pickups";
                    const pickup = isPickup ? (it as PunchlistPickup) : null;
                    const listing = (cat.id === "offers" || cat.id === "drafts") ? (it as MyListing) : null;
                    const itemTitle = pickup?.listing_title
                      ?? (listing ? formatTitle(listing.brand, listing.name) : "Item");
                    const itemImage = pickup?.listing_image ?? listing?.imageUrl ?? null;
                    return (
                      <li key={i} className="flex items-center gap-3 p-2 rounded-md bg-surface-soft border border-hairline-soft">
                        <button
                          type="button"
                          onClick={() => handleRowClick(cat, it)}
                          className="flex-1 flex items-center gap-3 text-left cursor-pointer hover:bg-surface-soft transition-colors rounded-md px-2 -mx-2 py-1 -my-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {itemImage && (
                            <ListingImage src={itemImage} alt="" size="small" className="size-9 rounded-md object-cover border border-hairline shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-ink leading-snug line-clamp-2">
                              {itemTitle}
                            </p>
                            {pickup?.slot && <p className="text-[11px] text-muted truncate">{pickup.slot}</p>}
                          </div>
                        </button>
                        {cat.id === "pickups" && pickup ? (
                          !pickup.pickup_expired ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center justify-center h-7 px-3 rounded-md bg-surface-strong text-muted text-[11px] font-semibold cursor-not-allowed"
                            >
                              Pickup in {pickup.countdown_label}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); cat.onAction(pickup); }}
                              className={`inline-flex items-center justify-center h-7 px-3 rounded-md bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Confirm pickup
                            </button>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (cat.id === "offers" && listing) cat.onAction(listing);
                              else if (cat.id === "drafts" && listing) cat.onAction(listing);
                            }}
                            className={`inline-flex items-center justify-center h-7 px-3 rounded-full bg-primary text-on-primary text-[11px] font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                          >
                            {cat.cta}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── OverviewTabContent (exported) ─────────────────────────────

export interface OverviewTabContentProps {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  openEditListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  onNavigate: (page: string) => void;
  punchlist: PunchlistResponse | null;
  punchlistLoaded: boolean;
}

export function OverviewTabContent({
  listingsTab,
  setListingsTab,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingMyListings,
  isLoadingMyOrders,
  openEditListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  openListingDetail,
  getListingTimeInfo,
  getPickupCountdown,
  onNavigate,
  punchlist,
  punchlistLoaded,
}: OverviewTabContentProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
      <OverviewListingsPanel
        listingsTab={listingsTab}
        setListingsTab={setListingsTab}
        myListings={myListings}
        myPurchases={myPurchases}
        mySellerOrders={mySellerOrders}
        isLoadingMyListings={isLoadingMyListings}
        isLoadingMyOrders={isLoadingMyOrders}
        openEditListing={openEditListing}
        openOrderModal={openOrderModal}
        openConfirmedOrderSummary={openConfirmedOrderSummary}
        openRatingModal={openRatingModal}
        openListingDetail={openListingDetail}
        getListingTimeInfo={getListingTimeInfo}
        getPickupCountdown={getPickupCountdown}
        onNavigate={onNavigate}
      />
      <PunchlistPanel
        punchlist={punchlist}
        punchlistLoaded={punchlistLoaded}
        openOrderModal={openOrderModal}
        openEditListing={openEditListing}
        openRatingModal={openRatingModal}
        openConfirmedOrderSummary={openConfirmedOrderSummary}
        mySellerOrders={mySellerOrders}
        myPurchases={myPurchases}
      />
    </div>
  );
}
