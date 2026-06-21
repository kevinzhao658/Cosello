import { useState, useCallback } from "react";

export interface UseAsyncActionOptions {
  onError?: (e: unknown) => void;
}

export interface UseAsyncActionResult<TArgs extends unknown[]> {
  run: (...args: TArgs) => Promise<void>;
  pending: boolean;
  error: string | null;
}

/**
 * Manages pending + error state for a single async action.
 *
 * Wraps the provided async function: sets `pending = true` before calling it,
 * captures any thrown error as `error` (stringified), and always resets
 * `pending = false` in the finally block.
 *
 * Use this for handlers that follow the shape:
 *   setIsFoo(true); try { await apiFetch(...); } catch {} finally { setIsFoo(false); }
 *
 * Skip it for handlers with per-item ID tracking (e.g. setKickingMemberId)
 * or materially different control flow.
 *
 * @example
 *   const { run: deleteCommunity, pending: isDeleting } = useAsyncAction(
 *     async (id: number) => {
 *       const res = await apiFetch(`/api/communities/${id}`, { method: "DELETE" });
 *       if (res.ok) setCommunities((prev) => prev.filter((c) => c.id !== id));
 *     },
 *   );
 */
export function useAsyncAction<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
  opts?: UseAsyncActionOptions,
): UseAsyncActionResult<TArgs> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        await fn(...args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "An error occurred";
        setError(msg);
        opts?.onError?.(e);
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, opts?.onError],
  );

  return { run, pending, error };
}
