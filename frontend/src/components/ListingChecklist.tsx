import { Check } from "lucide-react";

interface ListingChecklistProps {
  heading: string;
  rows: ReadonlyArray<readonly [string, boolean]>;
}

export function ListingChecklist({ heading, rows }: ListingChecklistProps) {
  return (
    <div className="bg-canvas border border-hairline rounded-md p-4">
      <p className="text-xs font-semibold text-muted mb-3">
        {heading}
      </p>
      <ul className="space-y-2">
        {rows.map(([label, done]) => (
          <li key={label} className="flex items-center gap-2.5 text-sm">
            {/* Check circle — pops in with scale overshoot when done flips true.
                motion-safe: gates the animation so reduced-motion users get an
                instant state change. The `key` on the <li> keeps stable DOM
                so toggling the className is enough to fire/stop the keyframe. */}
            <span
              aria-hidden="true"
              className={`inline-flex items-center justify-center size-4 rounded-full border shrink-0 ${
                done
                  ? "bg-primary border-primary text-on-primary motion-safe:animate-[check-pop_250ms_ease-out_both]"
                  : "bg-canvas border-hairline text-transparent"
              }`}
            >
              <Check className="size-3" />
            </span>
            {/* Label — wraps in a relative container so the animated
                strikethrough line can be absolutely positioned over it. */}
            <span className={`relative ${done ? "text-muted" : "text-body"}`}>
              {label}
              {/* Strikethrough line: draws left→right over ~300ms when done.
                  Width transitions from 0 → 100%; instant for reduced-motion
                  (transition-none via motion-reduce:). The line inherits the
                  muted text colour so it's always on-palette. */}
              <span
                aria-hidden="true"
                className={`absolute left-0 top-1/2 h-px bg-current -translate-y-1/2 transition-[width] motion-reduce:transition-none ease-out duration-300 ${
                  done ? "w-full" : "w-0"
                }`}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
