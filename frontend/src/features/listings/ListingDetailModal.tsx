import { useEffect, useState } from "react";
import { X, MapPin, User, Loader2, Pencil, Check, ChevronRight } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ModalShell } from "../../components/ui/ModalShell";
import { formatTitle } from "../../lib/format";
import { PLACEHOLDER_COMMUNITY } from "../../lib/listings";
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
  const listingId = listing?.id;
  useEffect(() => {
    setImageIndex(0);
    setTab("details");
  }, [listingId]);

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

  return (
    <ModalShell open onClose={onClose} z={200}>
      <div
        className="relative w-full max-w-[940px] mx-4 rounded-xl bg-canvas shadow-overlay overflow-hidden max-h-[90vh] grid grid-cols-1 md:grid-cols-2"
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

        {/* Left: photos column */}
        <div className="p-6 bg-surface-soft border-b md:border-b-0 md:border-r border-hairline">
          <div className="relative aspect-[4/5] bg-surface-strong rounded-md overflow-hidden">
            <img
              src={images[safeIndex]}
              alt={formatTitle(listing.brand, listing.name)}
              className="absolute inset-0 size-full object-cover"
            />
          </div>
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
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: details column */}
        <div className="p-6 overflow-y-auto max-h-[90vh]">
          {/* Trust strip — community always renders via PLACEHOLDER_COMMUNITY
              fallback until the sell-flow community selector ships. */}
          <div className="flex items-center gap-2 text-xs text-muted mb-3">
            <span className="size-3 rounded-full bg-primary shrink-0" aria-hidden="true" />
            <span className="text-ink font-medium truncate">{heroCommunity.name}</span>
            {listing.seller_name && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">@{listing.seller_name}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="truncate">Listed {relativeTimeFrom(listing.postedAt)}</span>
          </div>

          {/* Title */}
          <h1 className="text-display-md font-extrabold text-ink tracking-display leading-tight">
            {formatTitle(listing.brand, listing.name)}
          </h1>

          {/* Facts line — condition · location-as-tab-link */}
          <p className="text-sm text-muted mt-2 mb-4">
            {listing.condition}
            {listing.location ? (
              <>
                <span aria-hidden="true"> · </span>
                <button
                  type="button"
                  onClick={() => setTab("location")}
                  className="underline decoration-dashed underline-offset-2 text-body hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-sm"
                >
                  {listing.location}
                </button>
              </>
            ) : null}
          </p>

          {/* Price */}
          <p className="text-display-lg font-extrabold text-primary tracking-display leading-none mb-6">
            ${listing.price}
          </p>

          {/* Tab strip */}
          <div role="tablist" aria-label="Listing sections" className="inline-flex items-center p-1 bg-surface-soft border border-hairline rounded-md mb-5">
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
              {/* Primary action — Make-offer + Message-seller are
                  intentionally omitted: no `/api/offers` endpoint exists
                  and the project rule is no buyer/seller price
                  negotiation; no `/api/messages` flow exists yet either.
                  Re-introduce as wired UI when those flows land. */}
              {isOwn ? (
                isSold ? (
                  <div className="text-center py-3 rounded-md bg-surface-soft border border-hairline text-sm text-muted">Sold</div>
                ) : (
                  <Button onClick={onOpenEdit} variant="outline" className="w-full h-12 gap-2">
                    <Pencil className="size-4" />
                    Edit listing
                  </Button>
                )
              ) : isSold ? (
                <div className="text-center py-3 rounded-md bg-surface-soft border border-hairline text-sm text-muted">Sold</div>
              ) : !isAuthenticated ? (
                <Button onClick={onSignInPrompt} className="w-full h-12 rounded-md">Sign in to buy</Button>
              ) : buyerOrderStatus?.status === "declined" ? (
                <div className="text-center py-3 rounded-md bg-error/10 border border-error/30 text-sm text-error">Your order was declined</div>
              ) : buyerOrderStatus?.status === "pending" ? (
                <button
                  type="button"
                  onClick={onEditPickupSlots}
                  className="w-full text-center py-3 rounded-md bg-warning/10 border border-warning/30 text-sm text-warning hover:bg-warning/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  Order pending — edit pickup times
                </button>
              ) : buyerOrderStatus?.status === "confirmed" ? (
                <div className="text-center py-3 rounded-md bg-primary-soft border border-primary/30 text-sm text-primary inline-flex items-center justify-center gap-2 w-full">
                  <Check className="size-4" /> Order confirmed
                </div>
              ) : (
                <>
                  <Button onClick={onOpenBuy} className="w-full h-12 rounded-md">Buy now</Button>
                  <div className="flex gap-2" title="Offers coming soon">
                    <input
                      type="text"
                      disabled
                      placeholder="Make an offer"
                      aria-label="Make an offer (coming soon)"
                      className="flex-1 h-12 px-3 rounded-md border border-hairline bg-surface-soft text-muted text-sm placeholder:text-muted-soft cursor-not-allowed"
                    />
                    <button
                      type="button"
                      disabled
                      aria-label="Send offer (coming soon)"
                      className="h-12 px-5 rounded-md bg-primary/40 text-on-primary text-sm font-semibold cursor-not-allowed"
                    >
                      Send
                    </button>
                  </div>
                </>
              )}

              {listing.description && (
                <p className="text-sm text-body leading-relaxed whitespace-pre-wrap">{listing.description}</p>
              )}

              {/* Category attributes (excluding brand/model — top-level
                  via formatTitle). */}
              {(() => {
                const attrs = listing.categoryAttributes ?? {};
                const entries = Object.entries(attrs).filter(([k, v]) => v && k !== "brand" && k !== "model");
                if (entries.length === 0) return null;
                return (
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 pt-2 border-t border-hairline">
                    {listing.category && listing.category !== "other" && (
                      <>
                        <dt className="text-xs uppercase tracking-widest text-muted">Category</dt>
                        <dd className="text-sm text-ink">{categorySchemas[listing.category]?.label ?? listing.category}</dd>
                      </>
                    )}
                    {entries.map(([k, v]) => {
                      const label = k === "carry_difficulty" ? "Carry difficulty"
                        : k === "brand_or_creator" ? "Brand / creator"
                        : k === "style_code" ? "Style code"
                        : k.charAt(0).toUpperCase() + k.slice(1);
                      return (
                        <div key={k} className="contents">
                          <dt className="text-xs uppercase tracking-widest text-muted">{label}</dt>
                          <dd className="text-sm text-ink">{v}</dd>
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
                <div className="mt-2 p-4 bg-surface-soft border border-hairline rounded-md flex items-center gap-3">
                  <div className="size-12 rounded-full bg-canvas border border-hairline inline-flex items-center justify-center overflow-hidden shrink-0">
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
                        <span className="text-[10px] uppercase tracking-widest text-primary bg-primary-soft px-1.5 py-0.5 rounded-sm shrink-0">
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
                  <button
                    type="button"
                    onClick={() => onOpenUserDashboard(sellerProfile.id)}
                    aria-label="View seller profile"
                    title="View seller profile"
                    className="shrink-0 size-9 rounded-full bg-canvas border border-hairline inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Map placeholder */}
              <div className="relative aspect-[16/10] bg-surface-soft border border-hairline rounded-md overflow-hidden">
                <div className="absolute inset-0 ld-map-grid" aria-hidden="true" />
                <div className="absolute -top-12 -left-12 size-48 rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
                <div className="absolute -bottom-16 -right-16 size-56 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <MapPin className="size-10 text-primary motion-safe:animate-bounce" aria-hidden="true" />
                </div>
                <span className="absolute top-2 right-2 text-xs text-muted bg-canvas/80 backdrop-blur-sm px-2 py-1 rounded-full border border-hairline">
                  Map placeholder · Integrate with Google Maps geotag
                </span>
              </div>

              <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3">
                <dt className="text-xs uppercase tracking-widest text-muted">Neighborhood</dt>
                <dd className="text-sm text-ink">{listing.location || "—"}</dd>

                <dt className="text-xs uppercase tracking-widest text-muted">Distance from you</dt>
                {/* Distance is gated on lat/long — same as the
                    Marketplace distance slider. */}
                <dd className="text-sm text-ink font-semibold">Not available yet</dd>

                <dt className="text-xs uppercase tracking-widest text-muted">Pickup</dt>
                <dd className="text-sm text-ink">Approx. address shared after offer is accepted</dd>
              </dl>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
