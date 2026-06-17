// frontend/src/pages/signup/steps/SchoolStep.tsx
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { Input } from "../../../components/ui/input";
import { useSchoolSearch, type School } from "../../../lib/useSchoolSearch";
import { TypedHeadline } from "../../../components/TypedHeadline";

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
    <div className="space-y-3">
      <div className="size-9 rounded-md bg-primary-soft text-primary-text flex items-center justify-center">
        <GraduationCap className="size-5" />
      </div>
      <TypedHeadline text="Add your school" />
      <p className="text-sm text-muted text-center">We use this to connect you with other students or alumni from your university.</p>
      {!full && (
        <div className="relative">
          <Input placeholder="Search your school" value={query} onChange={(e) => setQuery(e.target.value)} />
          {results.length > 0 && (
            <div className="absolute z-50 mt-1 w-full max-h-44 overflow-y-auto rounded-md border border-border-strong bg-canvas shadow-overlay">
              {results.map((r) => (
                <button key={r.id} type="button"
                  onClick={() => { onAdd(r); setQuery(""); }}
                  className="w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft">
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {selected.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-2 text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full pl-3 pr-1.5 py-1">
            {s.name}
            <button type="button" onClick={() => onRemove(s.id)}
              className="size-[18px] rounded-full bg-surface-strong text-muted hover:text-ink" aria-label="Remove">×</button>
          </span>
        ))}
      </div>
      {full && <p className="text-[11px] text-muted-soft">Maximum of 2 schools. Remove one to add another.</p>}
    </div>
  );
}
