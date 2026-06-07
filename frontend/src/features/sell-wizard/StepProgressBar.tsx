interface StepProgressBarProps {
  current: number;
  total: number;
  /** One-word label per step (length === total). */
  labels: string[];
  /** Jump to a completed step. Called only for steps the bar renders as clickable. */
  onStepClick?: (step: number) => void;
}

// Connected numbered step bubbles, each with a one-word label above. Completed
// steps are solid violet (and clickable as a shortcut back to that step), the
// current step is a violet-ringed outline, upcoming steps are quiet greys. A
// connector line behind the bubbles fills up to the current step. Equal-width
// columns keep each label centered over its bubble.
export function StepProgressBar({ current, total, labels, onStepClick }: StepProgressBarProps) {
  const steps = Array.from({ length: total }, (_, i) => i + 1);
  // Fill reaches the current bubble's center along the line (bubble 1 → last).
  const fillPct = total > 1 ? ((current - 1) / (total - 1)) * 100 : 0;
  // The line spans bubble-1 center → bubble-last center; each is half a column
  // in from the edge.
  const lineInset = `${50 / total}%`;

  return (
    <div
      className="mt-5 mb-6 max-w-md mx-auto px-1"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`Step ${current} of ${total}`}
    >
      {/* Labels row */}
      <div className="flex mb-1.5">
        {steps.map((n) => {
          const done = n < current;
          const isCurrent = n === current;
          return (
            <span
              key={n}
              className={`flex-1 text-center text-[9px] font-semibold uppercase tracking-wide truncate px-0.5 ${
                isCurrent ? "text-primary" : done ? "text-muted" : "text-muted-soft"
              }`}
            >
              {labels[n - 1] ?? ""}
            </span>
          );
        })}
      </div>

      {/* Bubbles row with connector line behind */}
      <div className="relative flex">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-hairline"
          style={{ left: lineInset, right: lineInset }}
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
          // Only completed bulk-ish steps (past, not the upload start) are jumpable.
          const clickable = Boolean(onStepClick) && n < current && n > 1;
          const bubbleClass = `flex items-center justify-center size-5 rounded-full text-[10px] font-bold transition-colors ${
            done
              ? "bg-primary text-on-primary"
              : isCurrent
                ? "bg-canvas text-primary border-2 border-primary"
                : "bg-canvas text-muted-soft border border-hairline"
          }`;
          return (
            <div key={n} className="flex-1 flex justify-center relative z-10">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(n)}
                  aria-label={`Go to step ${n}: ${labels[n - 1] ?? ""}`}
                  className={`${bubbleClass} cursor-pointer hover:ring-2 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
                >
                  {n}
                </button>
              ) : (
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={bubbleClass}
                  style={isCurrent ? { boxShadow: "0 0 0 3px rgba(124,58,237,0.16)" } : undefined}
                >
                  {n}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
