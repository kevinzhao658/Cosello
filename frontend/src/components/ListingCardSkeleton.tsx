import { Skeleton } from "./ui/Skeleton";

// Mirrors the real listing card shape (trust band → aspect-square photo →
// details column). Vertical layout fits the marketplace grid's narrow mobile
// cells (~155px on a 375px viewport) without overflowing into neighbors.
export function ListingCardSkeleton() {
  return (
    <div className="bg-canvas border border-hairline rounded-md overflow-hidden">
      {/* Trust band */}
      <div className="flex items-center gap-2 px-3 py-2 bg-primary-soft/60 border-b border-hairline">
        <Skeleton className="size-3 rounded-full shrink-0" />
        <Skeleton className="h-3 flex-1 max-w-[60%]" />
      </div>
      {/* Photo */}
      <Skeleton className="aspect-square w-full rounded-none" />
      {/* Details */}
      <div className="p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
