interface StepProgressBarProps {
  current: number;
  total: number;
}

// Static glossy-capsule progress bar. The fill width is current/total; only the
// width animates (on step change) — no shimmer/motion, so no reduced-motion case.
export function StepProgressBar({ current, total }: StepProgressBarProps) {
  const pct = Math.max(0, Math.min(100, (current / total) * 100));
  return (
    <div className="mt-3 max-w-[300px] mx-auto">
      <div className="h-2 rounded-full bg-hairline overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(#9a63f3, var(--primary) 55%, #6a28d9)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.12)",
          }}
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted text-center">
        Step {current} of {total}
      </p>
    </div>
  );
}
