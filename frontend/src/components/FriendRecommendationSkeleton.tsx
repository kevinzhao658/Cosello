import { Skeleton } from "./ui/Skeleton";

/**
 * Skeleton for one row in the Friends-You-May-Know recommendations list:
 * avatar + name + mutual-friends line + CTA placeholder.
 */
export function FriendRecommendationSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-hairline-soft">
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 rounded-md shrink-0" />
    </div>
  );
}
