import { useState, useEffect } from "react";

export function TypedInstruction({ bulkReviewPhase, exiting }: {
  bulkReviewPhase: "review" | "reason" | "cards" | "pickup" | null;
  exiting: boolean;
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
          ? "Where do you want to meet?"
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

  const eyebrow = bulkReviewPhase === "review"
    ? "Items"
    : bulkReviewPhase === "reason"
      ? "Reason"
      : bulkReviewPhase === "pickup"
        ? "Pickup"
        : "Details";

  return (
    <div
      className="mt-3 text-center"
      style={{
        animation: exiting
          ? "wizardStepOut 300ms ease-in forwards"
          : "wizardStepIn 300ms ease-out both",
      }}
    >
      <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-muted mb-2">
        {eyebrow}
      </p>
      <p className="text-4xl sm:text-5xl font-extrabold text-ink leading-[1.05] tracking-display">
        {typedInstruction}
        {!typedInstruction.endsWith("?") && !typedInstruction.endsWith(".") && (
          <span className="text-primary motion-safe:animate-pulse">|</span>
        )}
      </p>
    </div>
  );
}
