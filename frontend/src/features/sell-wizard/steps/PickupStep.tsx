import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Loader2 } from "lucide-react";

export interface PickupStepProps {
  bulkPickupLocation: string;
  bulkItemsCount: number;
  isPostingBulk: boolean;
  isAuthenticated: boolean;
  onChange: (value: string) => void;
  onPost: () => void;
}

export function PickupStep({
  bulkPickupLocation, bulkItemsCount, isPostingBulk, isAuthenticated, onChange, onPost,
}: PickupStepProps) {
  return (
    <div className="space-y-4 max-w-md mx-auto">
      <div>
        <label htmlFor="bulk-pickup-location" className="text-xs text-muted uppercase tracking-wider">Pickup location</label>
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
      <Button
        onClick={onPost}
        disabled={isPostingBulk}
        className="w-full disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
