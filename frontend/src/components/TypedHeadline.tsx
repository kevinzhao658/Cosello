// frontend/src/components/TypedHeadline.tsx
// Generalised typed-headline component modelled after
// src/features/sell-wizard/TypedInstruction.tsx.
//
// Props:
//   text — the full string to type out
//
// Behaviour:
//   - On mount (and whenever `text` changes), waits 320ms then types one
//     character every 28ms.
//   - Shows a pulsing primary caret `|` while typing; hides it once the
//     full string is rendered.
//   - Wraps in the global `wizardStepIn` animation (keyframe defined in
//     src/styles/tailwind.css).
//   - All timers are cleaned up on unmount and on `text` change.

import { useState, useEffect } from "react";

export interface TypedHeadlineProps {
  text: string;
}

export function TypedHeadline({ text }: TypedHeadlineProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    let i = 0;
    setTyped("");
    let intervalId: ReturnType<typeof setInterval>;
    const delayId = setTimeout(() => {
      intervalId = setInterval(() => {
        i++;
        setTyped(text.slice(0, i));
        if (i >= text.length) clearInterval(intervalId);
      }, 28);
    }, 320);
    return () => {
      clearTimeout(delayId);
      clearInterval(intervalId);
    };
  }, [text]);

  const isTyping = typed.length < text.length;

  return (
    <div
      className="text-center"
      style={{ animation: "wizardStepIn 300ms ease-out both" }}
    >
      <p className="text-4xl sm:text-5xl font-extrabold text-ink leading-[1.05] tracking-display">
        {typed}
        {isTyping && (
          <span className="text-primary motion-safe:animate-pulse">|</span>
        )}
      </p>
    </div>
  );
}
