import { cn } from "./utils";

type SkeletonProps = {
  className?: string;
};

/**
 * Skeleton primitive. Renders a muted block with a shimmer sweep overlay.
 *
 * Implementation: a `::before` pseudo-element translates across the parent
 * (GPU-composited `transform`, zero paint cost per frame). The base color is
 * `bg-surface-strong`; the sweep is a transparent → white/15 → transparent
 * gradient. Gated behind `motion-safe:` so users with `prefers-reduced-motion`
 * see a static block.
 *
 * Animation token: `--animate-shimmer` in `styles/theme.css`.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-strong",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-white/15 before:to-transparent",
        "motion-safe:before:animate-shimmer",
        className,
      )}
      aria-hidden="true"
    />
  );
}
