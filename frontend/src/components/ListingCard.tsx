import { Heart } from "lucide-react";
import type { Listing } from "../lib/types";
import { formatTitle } from "../lib/format";
import { ListingImage } from "./ui/ListingImage";
import { CircleByline } from "./CircleByline";

interface ListingCardProps {
  listing: Listing;
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
      className="group cursor-pointer motion-safe:animate-mkt-card-in"
      style={{ animationDelay: `${animationDelayMs}ms` }}
    >
      {/* Circle byline — fixed three slots above the photo */}
      <CircleByline circles={listing.circles} />

      {/* Photo */}
      <div className="relative aspect-square bg-surface-soft rounded-lg overflow-hidden">
        <ListingImage
          src={images[0]}
          alt={formatTitle(listing.brand, listing.name)}
          size="card"
          priority={priority}
          className="absolute inset-0 size-full object-cover"
        />
        {!isOwn && isAuthenticated && listing.status !== "sold" && (
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
          <>
            <span className="absolute inset-0 bg-canvas/75" aria-hidden="true" />
            <span className="absolute top-2 left-2 text-[10px] font-bold text-ink bg-canvas/95 border border-hairline px-2 py-1 rounded-full">
              Sold
            </span>
          </>
        )}
      </div>

      {/* Body */}
      <div className="pt-2 space-y-0.5">
        <p className={`text-sm font-medium line-clamp-1 ${listing.status === "sold" ? "text-muted" : "text-ink"}`}>
          {formatTitle(listing.brand, listing.name)}
        </p>
        <p className="text-xs text-muted line-clamp-1">
          {listing.location}
          {listing.distance_miles != null && (
            <span className="text-line-strong"> · </span>
          )}
          {listing.distance_miles != null && `${listing.distance_miles} mi`}
        </p>
        <p className={`text-base font-semibold leading-none pt-0.5 ${listing.status === "sold" ? "text-muted" : "text-ink"}`}>
          ${listing.price}
        </p>
      </div>
    </article>
  );
}
