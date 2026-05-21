import { Skeleton } from "./ui/Skeleton";

export function ListingCardSkeleton() {
  return (
    <div className="flex gap-5 p-4 bg-white/5 rounded-lg border border-white/10">
      <Skeleton className="w-28 h-28 shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
