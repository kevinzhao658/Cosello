import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Loader2 } from "lucide-react";
import { CommunityPicker, type CommunityOption } from "../CommunityPicker";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

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
  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div>
        <label htmlFor="bulk-pickup-location" className="text-xs text-muted">
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

      <CommunityPicker
        availableCommunities={availableCommunities}
        selectedCommunityIds={selectedCommunityIds}
        onToggleCommunity={onToggleCommunity}
        userNeighborhood={userNeighborhood}
      />

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
