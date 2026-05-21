import { useEffect, type RefObject } from "react";

type AnyHTMLRef = RefObject<HTMLElement | null>;

// Registers a document.mousedown listener that fires `handler` when the click
// target is outside every ref in `refs`. Pass `enabled=false` (or omit while
// the dropdown is closed) to skip attaching the listener.
export function useClickOutside(
  refs: AnyHTMLRef | AnyHTMLRef[],
  handler: (e: MouseEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const refList = Array.isArray(refs) ? refs : [refs];
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      for (const ref of refList) {
        if (ref.current?.contains(target)) return;
      }
      handler(e);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, handler, ...(Array.isArray(refs) ? refs : [refs])]);
}
