import { Button } from "../../../components/ui/button";
import { Loader2 } from "lucide-react";
import { CommunityPicker, type CommunityOption } from "../CommunityPicker";
import { NYC_ZIPS } from "../../../lib/nycZips";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface PickupStepProps {
  bulkPickupLocation: string;
  /** Required ZIP for this batch (shared across all bulk items). */
  bulkPickupZip: string;
  bulkItemsCount: number;
  isPostingBulk: boolean;
  isAuthenticated: boolean;
  onChange: (value: string) => void;
  onZipChange: (zip: string) => void;
  onPost: () => void;
  // community picker:
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
  /** Seller's profile ZIP — used to prefill the dropdown. */
  userZipCode: string | null;
}

export function PickupStep({
  bulkPickupLocation,
  bulkPickupZip,
  bulkItemsCount,
  isPostingBulk,
  isAuthenticated,
  onChange,
  onZipChange,
  onPost,
  availableCommunities,
  selectedCommunityIds,
  onToggleCommunity,
  userNeighborhood,
  userZipCode,
}: PickupStepProps) {
  // bulkPickupZip is seeded from the user's profile ZIP by the SellWizard
  // effect before this step renders, so we bind directly to it — no local
  // display-only fallback needed.
  const canPost = !isPostingBulk && bulkPickupZip !== "";

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div>
        <label className="text-xs text-muted block mb-1">Pickup location</label>
        <div className="flex items-center gap-2">
          {/* City — read-only */}
          <div className="flex-none">
            <input
              type="text"
              value="New York"
              disabled
              aria-label="City"
              className="h-10 px-3 rounded-md border border-hairline bg-surface-soft text-muted text-sm w-28 cursor-default select-none"
            />
          </div>
          {/* ZIP dropdown */}
          <div className="flex-1">
            <select
              value={bulkPickupZip}
              onChange={(e) => {
                onZipChange(e.target.value);
                // Keep legacy pickup-location field in sync so checklist fires.
                onChange(e.target.value);
              }}
              required
              aria-label="ZIP code"
              className={`w-full h-10 px-3 rounded-md border border-hairline bg-canvas text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 appearance-none ${FOCUS_RING}`}
            >
              <option value="" disabled>Select ZIP</option>
              {NYC_ZIPS.map(({ zip, neighborhood }) => (
                <option key={zip} value={zip}>
                  {zip} — {neighborhood}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-[10px] text-muted-soft mt-1.5 leading-relaxed">
          Your address will not be shared until pickup is confirmed.
        </p>
      </div>

      <CommunityPicker
        availableCommunities={availableCommunities}
        selectedCommunityIds={selectedCommunityIds}
        onToggleCommunity={onToggleCommunity}
        userNeighborhood={userNeighborhood}
      />

      <Button
        onClick={onPost}
        disabled={!canPost}
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
