import { useState } from "react";
import { MapPin } from "lucide-react";
import { Skeleton } from "./ui/Skeleton";

type ListingMapProps = {
  listingId: string;
};

/**
 * ListingMap — renders the approximate-area Mapbox static map for a listing.
 *
 * The image is fetched directly as an <img> (the backend streams the PNG, no
 * auth token needed — the endpoint is PUBLIC). On 204/404/503 the <img> fails
 * to load and onError switches to the existing ld-map-grid placeholder, which
 * is the default launch state until MAPBOX_TOKEN is configured.
 */
export function ListingMap({ listingId }: ListingMapProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const src = `/api/listings/${listingId}/map.png`;

  return (
    <div className="relative aspect-[16/10] bg-surface-soft border border-hairline rounded-md overflow-hidden">
      {/* Shimmer skeleton — house Skeleton primitive (visible sweep), shown
          while the image is loading and no error. */}
      {!loaded && !errored && <Skeleton className="absolute inset-0 rounded-none" />}

      {/* Actual map image */}
      {!errored && (
        <img
          src={src}
          alt="Approximate pickup area"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setErrored(true);
          }}
          decoding="async"
        />
      )}

      {/* Fallback placeholder — shown on error (204 / 404 / 503 / no token).
          Reuses the existing ld-map-grid + blob visual language. The "Phase 2"
          debug pill is intentionally omitted; this is the graceful default. */}
      {errored && (
        <>
          <div className="absolute inset-0 ld-map-grid" aria-hidden="true" />
          <div
            className="absolute -top-12 -left-12 size-48 rounded-full bg-primary/15 blur-3xl"
            aria-hidden="true"
          />
          <div
            className="absolute -bottom-16 -right-16 size-56 rounded-full bg-accent/10 blur-3xl"
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <MapPin
              className="size-10 text-primary/50"
              aria-hidden="true"
            />
            <span className="text-xs text-muted bg-canvas/80 backdrop-blur-sm px-2 py-1 rounded-full border border-hairline">
              Approximate area
            </span>
          </div>
        </>
      )}
    </div>
  );
}
