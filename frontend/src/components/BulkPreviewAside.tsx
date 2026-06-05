import { Check } from "lucide-react";
import { PLACEHOLDER_COMMUNITY } from "../lib/listings";
import { formatTitle } from "../lib/format";
import type { BulkPreview } from "../features/sell-wizard/useSellWizard";

interface BulkPreviewAsideProps {
  preview: BulkPreview;
  onPrev: () => void;
  onNext: () => void;
}

export function BulkPreviewAside({ preview, onPrev, onNext }: BulkPreviewAsideProps) {
  const { index, count, item, unit, step, communitySelected, pickupLocationSet } = preview;

  // Checklist evaluation — sourced from BulkPreview.item, defensive against null fields.
  const hasBrandOrName = Boolean(item.brand.trim() || item.name.trim());
  const hasPrice = (() => {
    if (item.price === null) return false;
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0;
  })();
  const hasPhoto = item.imageUrl !== null;
  const hasDescription = item.description !== null && item.description.trim().length >= 20;

  const checklistRows: ReadonlyArray<readonly [string, boolean]> = (() => {
    switch (step) {
      case "upload": return [["At least one photo", hasPhoto]];
      case "groups": return [["Photo", hasPhoto], ["Brand or name", hasBrandOrName], ["Community", communitySelected]];
      case "review": return [["Photo", hasPhoto], ["Brand or name", hasBrandOrName], ["Price", hasPrice], ["Description", hasDescription], ["Community", communitySelected]];
      case "pickup": return [["Brand or name", hasBrandOrName], ["Price", hasPrice], ["Community", communitySelected], ["Pickup location", pickupLocationSet]];
    }
  })();

  const displayPrice = (() => {
    if (item.price === null) return "$—";
    const raw = item.price.replace(/^\$/, "").trim();
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) && num > 0 ? `$${raw}` : "$—";
  })();

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
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
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

      {/* Listing checklist */}
      <div className="bg-canvas border border-hairline rounded-md p-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Listing checklist
        </p>
        <ul className="space-y-2">
          {checklistRows.map(([label, done]) => (
            <li key={label} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className={`inline-flex items-center justify-center size-4 rounded-full border ${
                  done
                    ? "bg-primary border-primary text-on-primary"
                    : "bg-canvas border-hairline text-transparent"
                }`}
              >
                <Check className="size-3" />
              </span>
              <span className={done ? "text-muted line-through" : "text-body"}>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
