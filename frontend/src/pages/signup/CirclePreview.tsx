// frontend/src/pages/signup/CirclePreview.tsx
import { CircleByline } from "../../components/CircleByline";

export interface CirclePreviewProps {
  neighborhood: boolean;
  school: boolean;
  mutualFriends: boolean;
}

/** Consent-preview variant: lit/faded only, no tooltips, no friend count digit. */
export function CirclePreview({ neighborhood, school, mutualFriends }: CirclePreviewProps) {
  return (
    <CircleByline
      tooltips={false}
      showFriendCount={false}
      circles={{
        neighborhood: { shared: neighborhood, label: "Neighborhood" },
        school: { shared: school, label: "" },
        mutualFriends: { count: 0, directFriend: mutualFriends },
      }}
    />
  );
}
