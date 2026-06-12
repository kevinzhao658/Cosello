import { Button } from "../../components/ui/button";
import { TypedInstruction } from "./TypedInstruction";
import { NYC_ZIPS } from "../../lib/nycZips";

interface SinglePickupStepProps {
  postPickupLocation: string;
  setPostPickupLocation: (v: string) => void;
  /** ZIP selected for this listing (required). */
  postPickupZip: string;
  setPostPickupZip: (zip: string) => void;
  onBack: () => void;
  onPost: () => void;
  isAuthenticated: boolean;
  /** Seller's profile ZIP — used to prefill the dropdown. */
  userZipCode: string | null;
  instructionExiting: boolean;
}

export function SinglePickupStep({
  postPickupLocation,
  setPostPickupLocation,
  postPickupZip,
  setPostPickupZip,
  onBack,
  onPost,
  isAuthenticated,
  userZipCode,
  instructionExiting,
}: SinglePickupStepProps) {
  // postPickupZip is seeded from the user's profile ZIP by the SellWizard
  // effect before this step renders, so we bind directly to it — no local
  // display-only fallback needed.
  const canPost = postPickupZip !== "";

  return (
    <>
      <TypedInstruction
        bulkReviewPhase="pickup"
        exiting={instructionExiting}
        onBack={onBack}
      />
      <div className="mt-8 space-y-5 max-w-md mx-auto">
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
                value={postPickupZip}
                onChange={(e) => {
                  setPostPickupZip(e.target.value);
                  // Keep legacy free-text field in sync so the checklist signal fires.
                  setPostPickupLocation(e.target.value);
                }}
                required
                aria-label="ZIP code"
                className="w-full h-10 px-3 rounded-md border border-hairline bg-canvas text-sm text-ink focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 appearance-none"
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
        <Button
          onClick={onPost}
          disabled={!canPost}
          className="w-full disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {isAuthenticated ? "Post listing" : "Sign in to Post"}
        </Button>
      </div>
    </>
  );
}
