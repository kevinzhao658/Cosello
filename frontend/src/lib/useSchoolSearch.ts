// frontend/src/lib/useSchoolSearch.ts
import { useEffect, useState } from "react";

export interface School {
  id: number;
  name: string;
  state: string | null;
}

/** Debounced search against /api/schools/search. Returns [] for an empty query. */
export function useSchoolSearch(query: string, token: string): School[] {
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
        const res = await fetch(`/api/schools/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` },
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
  }, [query, token]);
  return results;
}
