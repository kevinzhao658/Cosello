// frontend/src/lib/useSchoolSearch.ts
// Auth is handled via apiFetch, which reads the active Supabase session inline
// on every call. This works during registration (user has completed OTP and the
// session is live) without needing to thread a prop-level token through the tree.
import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export interface School {
  id: number;
  name: string;
  state: string | null;
}

/** Debounced search against /api/schools/search. Returns [] for an empty query. */
export function useSchoolSearch(query: string): School[] {
  const [results, setResults] = useState<School[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/schools/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        setResults((await res.json()) as School[]);
      } catch {
        /* aborted or network error — leave prior results */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);
  return results;
}
