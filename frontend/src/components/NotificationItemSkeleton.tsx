import { Skeleton } from "./ui/Skeleton";

export function NotificationItemSkeleton() {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 border-b border-white/5">
      <Skeleton className="size-7 rounded-full shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
