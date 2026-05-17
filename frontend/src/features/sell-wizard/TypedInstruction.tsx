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

  return (
    <p
      className="mt-3 text-4xl font-light text-white leading-snug tracking-wide text-center"
      style={{
        animation: exiting
          ? "wizardStepOut 300ms ease-in forwards"
          : "wizardStepIn 300ms ease-out both",
      }}
    >
      {typedInstruction}
      {!typedInstruction.endsWith("?") && !typedInstruction.endsWith(".") && <span className="animate-pulse">|</span>}
    </p>
  );
}
