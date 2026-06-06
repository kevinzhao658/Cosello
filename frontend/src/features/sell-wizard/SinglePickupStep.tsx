import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { CommunityPicker, type CommunityOption } from "./CommunityPicker";
import { TypedInstruction } from "./TypedInstruction";

interface SinglePickupStepProps {
  postPickupLocation: string;
  setPostPickupLocation: (v: string) => void;
  onBack: () => void;
  onPost: () => void;
  isAuthenticated: boolean;
  availableCommunities: CommunityOption[];
  selectedCommunityIds: number[];
  onToggleCommunity: (id: number) => void;
  userNeighborhood: string | null;
  instructionExiting: boolean;
}

export function SinglePickupStep({
  postPickupLocation, setPostPickupLocation, onBack, onPost, isAuthenticated,
  availableCommunities, selectedCommunityIds, onToggleCommunity, userNeighborhood,
  instructionExiting,
}: SinglePickupStepProps) {
  return (
    <>
      <TypedInstruction
        bulkReviewPhase="pickup"
        exiting={instructionExiting}
        stepLabel="Step 4 of 4"
        onBack={onBack}
      />
      <div className="mt-8 space-y-5 max-w-md mx-auto">
        <div>
          <label htmlFor="single-pickup-location" className="text-xs text-muted uppercase tracking-wider">
            Pickup location
          </label>
          <Input
            id="single-pickup-location"
            value={postPickupLocation}
            onChange={(e) => setPostPickupLocation(e.target.value)}
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
          className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {isAuthenticated ? "Post listing" : "Sign in to Post"}
        </Button>
      </div>
    </>
  );
}
