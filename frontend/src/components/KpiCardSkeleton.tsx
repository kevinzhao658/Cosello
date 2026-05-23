import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one KPI tile on the Listings tab (4 per row at xl breakpoint).
 * Matches the real KPI card shape: label / value / sub.
 */
export function KpiCardSkeleton() {
  return (
    <div className="bg-surface-card border border-hairline rounded-md p-4 space-y-2">
      <Skeleton className="h-2 w-3/5" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-2 w-4/5" />
    </div>
  );
}
