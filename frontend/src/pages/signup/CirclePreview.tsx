// frontend/src/pages/signup/CirclePreview.tsx
import { Building2, GraduationCap, Users } from "lucide-react";

export interface CirclePreviewProps {
  building: boolean;
  school: boolean;
  mutualFriends: boolean;
}

/** The fixed three-slot byline used across registration, feed, account, and
 *  profile. Lit (violet) when shared; faded otherwise. No tooltips here. */
export function CirclePreview({ building, school, mutualFriends }: CirclePreviewProps) {
  const slot = (on: boolean) =>
    `inline-flex items-center justify-center transition-[color,opacity] ${
      on ? "text-primary opacity-100" : "text-muted-soft opacity-30"
    }`;
  return (
    <div className="flex items-center justify-evenly h-6">
      <span className={slot(building)}><Building2 className="size-[18px]" /></span>
      <span className={slot(school)}><GraduationCap className="size-[18px]" /></span>
      <span className={slot(mutualFriends)}><Users className="size-[18px]" /></span>
    </div>
  );
}
