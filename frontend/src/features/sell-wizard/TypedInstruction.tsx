import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";

export function TypedInstruction({ bulkReviewPhase, exiting, stepLabel, onBack }: {
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
  exiting: boolean;
  // Optional override for the eyebrow label. When unset, the eyebrow defaults
  // to the bulk-flow step counter (Step 2 of 5 ... Step 5 of 5). Single-listing
  // callers pass their own (e.g. "Step 4 of 4").
  stepLabel?: string;
  // Optional back action — when provided, a back chevron renders to the left
  // of the eyebrow on the same row.
  onBack?: () => void;
}) {
  const [typedInstruction, setTypedInstruction] = useState("");

  useEffect(() => {
    if (
      bulkReviewPhase !== "review" &&
      bulkReviewPhase !== "reason" &&
      bulkReviewPhase !== "cards" &&
      bulkReviewPhase !== "pickup"
    ) {
      setTypedInstruction("");
      return;
    }
    const full = bulkReviewPhase === "review"
      ? "What are you selling?"
      : bulkReviewPhase === "reason"
        ? "Why are you selling?"
        : bulkReviewPhase === "pickup"
          ? "Where are you selling?"
          : "Confirm the listing details below.";
    let i = 0;
    setTypedInstruction("");
    let intervalId: ReturnType<typeof setInterval>;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        i++;
        setTypedInstruction(full.slice(0, i));
        if (i >= full.length) clearInterval(intervalId);
      }, 28);
    }, 320);
    return () => { clearTimeout(delayId); clearInterval(intervalId); };
  }, [bulkReviewPhase]);

  if (
    bulkReviewPhase !== "review" &&
    bulkReviewPhase !== "reason" &&
    bulkReviewPhase !== "cards" &&
    bulkReviewPhase !== "pickup"
  ) return null;

  const defaultStepLabel = bulkReviewPhase === "review"
    ? "Step 2 of 5"
    : bulkReviewPhase === "reason"
      ? "Step 3 of 5"
      : bulkReviewPhase === "pickup"
        ? "Step 5 of 5"
        : "Step 4 of 5";
  const eyebrow = stepLabel ?? defaultStepLabel;

  return (
    <div
      className="mt-3 text-center"
      style={{
        animation: exiting
          ? "wizardStepOut 300ms ease-in forwards"
          : "wizardStepIn 300ms ease-out both",
      }}
    >
      <div className="relative flex items-center justify-center mb-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-0 size-6 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <ChevronRight className="size-3.5 rotate-180" />
          </button>
        )}
        <p className="text-[12px] font-semibold text-muted">
          {eyebrow}
        </p>
      </div>
      <p className="text-4xl sm:text-5xl font-extrabold text-ink leading-[1.05] tracking-display">
        {typedInstruction}
        {!typedInstruction.endsWith("?") && !typedInstruction.endsWith(".") && (
          <span className="text-primary motion-safe:animate-pulse">|</span>
        )}
      </p>
    </div>
  );
}
