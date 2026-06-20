// frontend/src/components/CircleByline.tsx
import { GraduationCap } from "lucide-react";
import type { ListingCircles } from "../lib/types";

interface CircleBylineProps {
  circles?: ListingCircles;
}

const MEDAL: Record<1 | 2 | 3, { label: string; cls: string }> = {
  1: { label: "1st", cls: "bg-medal-gold text-medal-gold-ink" },
  2: { label: "2nd", cls: "bg-medal-silver text-medal-silver-ink" },
  3: { label: "3rd", cls: "bg-medal-bronze text-medal-bronze-ink" },
};

/** Insight byline: connection medal ribbon (left) + always-on school (right).
 *  Connection blank past 3rd; school bold when it's the viewer's own. */
export function CircleByline({ circles }: CircleBylineProps) {
  const degree = circles?.connection.degree ?? null;
  const school = circles?.school ?? null;
  const medal = degree ? MEDAL[degree] : null;

  return (
    <div className="flex items-center justify-between gap-2 min-h-[2.25rem] mb-1">
      {medal ? (
        <span
          className={`inline-flex items-center pl-2 pr-3 py-1 text-[11px] font-extrabold leading-none ${medal.cls}`}
          style={{ clipPath: "polygon(0 0,100% 0,calc(100% - 7px) 50%,100% 100%,0 100%)" }}
        >
          {medal.label}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}

      {school ? (
        <span
          title={school.fullName}
          className={`inline-flex items-center gap-1 min-w-0 text-xs text-ink ${
            school.isMine ? "font-extrabold" : "font-medium"
          }`}
        >
          <GraduationCap className="size-[15px] shrink-0" />
          <span className="truncate">{school.shortName}</span>
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
    </div>
  );
}
