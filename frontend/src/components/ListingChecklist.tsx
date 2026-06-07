import { Check } from "lucide-react";

interface ListingChecklistProps {
  heading: string;
  rows: ReadonlyArray<readonly [string, boolean]>;
}

export function ListingChecklist({ heading, rows }: ListingChecklistProps) {
  return (
    <div className="bg-canvas border border-hairline rounded-md p-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        {heading}
      </p>
      <ul className="space-y-2">
        {rows.map(([label, done]) => (
          <li key={label} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className={`inline-flex items-center justify-center size-4 rounded-full border ${
                done
                  ? "bg-primary border-primary text-on-primary"
                  : "bg-canvas border-hairline text-transparent"
              }`}
            >
              <Check className="size-3" />
            </span>
            <span className={done ? "text-muted line-through" : "text-body"}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
