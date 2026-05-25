import { Lock } from "lucide-react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface CommunityOption {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface CommunityPickerProps {
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
}

const MAX_COMMUNITIES = 3;

export function CommunityPicker({
  availableCommunities,
  selectedCommunityIds,
  onToggleCommunity,
  userNeighborhood,
}: CommunityPickerProps) {
  const atCap = selectedCommunityIds.length >= MAX_COMMUNITIES;
  const hasAny = availableCommunities.length > 0;

  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wider">Communities</label>
      {hasAny ? (
        <>
          <p className="text-[10px] text-muted-soft mt-1.5 mb-2 leading-relaxed">
            Up to {MAX_COMMUNITIES} community chips will surface on your listing.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableCommunities.map((c) => {
              const on = selectedCommunityIds.includes(c.id);
              const isMyNbhd = !!userNeighborhood && c.neighborhood === userNeighborhood;
              const disabled = !on && atCap;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggleCommunity(c.id)}
                  disabled={disabled}
                  aria-pressed={on}
                  className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
                    on
                      ? "bg-primary text-on-primary border-primary hover:bg-primary-hover"
                      : "bg-canvas text-ink border-hairline hover:bg-surface-soft",
                    disabled ? "opacity-35 cursor-not-allowed" : "cursor-pointer",
                    FOCUS_RING,
                  ].join(" ")}
                >
                  {c.is_public === false && <Lock className="size-3 shrink-0" aria-hidden />}
                  <span>{c.name}</span>
                  {isMyNbhd && (
                    <span className="text-[9px] uppercase tracking-wider opacity-70 font-bold">
                      my nbhd
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p
            className={[
              "text-[10px] mt-2 tabular-nums",
              atCap ? "text-primary font-semibold" : "text-muted",
            ].join(" ")}
          >
            {selectedCommunityIds.length} of {MAX_COMMUNITIES} selected
            {atCap && " · tap an active chip to swap"}
          </p>
        </>
      ) : (
        <div className="mt-1.5 px-3 py-3 rounded-md border border-dashed border-hairline bg-surface-soft text-xs text-muted leading-relaxed">
          No communities yet — this listing will post to the public marketplace.
          <br />
          Join a community (or set your neighborhood) to tag future listings.
        </div>
      )}
    </div>
  );
}
