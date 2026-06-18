// frontend/src/pages/signup/CirclePreview.tsx
import { CircleByline } from "../../components/CircleByline";

export interface CirclePreviewProps {
  building: boolean;
  school: boolean;
  mutualFriends: boolean;
}

/** Consent-preview variant: lit/faded only, no tooltips, no friend count digit. */
export function CirclePreview({ building, school, mutualFriends }: CirclePreviewProps) {
  return (
    <CircleByline
      tooltips={false}
      showFriendCount={false}
      circles={{
        building: { shared: building, label: "Same building" },
        school: { shared: school, label: "" },
        mutualFriends: { count: 0, directFriend: mutualFriends },
      }}
    />
  );
}
