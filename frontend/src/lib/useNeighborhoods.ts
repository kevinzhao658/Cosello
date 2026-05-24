// frontend/src/lib/useNeighborhoods.ts
//
// Fetch the canonical Manhattan neighborhood list from
// /api/communities/neighborhoods once per app session, cached
// module-level so subsequent mounts get the list synchronously.
//
// There is no FE-local fallback. If the API call fails, the consumer
// should render an error state and prompt the user to retry — this
// is intentional, so the FE can never drift from the BE list.
import { useState, useEffect } from "react";

let cachedList: readonly string[] | null = null;
let cachedListPromise: Promise<readonly string[]> | null = null;

async function fetchNeighborhoods(): Promise<readonly string[]> {
  if (cachedList) return cachedList;
  if (cachedListPromise) return cachedListPromise;

  cachedListPromise = fetch("/api/communities/neighborhoods")
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch neighborhoods (${res.status})`);
      return res.json();
    })
    .then((data: string[]) => {
      cachedList = Object.freeze([...data]);
      return cachedList;
    })
    .catch((err) => {
      cachedListPromise = null; // allow retry
      throw err;
    });

  return cachedListPromise;
}

export interface UseNeighborhoodsResult {
  list: readonly string[] | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

export function useNeighborhoods(): UseNeighborhoodsResult {
  const [list, setList] = useState<readonly string[] | null>(cachedList);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedList);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (cachedList && retryToken === 0) {
      // Already have cached data and not retrying
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchNeighborhoods()
      .then((data) => {
        if (!cancelled) {
          setList(data);
          setIsLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  return {
    list,
    isLoading,
    error,
    retry: () => setRetryToken((n) => n + 1),
  };
}
