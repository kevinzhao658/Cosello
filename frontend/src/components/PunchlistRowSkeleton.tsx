import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one collapsed category row in the Overview Punchlist panel:
 * icon + label + count + CTA placeholder.
 */
export function PunchlistRowSkeleton() {
  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-hairline-soft">
      <Skeleton className="size-7 rounded-md shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-2 w-1/4" />
      </div>
      <Skeleton className="h-7 w-20 rounded-md shrink-0" />
    </li>
  );
}
