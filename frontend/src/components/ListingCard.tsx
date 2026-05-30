import { Heart } from "lucide-react";
import type { Listing, ListingCommunity } from "../lib/types";
import { formatTitle } from "../lib/format";
import { ListingImage } from "./ui/ListingImage";
import type { PLACEHOLDER_COMMUNITY } from "../lib/listings";

interface ListingCardProps {
  listing: Listing;
  heroCommunity: ListingCommunity | typeof PLACEHOLDER_COMMUNITY;
  isOwn: boolean;
  isAuthenticated: boolean;
  isWishlisted: boolean;
  isPulsing: boolean;
  priority: boolean;
  animationDelayMs: number;
  onOpen: () => void;
  onToggleWishlist: () => void;
  onPulseEnd: () => void;
}

export function ListingCard({
  listing,
  heroCommunity,
  isOwn,
  isAuthenticated,
  isWishlisted,
  isPulsing,
  priority,
  animationDelayMs,
  onOpen,
  onToggleWishlist,
  onPulseEnd,
}: ListingCardProps) {
  const images =
    listing.imageUrls && listing.imageUrls.length > 0
      ? listing.imageUrls
      : [listing.imageUrl];

  return (
    <article
      onClick={onOpen}
      className="group bg-canvas border border-hairline rounded-md overflow-hidden cursor-pointer hover:shadow-hover transition-shadow motion-safe:animate-mkt-card-in"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      {/* Trust band — always renders community shape.
          Falls back to PLACEHOLDER_COMMUNITY until the
          sell-flow community selector lands (backlog.md). */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline text-xs">
        {heroCommunity.image ? (
          <img
            src={heroCommunity.image}
            alt=""
            className="size-4 rounded-full object-cover shrink-0"
            aria-hidden="true"
          />
        ) : (
          <span
            className="size-4 rounded-full bg-primary shrink-0 inline-flex items-center justify-center text-on-primary text-[8px] font-bold"
            aria-hidden="true"
          >
            {heroCommunity.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-ink font-medium truncate">{heroCommunity.name}</span>
      </div>

      {/* Photo */}
      <div className="relative aspect-square bg-surface-soft">
        <ListingImage
          src={images[0]}
          alt={formatTitle(listing.brand, listing.name)}
          size="card"
          priority={priority}
          className="absolute inset-0 size-full object-cover"
        />
        {!isOwn && isAuthenticated && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleWishlist();
            }}
            aria-label={isWishlisted ? "Remove from saves" : "Save"}
            aria-pressed={isWishlisted}
            className={`absolute top-2 right-2 size-8 rounded-full backdrop-blur-sm border border-hairline inline-flex items-center justify-center transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:shadow-card hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              isWishlisted
                ? "bg-primary-soft/80 text-primary hover:bg-primary-soft"
                : "bg-canvas/90 text-muted hover:bg-canvas hover:text-primary"
            }`}
          >
            <Heart
              className={`size-4 ${isWishlisted ? "fill-primary" : ""} ${
                isPulsing ? "motion-safe:animate-save-pulse" : ""
              }`}
              onAnimationEnd={() => {
                if (!isPulsing) return;
                onPulseEnd();
              }}
            />
          </button>
        )}
        {listing.status === "sold" && (
          <span className="absolute top-2 left-2 text-[10px] uppercase tracking-widest font-semibold text-on-primary bg-ink px-2 py-1 rounded-sm">
            Sold
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-1">
        <p className="text-sm font-medium text-ink line-clamp-1">
          {formatTitle(listing.brand, listing.name)}
        </p>
        <p className="text-xs text-muted line-clamp-1">{listing.location}</p>
        <p className="text-2xl font-extrabold text-primary tracking-display leading-none pt-1">
          ${listing.price}
        </p>
      </div>
    </article>
  );
}
