import { Skeleton } from "./ui/Skeleton";

// Mirrors ListingCard: community byline → rounded photo → title/location/price.
export function ListingCardSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Skeleton className="size-5 rounded-full shrink-0" />
        <Skeleton className="h-3 flex-1 max-w-[50%]" />
      </div>
      <Skeleton className="aspect-square w-full rounded-lg" />
      <div className="pt-2 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}
