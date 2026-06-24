// frontend/src/components/ui/SchoolPicker.tsx
// Shared school search + chip-list component.
//
// Both call sites (SchoolStep and CircleSettings) have the same UX:
//   - Text input that searches schools via useSchoolSearch
//   - Dropdown of matching results (hidden when `max` is reached)
//   - Removable pill chips for each selected school
//   - "Maximum" note when capped
//
// The component is generic over the item ID: callers normalise their
// per-item id into `{ id: number; name: string }` before passing `selected`.
// The `onAdd` callback receives the raw `School` (seed id) so callers can
// decide how to persist it (e.g. POST /api/circles/schools?seed_id=).
import { useState } from "react";
import { X } from "lucide-react";
import { useSchoolSearch, type School } from "../../lib/useSchoolSearch";
import { FOCUS_RING } from "../../lib/ui-constants";

export interface SchoolPickerItem {
  id: number;
  name: string;
}

export interface SchoolPickerProps {
  /** Currently selected schools, normalised to `{ id, name }` by the caller */
  selected: SchoolPickerItem[];
  /** Called with the raw School from the search results when the user picks one */
  onAdd: (school: School) => void;
  /** Called with the item id when the user removes a chip */
  onRemove: (id: number) => void;
  /** Maximum number of selections; hides the search input once reached */
  max?: number;
  /** Placeholder text for the search input */
  placeholder?: string;
}

export function SchoolPicker({
  selected,
  onAdd,
  onRemove,
  max = 2,
  placeholder = "Search your school",
}: SchoolPickerProps) {
  const [query, setQuery] = useState("");
  const results = useSchoolSearch(query).filter(
    (r) => !selected.some((s) => s.name === r.name),
  );
  const full = selected.length >= max;

  return (
    <div>
      {/* Chips for selected schools */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-2 text-xs font-semibold text-ink bg-surface-soft border border-hairline rounded-full pl-3 pr-1.5 py-1"
            >
              {s.name}
              <button
                type="button"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
                className={`size-[18px] rounded-full bg-surface-strong text-muted hover:text-ink flex items-center justify-center ${FOCUS_RING}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input — hidden when capped */}
      {!full && (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className={`w-full text-sm text-ink px-3 py-2 border border-border-strong rounded-sm bg-canvas placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow] ${FOCUS_RING}`}
          />
          {results.length > 0 && query.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-44 overflow-y-auto rounded-md border border-hairline bg-canvas shadow-overlay">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onAdd(r);
                    setQuery("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm text-ink hover:bg-surface-soft ${FOCUS_RING}`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cap note */}
      {full && (
        <p className="text-[11px] text-muted-soft mt-1">
          Maximum of {max} {max === 1 ? "school" : "schools"}. Remove one to add another.
        </p>
      )}
    </div>
  );
}
