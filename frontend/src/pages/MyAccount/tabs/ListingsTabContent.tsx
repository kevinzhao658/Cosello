import { Plus, Loader2, RotateCcw, Trash2, Pencil } from "lucide-react";
import { Tooltip } from "../../../components/ui/tooltip";
import { ListingImage } from "../../../components/ui/ListingImage";
import { ListingCardSkeleton } from "../../../components/ListingCardSkeleton";
import { KpiCardSkeleton } from "../../../components/KpiCardSkeleton";
import { formatTitle } from "../../../lib/format";
import { getChipClass, PLACEHOLDER_COMMUNITY } from "../../../lib/listings";
import { getBuyerOrderViewState } from "../../../lib/orderStatus";
import { FOCUS_RING, SEG_BTN_BASE } from "../constants";
import type { Listing, MyListing, OrderData } from "../../../lib/types";

export interface ListingsTabContentProps {
  listingsTab: "selling" | "buying";
  setListingsTab: (t: "selling" | "buying") => void;
  listingsFilter: string;
  setListingsFilter: (f: string) => void;
  myListings: MyListing[];
  myPurchases: OrderData[];
  mySellerOrders: OrderData[];
  isLoadingStats: boolean;
  isLoadingMyListings: boolean;
  isLoadingMyOrders: boolean;
  sellingActiveCount: number;
  sellingDraftCount: number;
  sellingSoldCount: number;
  buyingActiveCount: number;
  buyingCompletedCount: number;
  buyingDeclinedCount: number;
  openEditListing: (l: MyListing) => void;
  openRemoveListing: (l: MyListing) => void;
  openOrderModal: (l: MyListing) => void;
  openConfirmedOrderSummary: (id: string) => void;
  openRatingModal: (o: OrderData) => void;
  openListingDetail?: (l: Listing) => void;
  handleRelist: (id: string) => void;
  relistingId: string | null;
  getListingTimeInfo: (postedAt: number) => { expired: boolean; label: string };
  getPickupCountdown: (o: OrderData) => { expired: boolean; label: string; diff: number };
  setShowWithdrawConfirm: (id: number | null) => void;
  showWithdrawConfirm: number | null;
  handleWithdrawOrder: (id: number) => void;
  withdrawingOrderId: number | null;
  onNavigate: (page: string) => void;
}

export function ListingsTabContent({
  listingsTab,
  setListingsTab,
  listingsFilter,
  setListingsFilter,
  myListings,
  myPurchases,
  mySellerOrders,
  isLoadingStats,
  isLoadingMyListings,
  isLoadingMyOrders,
  sellingActiveCount,
  sellingDraftCount,
  sellingSoldCount,
  buyingActiveCount,
  buyingCompletedCount,
  buyingDeclinedCount,
  openEditListing,
  openRemoveListing,
  openOrderModal,
  openConfirmedOrderSummary,
  openRatingModal,
  openListingDetail,
  handleRelist,
  relistingId,
  getListingTimeInfo,
  getPickupCountdown,
  setShowWithdrawConfirm,
  showWithdrawConfirm,
  handleWithdrawOrder,
  withdrawingOrderId,
  onNavigate,
}: ListingsTabContentProps) {
  const sellingKpis: { label: string; value: string; sub: string }[] = [
    { label: "Active", value: String(sellingActiveCount), sub: sellingActiveCount === 1 ? "listing" : "listings" },
    { label: "Total views", value: "—", sub: "Coming soon" },
    { label: "Saved by buyers", value: "—", sub: "Coming soon" },
    { label: "Pending offers", value: "—", sub: "Coming soon" },
  ];

  const buyingKpis: { label: string; value: string; sub: string }[] = [
    { label: "Active offers", value: "—", sub: "Coming soon" },
    { label: "Pickup soon", value: String(myPurchases.filter((o) => o.status === "confirmed").length), sub: "orders" },
    { label: "Awaiting payment", value: "—", sub: "Coming soon" },
    { label: "Total committed", value: "—", sub: "Coming soon" },
  ];

  const sellingFilters: [string, string, number][] = [
    ["all", "All", myListings.length],
    ["live", "Live", sellingActiveCount],
    ["draft", "Drafts", sellingDraftCount],
    ["sold", "Sold", sellingSoldCount],
  ];

  const buyingFilters: [string, string, number][] = [
    ["all", "All", myPurchases.length],
    ["active", "Active", buyingActiveCount],
    ["completed", "Completed", buyingCompletedCount],
    ["inactive", "Inactive", buyingDeclinedCount],
  ];

  const filteredListings = myListings.filter((l) => {
    if (listingsFilter === "all") return true;
    const timeInfo = getListingTimeInfo(l.postedAt);
    if (listingsFilter === "draft") return l.status === "draft";
    if (listingsFilter === "sold") return l.status === "sold";
    if (listingsFilter === "live") return !timeInfo.expired && l.status !== "draft" && l.status !== "sold";
    return true;
  });

  const filteredPurchases = myPurchases.filter((o) => {
    if (listingsFilter === "all") return true;
    if (listingsFilter === "active") return o.status === "pending" || o.status === "confirmed";
    if (listingsFilter === "completed") return o.status === "completed";
    if (listingsFilter === "inactive") return o.status === "declined" || o.status === "withdrawn" || o.status === "expired" || o.status === "cancelled_by_seller";
    return true;
  });

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
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
        <button
          onClick={() => onNavigate("newlisting")}
          className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
        >
          <Plus className="size-4" />
          New listing
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {isLoadingStats
          ? Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
          : (listingsTab === "selling" ? sellingKpis : buyingKpis).map((kpi) => (
              <div key={kpi.label} className="bg-surface-card border border-hairline rounded-md p-4">
                <p className="text-[11px] text-muted">{kpi.label}</p>
                <p className={`text-3xl font-extrabold tracking-display mt-1 ${kpi.value === "—" ? "text-muted-soft" : "text-ink"}`}>{kpi.value}</p>
                <p className={`text-[11px] mt-0.5 ${kpi.value === "—" ? "text-muted-soft" : "text-muted"}`}>{kpi.sub}</p>
              </div>
            ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(listingsTab === "selling" ? sellingFilters : buyingFilters).map(([id, label, n]) => {
          const active = listingsFilter === id;
          return (
            <button
              key={id}
              onClick={() => setListingsFilter(id)}
              className={getChipClass(active)}
            >
              {label}
              <span className={`text-[10px] ${active ? "text-on-primary/80" : "text-muted"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      {listingsTab === "selling" ? (
        isLoadingMyListings && filteredListings.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted">Nothing in this view yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredListings.map((listing) => {
              const timeInfo = getListingTimeInfo(listing.postedAt);
              const hasPendingOrders = (listing.pendingOrderCount ?? 0) > 0;
              const sellerOrder = mySellerOrders.find((o) => o.listing_id === listing.id && (o.status === "confirmed" || o.status === "completed"));
              const sellerCountdown = sellerOrder ? getPickupCountdown(sellerOrder) : null;
              const sellerHasReviewed = sellerOrder?.seller_reviewed ?? false;
              const buyerHasReviewed = sellerOrder?.buyer_reviewed ?? false;
              const isSellerPickupReady = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && !sellerHasReviewed);
              const isSellerWaitingForBuyer = !!(sellerOrder && sellerOrder.status === "confirmed" && sellerCountdown?.expired && sellerHasReviewed && !buyerHasReviewed);
              const isCompleted = sellerOrder?.status === "completed";
              const isConfirmedTicking = !!(sellerOrder?.status === "confirmed" && sellerCountdown && !sellerCountdown.expired);

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
              const statusClass = statusLabel === "Draft" || statusLabel === "Sold" || statusLabel === "Completed" || statusLabel === "Expired"
                ? "bg-surface-strong text-muted"
                : statusLabel === "Awaiting buyer"
                  ? "bg-warning-soft text-warning"
                  : "bg-primary-soft text-primary";

              // Cards in terminal states (expired / completed / sold) and the
              // awaiting-buyer transient state get a card-level click handler
              // routed to detail / order summary. Active states leave the
              // article without onClick — inner buttons drive the interactions.
              const isTerminal = timeInfo.expired || isCompleted || listing.status === "sold";
              const isCardClickable = isTerminal || isSellerWaitingForBuyer;
              const onCardClick = isCardClickable
                ? () => {
                    if (isSellerWaitingForBuyer && sellerOrder) {
                      openConfirmedOrderSummary(listing.id);
                      return;
                    }
                    openListingDetail?.(listing as Listing);
                  }
                : undefined;

              return (
                <article
                  key={listing.id}
                  onClick={onCardClick}
                  className={`bg-canvas border border-hairline rounded-md overflow-hidden hover:shadow-hover transition-shadow flex flex-col ${isCardClickable ? "cursor-pointer" : ""}`}
                >
                  {/* Trust band — mirrors marketplace card.
                      MyListing payload omits allCommunities; falls back to
                      PLACEHOLDER_COMMUNITY until the sell-flow community
                      selector ships. Replicated inline rather than
                      extracted to a shared <ListingCard> per R-5.9 brief. */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{PLACEHOLDER_COMMUNITY.name}</span>
                  </div>
                  <div className="relative aspect-square bg-surface-soft">
                    <ListingImage src={listing.imageUrl} alt="" size="card" className="absolute inset-0 size-full object-cover" />
                    <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                      {statusLabel}
                    </span>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{formatTitle(listing.brand, listing.name)}</p>
                    <p className="text-xs text-muted line-clamp-1">{listing.location || "—"}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${listing.price}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {timeInfo.expired ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRelist(listing.id); }}
                          disabled={relistingId === listing.id}
                          className={`flex-1 inline-flex items-center justify-center gap-1 h-8 px-3 rounded-md bg-primary-soft text-primary text-xs font-semibold hover:bg-primary-tint transition-colors disabled:opacity-50 ${FOCUS_RING}`}
                        >
                          {relistingId === listing.id ? <Loader2 className="size-3 animate-spin" /> : <><RotateCcw className="size-3" />Relist</>}
                        </button>
                      ) : (
                        <>
                          <Tooltip content="Edit listing">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditListing(listing); }}
                              className={`inline-flex items-center justify-center size-8 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft transition-colors ${FOCUS_RING}`}
                              aria-label="Edit listing"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </Tooltip>
                          {hasPendingOrders ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openOrderModal(listing); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Review {listing.pendingOrderCount} {listing.pendingOrderCount === 1 ? "offer" : "offers"}
                            </button>
                          ) : isSellerPickupReady && sellerOrder ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openRatingModal(sellerOrder); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                            >
                              Confirm pickup
                            </button>
                          ) : isSellerWaitingForBuyer ? (
                            <span className="flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-warning/10 text-warning text-xs font-semibold">
                              Awaiting buyer
                            </span>
                          ) : sellerOrder?.status === "confirmed" && sellerCountdown ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); openConfirmedOrderSummary(listing.id); }}
                              className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                            >
                              {sellerCountdown.label} to pickup
                            </button>
                          ) : (
                            <span className="flex-1 text-[11px] text-muted text-right pr-1">{timeInfo.label}</span>
                          )}
                          {listing.status !== "sold" && (
                            <Tooltip content="Remove listing">
                              <button
                                onClick={(e) => { e.stopPropagation(); openRemoveListing(listing); }}
                                className={`inline-flex items-center justify-center size-8 rounded-md border border-error/30 text-error bg-canvas hover:bg-error/5 hover:text-error transition-colors ${FOCUS_RING}`}
                                aria-label="Remove listing"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
        isLoadingMyOrders && filteredPurchases.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <ListingCardSkeleton key={i} />)}
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="text-center py-16 border border-hairline rounded-md bg-surface-soft">
            <p className="text-sm text-muted">Nothing in this view yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPurchases.map((order) => {
              const countdown = getPickupCountdown(order);
              const viewState = getBuyerOrderViewState({
                status: order.status,
                countdownExpired: countdown.expired,
                hasReviewed: order.buyer_reviewed,
                otherReviewed: order.seller_reviewed,
              });
              const statusLabel = viewState === "declined" ? "Declined"
                : viewState === "withdrawn" ? "Withdrawn"
                : viewState === "expired" ? "Expired"
                : viewState === "cancelledBySeller" ? "Cancelled by seller"
                : viewState === "waitingForOther" ? "Awaiting seller"
                : viewState === "pickupReady" ? "Pickup ready"
                : viewState === "confirmedCountdown" ? `Pickup in ${countdown.label}`
                : order.status === "completed" ? "Completed"
                : "Pending";
              const statusClass = ["declined", "withdrawn", "expired"].includes(viewState) || order.status === "completed"
                ? "bg-surface-strong text-muted"
                : viewState === "cancelledBySeller" || viewState === "waitingForOther"
                  ? "bg-warning-soft text-warning"
                  : "bg-primary-soft text-primary";

              // Pending buyer-side orders get the distinct "Pending" overlay
              // (uppercase tracking-widest jade pill) mirroring the marketplace
              // "Sold" overlay treatment — a clearer trust signal that this is
              // a live order awaiting the seller. Other states keep the
              // standard rounded-full status pill.
              const isPending = order.status === "pending" && !["declined", "withdrawn", "expired", "cancelledBySeller"].includes(viewState);
              return (
                <article key={order.id} className="bg-canvas border border-hairline rounded-md overflow-hidden hover:shadow-hover transition-shadow flex flex-col">
                  {/* Trust band — mirrors marketplace card. OrderData
                      doesn't enrich with allCommunities; falls back to
                      PLACEHOLDER_COMMUNITY. Seller @handle stays in the
                      band so the buyer can see who they bought from. */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
                    <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
                    <span className="text-ink font-medium truncate">{PLACEHOLDER_COMMUNITY.name}</span>
                    {order.seller_name && (
                      <>
                        <span className="text-muted">·</span>
                        <span className="text-muted truncate">@{order.seller_name}</span>
                      </>
                    )}
                  </div>
                  <div className="relative aspect-square bg-surface-soft">
                    <ListingImage src={order.listing_image} alt="" size="card" className="absolute inset-0 size-full object-cover" />
                    {isPending ? (
                      <span className="absolute top-2 left-2 text-[10px] font-semibold text-on-primary bg-primary px-2 py-1 rounded-sm">
                        Pending
                      </span>
                    ) : (
                      <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${statusClass}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-1">
                    <p className="text-sm font-medium text-ink line-clamp-1">{order.listing_title}</p>
                    <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">${order.listing_price}</p>
                    <div className="flex items-center gap-1.5 mt-2">
                      {viewState === "pickupReady" ? (
                        <button
                          onClick={() => openRatingModal(order)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md bg-primary text-on-primary text-xs font-semibold hover:bg-primary-hover transition-colors ${FOCUS_RING}`}
                        >
                          Confirm pickup
                        </button>
                      ) : viewState === "confirmedCountdown" ? (
                        <button
                          onClick={() => openConfirmedOrderSummary(order.listing_id)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                        >
                          {countdown.label} to pickup
                        </button>
                      ) : order.status === "pending" ? (
                        <button
                          onClick={() => setShowWithdrawConfirm(showWithdrawConfirm === order.id ? null : order.id)}
                          className={`flex-1 inline-flex items-center justify-center h-8 px-3 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-xs font-semibold transition-colors ${FOCUS_RING}`}
                        >
                          Withdraw
                        </button>
                      ) : (
                        <span className="flex-1 text-[11px] text-muted text-right pr-1">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                        </span>
                      )}
                    </div>
                    {showWithdrawConfirm === order.id && (
                      <div className="mt-2 bg-warning/5 border border-warning/20 rounded-md p-2">
                        <p className="text-[11px] text-body mb-2">Withdraw your order? You can re-order later.</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setShowWithdrawConfirm(null)}
                            className={`flex-1 h-7 rounded-md border border-border-strong text-ink bg-canvas hover:bg-surface-soft text-[11px] font-semibold ${FOCUS_RING}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleWithdrawOrder(order.id)}
                            disabled={withdrawingOrderId === order.id}
                            className={`flex-1 h-7 rounded-md bg-warning text-on-primary text-[11px] font-semibold hover:bg-warning/90 disabled:opacity-50 ${FOCUS_RING}`}
                          >
                            {withdrawingOrderId === order.id ? "…" : "Withdraw"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}
    </>
  );
}
