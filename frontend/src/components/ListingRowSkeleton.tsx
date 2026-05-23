import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one row of the compact Listings table on the Overview tab.
 * Mirrors the 3-col grid template used by both Selling and Buying tables:
 * Item (thumb + 2-line text stack) / Price / Status pill.
 */
export function ListingRowSkeleton() {
  return (
    <div className="w-full grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 items-center py-3 border-b border-hairline-soft">
      <div className="flex items-center gap-3 min-w-0">
        <Skeleton className="size-10 rounded-md shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-2.5 w-1/3" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
      <Skeleton className="justify-self-end h-3.5 w-10" />
      <Skeleton className="justify-self-end h-4 w-14 rounded-full" />
    </div>
  );
}
