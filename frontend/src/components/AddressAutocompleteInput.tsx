import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { hasMapboxToken, searchAddresses } from "../lib/mapboxSearch";
import type { AddressSuggestion } from "../lib/mapboxSearch";

interface AddressAutocompleteInputProps {
  value: string;
  /** Fired on every keystroke with the raw text. */
  onChangeText: (value: string) => void;
  /** Fired when the user picks a suggestion (a real, Manhattan-ZIP address). */
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Free-text address input with NYC address autocomplete (Mapbox forward
 * geocode, suggestions filtered to the 42 seeded Manhattan ZIPs). Behaves as
 * a plain text input when no public Mapbox token is configured. Used in the
 * registration form; the sell-wizard map step has its own map-coupled search.
 */
export function AddressAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  placeholder,
  id,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const enabled = hasMapboxToken();

  const handleChange = (v: string) => {
    onChangeText(v);
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    if (v.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const results = await searchAddresses(v, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setOpen(true);
          setHighlight(0);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
  };

  // Close on click-outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (s: AddressSuggestion) => {
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const s = suggestions[highlight];
      if (s) {
        e.preventDefault();
        select(s);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role={enabled ? "combobox" : undefined}
        aria-expanded={enabled ? open : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full h-9 px-3 py-1 rounded-md border border-border-strong bg-canvas text-base text-ink md:text-sm placeholder:text-muted-soft focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-[color,box-shadow]"
      />
      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 bg-canvas border border-hairline rounded-md shadow-card max-h-52 overflow-y-auto"
        >
          {loading ? (
            <li className="px-3 py-2 text-sm text-muted select-none">Searching…</li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted select-none">No Manhattan matches</li>
          ) : (
            suggestions.map((s, idx) => (
              <li
                key={s.label}
                role="option"
                aria-selected={idx === highlight}
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(s);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 text-sm cursor-pointer select-none ${
                  idx === highlight ? "bg-primary/10 text-primary font-medium" : "text-ink hover:bg-surface-soft"
                }`}
              >
                {s.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
