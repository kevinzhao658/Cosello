import { Skeleton } from "./ui/Skeleton";

export function NotificationItemSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-hairline">
      <Skeleton className="size-9 rounded-md shrink-0" />
      <div className="flex-1 min-w-0 space-y-2 pt-1">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
