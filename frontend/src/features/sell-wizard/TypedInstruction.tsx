import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";

export function TypedInstruction({ bulkReviewPhase, exiting, onBack }: {
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
  exiting: boolean;
  // Optional back action — when provided, a back chevron renders above the
  // typed headline.
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
          ? "What is a good pickup spot?"
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

  return (
    <div
      className="mt-3 text-center"
      style={{
        animation: exiting
          ? "wizardStepOut 300ms ease-in forwards"
          : "wizardStepIn 300ms ease-out both",
      }}
    >
      {onBack && (
        <div className="relative flex items-center justify-center mb-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-0 size-6 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <ChevronRight className="size-3.5 rotate-180" />
          </button>
        </div>
      )}
      <p className="text-4xl sm:text-5xl font-extrabold text-ink leading-[1.05] tracking-display">
        {typedInstruction}
        {!typedInstruction.endsWith("?") && !typedInstruction.endsWith(".") && (
          <span className="text-primary motion-safe:animate-pulse">|</span>
        )}
      </p>
    </div>
  );
}
