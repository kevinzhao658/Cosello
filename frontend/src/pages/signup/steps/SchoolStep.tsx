// frontend/src/pages/signup/steps/SchoolStep.tsx
// School step: search + pills below search bar (search hidden at 2). School disclosure always shown.
// Icon chip + TypedHeadline are in the wizard shell.
import { useState } from "react";
import { MapPin, ShieldCheck } from "lucide-react";
import { useSchoolSearch, type School } from "../../../lib/useSchoolSearch";

export interface SchoolStepProps {
  token: string;
  selected: School[];
  onAdd: (s: School) => void;
  onRemove: (id: number) => void;
}

export function SchoolStep({ token, selected, onAdd, onRemove }: SchoolStepProps) {
  const [query, setQuery] = useState("");
  const results = useSchoolSearch(query, token).filter(
    (r) => !selected.some((s) => s.id === r.id),
  );
  const full = selected.length >= 2;

  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-soft mb-[5px]">Schools</div>

      {/* Search input — hidden when 2 schools selected */}
      {!full && (
        <div className="relative">
          <input
            type="text"
            className="w-full border-[1.5px] border-border-strong rounded-sm px-[13px] py-[11px] text-sm text-ink bg-canvas placeholder:text-muted-soft font-sans focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow]"
            placeholder="Search your school"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          {results.length > 0 && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-canvas border border-hairline rounded-md shadow-overlay overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onAdd(r);
                    setQuery("");
                  }}
                  className="w-full text-left border-none bg-transparent px-[13px] py-[11px] text-[13px] text-ink cursor-pointer font-sans flex items-center gap-[9px] hover:bg-surface-soft"
                >
                  <MapPin className="w-[15px] h-[15px] text-muted-soft flex-none" />
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pills below search */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-[7px] text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full py-[6px] pl-[13px] pr-[7px]"
            >
              {s.name}
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                className="border-none bg-surface-strong text-muted w-[18px] h-[18px] rounded-full cursor-pointer flex items-center justify-center hover:text-ink text-base leading-none"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* School disclosure — always shown */}
      <div className="flex gap-[9px] items-start mt-4 px-[13px] py-[11px] border border-hairline bg-surface-soft rounded-lg">
        <ShieldCheck className="w-[15px] h-[15px] text-primary-text flex-none mt-[1px]" />
        <p className="m-0 text-[11.5px] text-muted leading-[1.5]">
          We&apos;ll let others{" "}
          <strong className="text-body font-semibold">from your school</strong> know you
          attended too, so it&apos;s easier to sell to people you trust. You can change
          this in Settings.
        </p>
      </div>
    </div>
  );
}
