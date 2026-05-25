import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Loader2 } from "lucide-react";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface CommunityOption {
  id: number;
  name: string;
  neighborhood?: string;
  is_public?: boolean;
}

export interface PickupStepProps {
  bulkPickupLocation: string;
  bulkItemsCount: number;
  isPostingBulk: boolean;
  isAuthenticated: boolean;
  onChange: (value: string) => void;
  onPost: () => void;
  // PR 3 — community picker:
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
}

const MAX_COMMUNITIES = 3;

export function PickupStep({
  bulkPickupLocation,
  bulkItemsCount,
  isPostingBulk,
  isAuthenticated,
  onChange,
  onPost,
  availableCommunities,
  selectedCommunityIds,
  onToggleCommunity,
  userNeighborhood,
}: PickupStepProps) {
  const atCap = selectedCommunityIds.length >= MAX_COMMUNITIES;
  const hasAny = availableCommunities.length > 0;

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <h2 className="text-xl font-extrabold text-ink leading-tight tracking-tight">
        Where are you selling?
      </h2>

      <div>
        <label htmlFor="bulk-pickup-location" className="text-xs text-muted uppercase tracking-wider">
          Pickup location
        </label>
        <Input
          id="bulk-pickup-location"
          value={bulkPickupLocation}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Lower East Side, NYC"
          maxLength={200}
          className="mt-1"
        />
        <p className="text-[10px] text-muted-soft mt-1.5 leading-relaxed">
          Your address will not be shared until pickup is confirmed.
        </p>
      </div>

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
                    {c.is_public === false && <span aria-hidden>🔒</span>}
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

      <Button
        onClick={onPost}
        disabled={isPostingBulk}
        className={`w-full disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS_RING}`}
      >
        {isPostingBulk ? (
          <Loader2 className="size-4 animate-spin" />
        ) : isAuthenticated ? (
          `Post all (${bulkItemsCount})`
        ) : (
          "Sign in to Post"
        )}
      </Button>
    </div>
  );
}
