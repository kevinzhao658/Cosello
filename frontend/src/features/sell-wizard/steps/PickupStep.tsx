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
        <label className="text-xs text-white/40 uppercase tracking-wider">Pickup location</label>
        <Input
          value={bulkPickupLocation}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Lower East Side, NYC"
          maxLength={200}
          className="mt-1 bg-white/5 border-white/20 text-white"
        />
        <p className="text-[10px] text-white/30 mt-1.5 leading-relaxed">
          Your address will not be shared until pickup is confirmed.
        </p>
      </div>
      <Button
        onClick={onPost}
        disabled={isPostingBulk}
        className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40 disabled:cursor-not-allowed"
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
