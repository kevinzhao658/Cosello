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
        // Tailwind v4 no longer auto-injects `content: ''` for `before:`
        // variants — without it the pseudo-element is empty and the gradient
        // never renders. Keep this explicitly.
        // Do NOT add `before:-translate-x-full` here: Tailwind v4's translate
        // utility uses the new `translate:` CSS property which stacks
        // additively with the keyframe's `transform: translateX(...)`,
        // making the sweep run -200% → 0% (gradient lands halfway then
        // snaps back). The shimmer keyframe handles the initial position.
        "before:content-[''] before:absolute before:inset-0",
        // Base is #EAEAEA (light grey). The sweep darkens slightly so it's
        // visible against a light surface — white/X would be near-invisible.
        "before:bg-gradient-to-r before:from-transparent before:via-black/10 before:to-transparent",
        "motion-safe:before:animate-shimmer",
        className,
      )}
      aria-hidden="true"
    />
  );
}
