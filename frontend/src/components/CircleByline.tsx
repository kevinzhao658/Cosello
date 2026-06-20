// frontend/src/components/CircleByline.tsx
import { MapPin, GraduationCap, Users } from "lucide-react";
import type { ListingCircles } from "../lib/types";

interface CircleBylineProps {
  circles?: ListingCircles;
  /** Show hover tooltips on lit slots (feed/profile). Off for the consent preview. */
  tooltips?: boolean;
  /** Render the numeric mutual-friends count beside the icon. Default true. */
  showFriendCount?: boolean;
}

interface SlotProps {
  lit: boolean;
  label: string;
  count?: number;
  tooltips: boolean;
  children: React.ReactNode; // the icon
}

function Slot({ lit, label, count, tooltips, children }: SlotProps) {
  return (
    <span
      className={`relative group inline-flex items-center gap-1 transition-[color,opacity] ${
        lit ? "text-primary opacity-100" : "text-muted-soft opacity-30"
      }`}
    >
      {children}
      {lit && typeof count === "number" && count > 0 && (
        <span className="text-[11px] font-bold text-primary-text">{count}</span>
      )}
      {lit && tooltips && (
        <span className="pointer-events-none absolute bottom-[140%] left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-[10px] font-semibold text-on-primary opacity-0 transition-opacity group-hover:opacity-100">
          {label}
        </span>
      )}
    </span>
  );
}

/** Fixed three positions (neighborhood · school · mutual friends), evenly
 *  distributed. Lit when the viewer shares a revealed circle with the seller;
 *  faded otherwise. Faded slots are uniform and carry no tooltip. */
export function CircleByline({ circles, tooltips = true, showFriendCount = true }: CircleBylineProps) {
  const neighborhood = circles?.neighborhood.shared ?? false;
  const school = circles?.school.shared ?? false;
  const friendCount = circles?.mutualFriends.count ?? 0;
  const directFriend = circles?.mutualFriends.directFriend ?? false;

  const friendLit = friendCount > 0 || directFriend;
  const friendTooltip =
    directFriend && friendCount > 0
      ? `Friend · ${friendCount} mutual`
      : directFriend
        ? "Friend"
        : `${friendCount} mutual friends`;

  return (
    <div className="flex items-center justify-evenly h-6 mb-1.5">
      <Slot lit={neighborhood} label={circles?.neighborhood.label ?? "Neighborhood"} tooltips={tooltips}>
        <MapPin className="size-[17px]" />
      </Slot>
      <Slot lit={school} label={circles?.school.label || "School"} tooltips={tooltips}>
        <GraduationCap className="size-[17px]" />
      </Slot>
      <Slot
        lit={friendLit}
        label={friendTooltip}
        count={showFriendCount ? friendCount : undefined}
        tooltips={tooltips}
      >
        <Users className="size-[17px]" />
      </Slot>
    </div>
  );
}
