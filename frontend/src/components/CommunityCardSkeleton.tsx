import { Skeleton } from "./ui/Skeleton";

export function CommunityCardSkeleton() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-2 aspect-square flex flex-col items-center justify-center gap-1.5">
      <Skeleton className="size-10 rounded-full" />
      <div className="w-full flex flex-col items-center gap-1">
        <Skeleton className="h-2.5 w-3/4" />
        <Skeleton className="h-2 w-1/2" />
      </div>
    </div>
  );
}
