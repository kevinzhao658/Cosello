import { useEffect, useState } from "react";
import { X, MapPin, User, Loader2, Pencil, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ModalShell } from "../../components/ui/ModalShell";
import { formatTitle } from "../../lib/format";
import { PLACEHOLDER_COMMUNITY } from "../../lib/listings";
import { Tooltip } from "../../components/ui/tooltip";
import { ListingMap } from "../../components/ListingMap";
import { Skeleton } from "../../components/ui/Skeleton";
import { apiFetch } from "../../lib/api";
import type { Listing } from "../../lib/types";

export type SellerProfile = {
  id: string;
  display_name: string | null;
  neighborhood: string | null;
  profile_picture: string | null;
  is_friend: boolean;
  communities: { id: number; name: string; image: string | null; is_mutual: boolean; is_public?: boolean }[];
  mutual_friends: { id: string; display_name: string | null; profile_picture: string | null; neighborhood: string | null }[];
};

export type BuyerOrderStatus = { status: string | null; order_id?: number } | null;

type ListingDetailModalProps = {
  open: boolean;
  onClose: () => void;
  listing: Listing | null;
  isAuthenticated: boolean;
  currentUserId: string | undefined;
  sellerProfile: SellerProfile | null;
  isLoadingSeller: boolean;
  buyerOrderStatus: BuyerOrderStatus;
  categorySchemas: Record<string, { label: string }>;
  onOpenUserDashboard: (userId: string) => void;
  onOpenEdit: () => void;
  onOpenBuy: () => void;
  onEditPickupSlots: () => void;
  onSignInPrompt: () => void;
};

function relativeTimeFrom(epochSeconds: number): string {
  const now = Date.now() / 1000;
  const delta = Math.max(0, now - epochSeconds);
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) {
    const h = Math.floor(delta / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(delta / 86400);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

type DetailTab = "details" | "location";

/** Renders the primary call-to-action block (Buy now / Edit / statuses).
 *  Extracted so we can render it twice: inline on desktop, sticky on mobile. */
function PrimaryActionBlock({
  isOwn,
  isSold,
  isAuthenticated,
  buyerOrderStatus,
  onOpenEdit,
  onOpenBuy,
  onEditPickupSlots,
  onSignInPrompt,
  offerRow,
}: {
  isOwn: boolean;
  isSold: boolean;
  isAuthenticated: boolean;
  buyerOrderStatus: BuyerOrderStatus;
  onOpenEdit: () => void;
  onOpenBuy: () => void;
  onEditPickupSlots: () => void;
  onSignInPrompt: () => void;
  /** When true, render the disabled offer input row beneath Buy-now. */
  offerRow: boolean;
}) {
  if (isOwn) {
    if (isSold) {
      return (
        <div className="text-center py-3 rounded-md bg-surface-soft border border-hairline text-sm text-muted">
          Sold
        </div>
      );
    }
    return (
      <Button onClick={onOpenEdit} variant="outline" className="w-full h-12 gap-2">
        <Pencil className="size-4" />
        Edit listing
      </Button>
    );
  }

  if (isSold) {
    return (
      <div className="text-center py-3 rounded-md bg-surface-soft border border-hairline text-sm text-muted">
        Sold
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Button onClick={onSignInPrompt} className="w-full h-12 rounded-md">
        Sign in to buy
      </Button>
    );
  }

  if (buyerOrderStatus?.status === "declined") {
    return (
      <div className="text-center py-3 rounded-md bg-error/10 border border-error/30 text-sm text-error">
        Your order was declined
      </div>
    );
  }

  if (buyerOrderStatus?.status === "pending") {
    return (
      <button
        type="button"
        onClick={onEditPickupSlots}
        className="w-full text-center py-3 rounded-md bg-warning/10 border border-warning/30 text-sm text-warning hover:bg-warning/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        Order pending — edit pickup times
      </button>
    );
  }

  if (buyerOrderStatus?.status === "confirmed") {
    return (
      <div className="text-center py-3 rounded-md bg-primary-soft border border-primary/30 text-sm text-primary inline-flex items-center justify-center gap-2 w-full">
        <Check className="size-4" /> Order confirmed
      </div>
    );
  }

  /* Default: active listing, authenticated buyer */
  return (
    <>
      <Button
        onClick={onOpenBuy}
        className="w-full h-10 rounded-md bg-primary hover:bg-primary-hover text-on-primary"
      >
        Buy now
      </Button>
      {offerRow && (
        <Tooltip content="Offers coming soon">
          <div className="flex gap-2">
            <input
              type="text"
              disabled
              placeholder="Make an offer"
              aria-label="Make an offer (coming soon)"
              className="flex-1 h-9 px-3 rounded-md border border-hairline bg-surface-soft text-muted text-sm placeholder:text-muted-soft cursor-not-allowed"
            />
            <button
              type="button"
              disabled
              aria-label="Send offer (coming soon)"
              className="h-9 px-4 rounded-md bg-primary/40 text-on-primary text-sm font-semibold cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </Tooltip>
      )}
    </>
  );
}

export function ListingDetailModal({
  open,
  onClose,
  listing,
  isAuthenticated,
  currentUserId,
  sellerProfile,
  isLoadingSeller,
  buyerOrderStatus,
  categorySchemas,
  onOpenUserDashboard,
  onOpenEdit,
  onOpenBuy,
  onEditPickupSlots,
  onSignInPrompt,
}: ListingDetailModalProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [tab, setTab] = useState<DetailTab>("details");
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const listingId = listing?.id;

  // ── Walking estimate ────────────────────────────────────────────────────────
  // Fetched from GET /api/listings/{id} (detail endpoint) when the modal opens.
  // The feed does NOT include walk_minutes; this call is the only source.
  // null = not available (no token, no buyer ZIP, no coords, or Mapbox error).
  // "loading" distinguishes the in-flight state from a resolved null.
  const [walkMinutes, setWalkMinutes] = useState<number | null | "loading">("loading");

  useEffect(() => {
    setImageIndex(0);
    setTab("details");
    setLocationDrawerOpen(false);
    setLightboxOpen(false);
    // Reset walk estimate whenever the listing changes.
    setWalkMinutes("loading");
  }, [listingId]);

  // Fetch the detail endpoint to obtain walk_minutes. Does not block the modal
  // or the map. Errors and null responses are handled gracefully.
  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/listings/${listingId}`);
        if (cancelled) return;
        if (res.ok) {
          const data: Listing = await res.json();
          setWalkMinutes(data.walk_minutes ?? null);
        } else {
          setWalkMinutes(null);
        }
      } catch {
        if (!cancelled) setWalkMinutes(null);
      }
    })();
    return () => { cancelled = true; };
  }, [listingId]);

  /* Close location drawer or lightbox on Escape */
  useEffect(() => {
    if (!locationDrawerOpen && !lightboxOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightboxOpen) setLightboxOpen(false);
        else if (locationDrawerOpen) setLocationDrawerOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [locationDrawerOpen, lightboxOpen]);

  if (!open || !listing) return null;

  const images = listing.imageUrls?.length ? listing.imageUrls : [listing.imageUrl];
  // Clamp in case the listing changed under us before the carousel reset.
  const safeIndex = Math.min(imageIndex, images.length - 1);
  const thumbs = images.slice(0, 5);

  const heroCommunity =
    listing.allCommunities?.find((c) => c.is_mutual)
    ?? listing.allCommunities?.[0]
    ?? PLACEHOLDER_COMMUNITY;
  const mutualCommunities = listing.mutualCommunities ?? [];
  const isOwn = isAuthenticated && listing.userId === currentUserId;
  const isSold = listing.status === "sold";

  const actionProps = {
    isOwn,
    isSold,
    isAuthenticated,
    buyerOrderStatus,
    onOpenEdit,
    onOpenBuy,
    onEditPickupSlots,
    onSignInPrompt,
  };

  return (
    <ModalShell open onClose={onClose} z={200}>
      <div
        className="relative w-full max-w-[940px] mx-0 md:mx-4 rounded-none md:rounded-xl bg-canvas shadow-overlay overflow-hidden h-[100dvh] md:h-auto max-h-[100dvh] md:max-h-[90vh] flex flex-col md:grid md:grid-cols-2"
        role="dialog"
        aria-label={formatTitle(listing.brand, listing.name)}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 size-8 rounded-full bg-canvas border border-hairline inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <X className="size-4" />
        </button>

        {/* Left: photos column — desktop only. On mobile the photo block is
            rendered inside the scroll region below so it scrolls away with
            the rest of the content (rather than locking at the top). */}
        <div className="hidden md:block p-3 md:p-6 bg-surface-soft border-b md:border-b-0 md:border-r border-hairline shrink-0">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label="Expand image"
            className="relative aspect-[4/5] w-full bg-surface-strong rounded-md overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <img
              src={images[safeIndex]}
              alt={formatTitle(listing.brand, listing.name)}
              className="absolute inset-0 size-full object-cover"
              decoding="async"
            />
          </button>
          {thumbs.length > 1 && (
            <div className="grid grid-cols-5 gap-2 mt-3">
              {thumbs.map((url, i) => (
                <button
                  key={`${url}-${i}`}
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={`Show image ${i + 1} of ${thumbs.length}`}
                  aria-current={i === safeIndex ? "true" : undefined}
                  className={`aspect-square rounded-md overflow-hidden border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    i === safeIndex ? "border-primary ring-2 ring-primary-soft" : "border-hairline hover:border-border-strong"
                  }`}
                >
                  <img src={url} alt="" className="size-full object-cover" decoding="async" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: details column — `flex-1 min-h-0` on mobile so it fills the
            remaining viewport height after the photo column; `md:block` reverts
            to plain block on desktop preserving the 2-col grid layout. */}
        <div className="relative flex-1 min-h-0 flex flex-col md:block md:flex-none">
          {/* Scrollable region */}
          <div className="overflow-y-auto flex-1 min-h-0 md:max-h-[90vh] md:flex-none md:pb-6">
            {/* Mobile photo block — fixed-height frame (~42vh) so the title
                and price are visible from the initial open. Photo is fitted
                with `object-contain` (letterboxed on bg-surface-strong) so it
                never crops the item. Tap the photo to open the lightbox. */}
            <div className="md:hidden p-3 bg-surface-soft border-b border-hairline">
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                aria-label="Expand image"
                className="relative w-full h-[42vh] bg-surface-strong rounded-md overflow-hidden block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                <img
                  src={images[safeIndex]}
                  alt={formatTitle(listing.brand, listing.name)}
                  className="absolute inset-0 size-full object-contain"
                  decoding="async"
                />
              </button>
              {thumbs.length > 1 && (
                <div className="grid grid-cols-5 gap-2 mt-3">
                  {thumbs.map((url, i) => (
                    <button
                      key={`m-${url}-${i}`}
                      type="button"
                      onClick={() => setImageIndex(i)}
                      aria-label={`Show image ${i + 1} of ${thumbs.length}`}
                      aria-current={i === safeIndex ? "true" : undefined}
                      className={`aspect-square rounded-md overflow-hidden border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                        i === safeIndex ? "border-primary ring-2 ring-primary-soft" : "border-hairline hover:border-border-strong"
                      }`}
                    >
                      <img src={url} alt="" className="size-full object-cover" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Wrap the rest of the content so mobile padding only applies
                below the photo block (which has its own p-3). */}
            <div className="p-4 md:p-6 md:pt-6">
            {/* Trust strip — community always renders via PLACEHOLDER_COMMUNITY
                fallback until the sell-flow community selector ships. */}
            <div className="flex items-center gap-2 text-xs text-muted mb-3">
              <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
              <span className="text-ink font-medium truncate">{heroCommunity.name}</span>
              {listing.seller_name && (
                <>
                  <span className="hidden md:inline" aria-hidden="true">·</span>
                  <span className="hidden md:inline truncate">@{listing.seller_name}</span>
                </>
              )}
              <span className="hidden md:inline" aria-hidden="true">·</span>
              <span className="hidden md:inline truncate">Listed {relativeTimeFrom(listing.postedAt)}</span>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-display-md font-extrabold text-ink tracking-display leading-tight">
              {formatTitle(listing.brand, listing.name)}
            </h1>

            {/* Facts line — neighborhood link (opens location drawer on mobile,
                switches to Location tab on desktop). Condition removed from here;
                it now lives in the Details dl below. */}
            <div className="flex items-center gap-2 flex-wrap mt-2 mb-3">
              {listing.location ? (
                <>
                  {/* Mobile: opens location drawer */}
                  <button
                    type="button"
                    onClick={() => setLocationDrawerOpen(true)}
                    className="md:hidden inline-flex items-center gap-1 text-primary font-semibold text-sm underline underline-offset-2 decoration-1 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-sm"
                  >
                    <MapPin className="size-3" aria-hidden />
                    {listing.location}
                  </button>
                  {/* Desktop: switches to Location tab */}
                  <button
                    type="button"
                    onClick={() => setTab("location")}
                    className="hidden md:inline-flex items-center gap-1 text-primary font-semibold text-sm underline underline-offset-2 decoration-1 hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-sm"
                  >
                    <MapPin className="size-3" aria-hidden />
                    {listing.location}
                  </button>
                </>
              ) : null}
              {listing.distance_miles !== null && listing.distance_miles !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-soft border border-hairline text-muted">
                  <MapPin className="size-3" aria-hidden />
                  ~{listing.distance_miles.toFixed(1)} mi away
                </span>
              )}
            </div>

            {/* Price */}
            <p className="text-3xl md:text-display-lg font-extrabold text-primary tracking-display leading-none mb-4 md:mb-6">
              ${listing.price}
            </p>

            {/* Tab strip — desktop only. On mobile the Details content always
                renders; location is accessed via the drawer. */}
            <div
              role="tablist"
              aria-label="Listing sections"
              className="hidden md:inline-flex items-center p-1 bg-surface-soft border border-hairline rounded-md mb-5"
            >
              {(["details", "location"] as const).map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setTab(t)}
                    className={`h-8 px-4 text-sm font-semibold rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                      active ? "bg-canvas text-ink shadow-card" : "text-muted hover:text-ink bg-transparent"
                    }`}
                  >
                    {t === "details" ? "Details" : "Location"}
                  </button>
                );
              })}
            </div>

            {tab === "details" ? (
              <div className="space-y-5">
                {/* Primary action — inline, desktop only. On mobile, the sticky
                    pane below renders instead. */}
                <div className="hidden md:flex md:flex-col gap-2">
                  <PrimaryActionBlock {...actionProps} offerRow />
                </div>

                {listing.description && (
                  <p className="text-sm text-body leading-relaxed whitespace-pre-wrap">{listing.description}</p>
                )}

                {/* Details dl — Condition row prepended; Category row removed.
                    Always renders at least the Condition row. */}
                {(() => {
                  const attrs = listing.categoryAttributes ?? {};
                  const entries = Object.entries(attrs).filter(
                    ([k, v]) => v && k !== "brand" && k !== "model",
                  );
                  return (
                    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 pt-2 border-t border-hairline">
                      <dt className="text-xs text-muted">Condition</dt>
                      <dd className="text-sm text-ink">{listing.condition}</dd>
                      {entries.map(([k, v]) => {
                        const label =
                          k === "carry_difficulty" ? "Carry difficulty"
                          : k === "brand_or_creator" ? "Brand / creator"
                          : k === "style_code" ? "Style code"
                          : k.charAt(0).toUpperCase() + k.slice(1);
                        return (
                          <div key={k} className="contents">
                            <dt className="text-xs text-muted">{label}</dt>
                            <dd className="text-sm text-ink">{String(v)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  );
                })()}

                {listing.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {listing.tags.map((tag, i) => (
                      <span key={i} className="px-2.5 py-0.5 rounded-full text-xs bg-surface-soft border border-hairline text-muted">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Seller banner — verified badge / online dot / response
                    time are omitted because the API doesn't surface those
                    fields. Mutual-communities count is only shown when
                    `listing.mutualCommunities` is populated. */}
                {isLoadingSeller ? (
                  <div className="py-6 text-center border-t border-hairline">
                    <Loader2 className="size-5 animate-spin mx-auto text-primary" />
                  </div>
                ) : sellerProfile ? (
                  <div className="mt-2 p-3 md:p-4 bg-surface-soft border border-hairline rounded-md flex items-center gap-3">
                    <div className="size-10 md:size-12 rounded-full bg-canvas border border-hairline inline-flex items-center justify-center overflow-hidden shrink-0">
                      {sellerProfile.profile_picture ? (
                        <img src={sellerProfile.profile_picture} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-5 text-muted" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-ink truncate">
                        <span className="truncate">{sellerProfile.display_name ?? "Seller"}</span>
                        {sellerProfile.is_friend && (
                          <span className="text-[10px] text-primary bg-primary-soft px-1.5 py-0.5 rounded-sm shrink-0">
                            Friend
                          </span>
                        )}
                      </div>
                      {sellerProfile.neighborhood && (
                        <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                          <MapPin className="size-3" /> {sellerProfile.neighborhood}
                        </p>
                      )}
                      {mutualCommunities.length > 0 && (
                        <p className="text-xs text-muted mt-1.5">
                          <span className="font-medium text-ink">{mutualCommunities.length}</span>{" "}
                          mutual {mutualCommunities.length === 1 ? "community" : "communities"}
                        </p>
                      )}
                    </div>
                    <Tooltip content="View seller profile">
                      <button
                        type="button"
                        onClick={() => onOpenUserDashboard(sellerProfile.id)}
                        aria-label="View seller profile"
                        className="shrink-0 size-9 rounded-full bg-canvas border border-hairline inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
            ) : (
              /* Location tab — desktop only (tab strip is hidden on mobile) */
              <div className="space-y-4">
                <ListingMap listingId={listing.id} />

                <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
                  <dt className="text-xs text-muted">Neighborhood</dt>
                  <dd className="text-sm text-ink">{listing.location || "—"}</dd>

                  <dt className="text-xs text-muted">Distance from you</dt>
                  <dd className="text-sm text-ink font-semibold">
                    {listing.distance_miles !== null && listing.distance_miles !== undefined
                      ? `~${listing.distance_miles.toFixed(1)} mi away`
                      : "Not available yet"}
                  </dd>

                  {walkMinutes === "loading" ? (
                    <>
                      <dt className="text-xs text-muted">Walking</dt>
                      <dd><Skeleton className="h-4 w-16" /></dd>
                    </>
                  ) : typeof walkMinutes === "number" ? (
                    <>
                      <dt className="text-xs text-muted">Walking</dt>
                      <dd className="text-sm text-ink font-semibold">~{walkMinutes} min</dd>
                    </>
                  ) : null}

                  <dt className="text-xs text-muted">Pickup</dt>
                  <dd className="text-sm text-ink">Approx. address shared after offer is accepted</dd>
                </dl>
              </div>
            )}
            </div>

            {/* Mobile sticky CTA pane — lives inside the scroll container as a
                sticky footer so touch gestures that start on the pane can still
                scroll the content above. The scroller has no horizontal padding,
                so no negative-margin bleed-out is required. */}
            <div className="md:hidden sticky bottom-0 bg-canvas border-t border-hairline px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] flex flex-col gap-2">
              <PrimaryActionBlock {...actionProps} offerRow />
            </div>
          </div>
        </div>

        {/* Mobile location drawer — absolute-positioned inside the modal grid.
            Activated when the neighborhood link is tapped. Closes via scrim,
            X button, or Escape key. */}
        {locationDrawerOpen && (
          <div
            className="md:hidden absolute inset-0 z-20 flex flex-col justify-end"
            role="dialog"
            aria-label="Location"
          >
            {/* Scrim */}
            <button
              type="button"
              aria-label="Close location panel"
              onClick={() => setLocationDrawerOpen(false)}
              className="absolute inset-0 bg-ink/40 focus:outline-none"
            />

            {/* Bottom panel */}
            <div className="relative bg-canvas rounded-t-xl px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-overlay translate-y-0 transition-transform">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-ink">Location</h2>
                <button
                  type="button"
                  onClick={() => setLocationDrawerOpen(false)}
                  aria-label="Close location panel"
                  className="size-8 rounded-full bg-surface-soft border border-hairline inline-flex items-center justify-center text-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* Map */}
              <div className="mb-4">
                <ListingMap listingId={listing.id} />
              </div>

              {/* Location dl */}
              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
                <dt className="text-xs text-muted">Neighborhood</dt>
                <dd className="text-sm text-ink">{listing.location || "—"}</dd>

                <dt className="text-xs text-muted">Distance from you</dt>
                <dd className="text-sm text-ink font-semibold">
                  {listing.distance_miles !== null && listing.distance_miles !== undefined
                    ? `~${listing.distance_miles.toFixed(1)} mi away`
                    : "Not available yet"}
                </dd>

                {walkMinutes === "loading" ? (
                  <>
                    <dt className="text-xs text-muted">Walking</dt>
                    <dd><Skeleton className="h-4 w-16" /></dd>
                  </>
                ) : typeof walkMinutes === "number" ? (
                  <>
                    <dt className="text-xs text-muted">Walking</dt>
                    <dd className="text-sm text-ink font-semibold">~{walkMinutes} min</dd>
                  </>
                ) : null}

                <dt className="text-xs text-muted">Pickup</dt>
                <dd className="text-sm text-ink">Approx. address shared after offer is accepted</dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      {/* Image lightbox — full-screen photo viewer, opened by tapping the
          photo on either viewport. Renders as a separate ModalShell at z=350
          so it overlays the listing detail modal (z=200) and the location
          drawer. Prev/next arrows + a counter let the user step through
          multiple photos without leaving the lightbox. */}
      {lightboxOpen && (
        <ModalShell open onClose={() => setLightboxOpen(false)} z={350}>
          <div className="relative w-screen h-screen flex items-center justify-center p-4">
            <img
              src={images[safeIndex]}
              alt={formatTitle(listing.brand, listing.name)}
              className="max-w-full max-h-full object-contain"
              decoding="async"
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              aria-label="Close image"
              className="absolute top-4 right-4 size-10 rounded-full bg-canvas/90 backdrop-blur-sm border border-hairline inline-flex items-center justify-center text-ink shadow-card hover:bg-canvas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <X className="size-5" />
            </button>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => Math.max(0, i - 1))}
                  disabled={safeIndex === 0}
                  aria-label="Previous image"
                  className="absolute left-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-canvas/90 backdrop-blur-sm border border-hairline inline-flex items-center justify-center text-ink shadow-card hover:bg-canvas transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageIndex((i) => Math.min(images.length - 1, i + 1))}
                  disabled={safeIndex === images.length - 1}
                  aria-label="Next image"
                  className="absolute right-4 top-1/2 -translate-y-1/2 size-10 rounded-full bg-canvas/90 backdrop-blur-sm border border-hairline inline-flex items-center justify-center text-ink shadow-card hover:bg-canvas transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <ChevronRight className="size-5" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-canvas/90 backdrop-blur-sm border border-hairline text-xs font-semibold text-ink shadow-card">
                  {safeIndex + 1} / {images.length}
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}
    </ModalShell>
  );
}
