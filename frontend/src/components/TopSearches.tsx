import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

interface TopSearch {
  query_text: string;
  count: number;
}

interface TopSearchesResponse {
  items: TopSearch[];
}

export function TopSearches() {
  const [items, setItems] = useState<TopSearch[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/searches/top?window_days=7&limit=5")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: TopSearchesResponse) => {
        if (alive) setItems(d.items);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error || (items !== null && items.length === 0)) {
    return <p className="text-xs text-muted">Upload photos to preview your listing.</p>;
  }

  if (items === null) {
    return (
      <div
        className="h-24 animate-pulse bg-surface-soft rounded-md"
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="border border-hairline rounded-md p-3.5 bg-canvas">
      <p className="text-sm font-bold text-ink mb-0.5">People are searching for</p>
      <p className="text-[11px] text-muted mb-3">Top searches on Cosello this week</p>
      <ol className="space-y-2">
        {items.map((s, i) => (
          <li
            key={s.query_text}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-ink truncate">
              <span className="text-muted-soft mr-1.5">{i + 1}</span>
              {s.query_text}
            </span>
            <span className="text-xs text-muted font-semibold shrink-0">{s.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
