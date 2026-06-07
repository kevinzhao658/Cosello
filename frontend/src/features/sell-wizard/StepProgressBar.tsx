interface StepProgressBarProps {
  current: number;
  total: number;
}

// Connected numbered step bubbles spread across the wizard content width.
// Completed steps are solid violet, the current step is a violet-ringed outline,
// upcoming steps are quiet grey outlines. A connector line behind the bubbles
// fills up to the current step. No visible "Step X of Y" text — the bubbles carry
// the number; an aria-label keeps it accessible. Only the line fill animates.
export function StepProgressBar({ current, total }: StepProgressBarProps) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  // Line connects the centers of the first → last bubble; fill reaches the
  // current bubble's center.
  const fillPct = total > 1 ? ((current - 1) / (total - 1)) * 100 : 0;

  return (
    <div
      className="mt-5 mb-6 max-w-md mx-auto px-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Step ${current} of ${total}`}
    >
      <div className="relative flex items-center justify-between">
        {/* Connector track + violet fill, behind the bubbles. */}
        <div
          className="absolute left-2.5 right-2.5 top-1/2 -translate-y-1/2 h-0.5 bg-hairline"
          aria-hidden="true"
        >
          <div
            className="h-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${fillPct}%` }}
          />
        </div>

        {steps.map((n) => {
          const done = n < current;
          const isCurrent = n === current;
          return (
            <span
              key={n}
              aria-current={isCurrent ? "step" : undefined}
              className={`relative z-10 flex items-center justify-center size-5 rounded-full text-[10px] font-bold transition-colors ${
                done
                  ? "bg-primary text-on-primary"
                  : isCurrent
                    ? "bg-canvas text-primary border-2 border-primary"
                    : "bg-canvas text-muted-soft border border-hairline"
              }`}
              style={isCurrent ? { boxShadow: "0 0 0 3px rgba(124,58,237,0.16)" } : undefined}
            >
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}
