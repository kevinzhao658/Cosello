import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { ZIP_NEIGHBORHOOD } from "../lib/nycZips";
import { searchLocations } from "../lib/locationSearch";

interface LocationComboboxProps {
  /** The currently selected ZIP code (or "" for none). */
  value: string;
  /** Called with the newly selected ZIP when the user picks an option. */
  onChange: (zip: string) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Controlled type-to-filter location picker.
 *
 * When a valid ZIP is selected and the input is not focused it shows the ZIP
 * and its canonical neighborhood label. While editing it shows the raw query
 * and surfaces a filtered dropdown (max 6 items).
 *
 * Keyboard: ArrowUp / ArrowDown moves the highlighted option, Enter selects
 * it, Escape closes the list. Click-outside and blur also close the list.
 */
export function LocationCombobox({
  value,
  onChange,
  id,
  placeholder = "Search by ZIP or neighborhood",
  autoFocus = false,
}: LocationComboboxProps) {
  // The text shown in the input while the user is typing.
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // When value changes externally (e.g. modal opens with a pre-filled ZIP),
  // reset the query so the display label is computed from the value.
  useEffect(() => {
    if (!isFocused) {
      setQuery("");
    }
  }, [value, isFocused]);

  const results = isFocused && query.trim() !== "" ? searchLocations(query) : [];
  const showDropdown = isFocused && query.trim() !== "";

  // The text the input should display.
  const displayValue = (): string => {
    if (isFocused) return query;
    if (value && ZIP_NEIGHBORHOOD[value]) {
      return `${value} — ${ZIP_NEIGHBORHOOD[value]}`;
    }
    return "";
  };

  const selectOption = useCallback(
    (zip: string) => {
      onChange(zip);
      setQuery("");
      setIsFocused(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[highlightIndex];
      if (hit) selectOption(hit.zip);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsFocused(false);
      setQuery("");
      inputRef.current?.blur();
    }
  };

  // Click-outside: close the dropdown without clearing the value.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsFocused(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset highlight index when results change.
  useEffect(() => {
    setHighlightIndex(0);
  }, [results.length]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        value={displayValue()}
        placeholder={placeholder}
        onFocus={() => {
          setIsFocused(true);
          // Pre-fill query with the current ZIP so user can immediately refine.
          if (value && ZIP_NEIGHBORHOOD[value]) {
            setQuery(value);
          }
        }}
        onBlur={() => {
          // Defer so a mousedown on an option still fires before blur hides the list.
          setTimeout(() => {
            setIsFocused(false);
            setQuery("");
          }, 150);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlightIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className="w-full h-10 px-3 rounded-md border border-border-strong bg-canvas text-base text-ink md:text-sm placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
      />

      {showDropdown && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[300] bg-canvas border border-hairline rounded-md shadow-card max-h-52 overflow-y-auto"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted select-none">
              No matches
            </li>
          ) : (
            results.map((entry, idx) => (
              <li
                key={entry.zip}
                role="option"
                aria-selected={idx === highlightIndex}
                onMouseDown={(e) => {
                  // Prevent input blur from firing before click is processed.
                  e.preventDefault();
                  selectOption(entry.zip);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer select-none ${
                  idx === highlightIndex
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-ink hover:bg-surface-soft"
                }`}
              >
                <span className="font-semibold">{entry.zip}</span>
                <span className="text-muted"> — {entry.neighborhood}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
