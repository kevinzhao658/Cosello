import { cn } from "./utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-strong", className)}
      aria-hidden="true"
    />
  );
}
