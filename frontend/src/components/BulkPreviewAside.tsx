import { PLACEHOLDER_COMMUNITY } from "../lib/listings";
import { formatTitle } from "../lib/format";
import { formatPriceDisplay } from "../lib/price";
import type { BulkPreview } from "../features/sell-wizard/useSellWizard";

interface BulkPreviewAsideProps {
  preview: BulkPreview;
  onPrev: () => void;
  onNext: () => void;
}

export function BulkPreviewAside({ preview, onPrev, onNext }: BulkPreviewAsideProps) {
  const { index, count, item, unit } = preview;

  const displayPrice = item.price !== null ? formatPriceDisplay(item.price) : "$—";

  const title = formatTitle(item.brand, item.name) || "Untitled";
  const location = item.location.trim() || "—";

  return (
    <>
      {/* Nav header */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          aria-label="Previous preview"
          disabled={index === 0}
          onClick={onPrev}
          className="size-7 rounded-full border border-hairline flex items-center justify-center disabled:opacity-30 text-ink hover:bg-surface-soft transition-colors"
        >
          ‹
        </button>
        <span className="text-xs font-semibold text-muted">
          {unit} {index + 1} of {count}
        </span>
        <button
          type="button"
          aria-label="Next preview"
          disabled={index === count - 1}
          onClick={onNext}
          className="size-7 rounded-full border border-hairline flex items-center justify-center disabled:opacity-30 text-ink hover:bg-surface-soft transition-colors"
        >
          ›
        </button>
      </div>

      <article>
        {/* Community byline */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            aria-hidden="true"
            className="size-5 rounded-full bg-primary shrink-0 inline-flex items-center justify-center text-on-primary text-[9px] font-bold"
          >
            {PLACEHOLDER_COMMUNITY.name.charAt(0).toUpperCase()}
          </span>
          <span className="text-xs font-medium text-body line-clamp-1">
            {PLACEHOLDER_COMMUNITY.name}
          </span>
        </div>

        {/* Full-size cover image */}
        <div className="relative aspect-square bg-surface-soft rounded-lg overflow-hidden">
          {item.imageUrl ? (
            <img
              src={item.imageUrl}
              alt="Listing cover preview"
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-soft">
              <span className="text-[11px]">Photo preview</span>
            </div>
          )}
          {item.photoCount !== undefined && (
            <span className="absolute left-2 bottom-2 bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
              {item.photoCount} photos
            </span>
          )}
        </div>

        {/* Card details */}
        <div className="pt-2 space-y-0.5">
          <p className="text-sm font-medium text-ink line-clamp-1">{title}</p>
          <p className="text-xs text-muted line-clamp-1">{location}</p>
          <p className="text-base font-semibold text-ink leading-none pt-0.5">{displayPrice}</p>
        </div>
      </article>
    </>
  );
}
