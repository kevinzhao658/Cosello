import { useRef, useState, useCallback } from "react";

export interface DragItemProps {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  style: React.CSSProperties;
  "data-drag-index": number;
  "data-is-dragging": boolean;
}

export interface UsePhotoDragReorderReturn {
  dragIndex: number | null;
  overIndex: number | null;
  getItemProps: (index: number) => DragItemProps;
}

/**
 * Pointer-based drag-to-reorder for a horizontal flex row of photo thumbnails.
 * Works with both mouse and touch (via Pointer Events API).
 *
 * @param count     Number of draggable tiles.
 * @param onReorder Called with (from, to) when a reorder occurs. Pure — no internal
 *                  mutation; caller owns the array.
 */
export function usePhotoDragReorder(
  count: number,
  onReorder: (from: number, to: number) => void,
): UsePhotoDragReorderReturn {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // Mutable drag session — avoids stale-closure issues inside pointer handlers.
  const session = useRef<{
    from: number;
    originX: number;
    el: HTMLElement;
  } | null>(null);

  // Keep a ref to the container so we can read sibling bounding rects on move.
  const containerRef = useRef<HTMLElement | null>(null);

  const computeOver = useCallback(
    (clientX: number, from: number): number => {
      if (!containerRef.current) return from;

      // Collect all sibling tile elements (they carry data-drag-index).
      const tiles = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>("[data-drag-index]"),
      ).sort((a, b) => {
        const ai = Number(a.dataset.dragIndex);
        const bi = Number(b.dataset.dragIndex);
        return ai - bi;
      });

      // Count how many OTHER tiles have their horizontal centre to the left of
      // the pointer — that is the insertion slot index. Skip the dragged tile by
      // its logical data-drag-index, not the loop counter: the two only coincide
      // when DOM order is exactly 0,1,2…, which can break during a delete+drag race.
      let slot = 0;
      for (let i = 0; i < tiles.length; i++) {
        if (Number(tiles[i].dataset.dragIndex) === from) continue; // skip the dragged tile itself
        const rect = tiles[i].getBoundingClientRect();
        const centre = rect.left + rect.width / 2;
        if (centre < clientX) slot++;
      }

      return Math.max(0, Math.min(count - 1, slot));
    },
    [count],
  );

  const handlePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      // Ignore clicks that land on a <button> (delete × or add +).
      if ((e.target as HTMLElement).closest("button")) return;

      e.stopPropagation(); // prevent card swipe handler from recording a swipe-start

      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      // Record the container (flex row parent) on first drag.
      containerRef.current = el.parentElement;

      session.current = { from: index, originX: e.clientX, el };
      setDragIndex(index);
      setOverIndex(index);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (!s || s.from !== index) return;

      const deltaX = e.clientX - s.originX;

      // Translate the dragged tile to follow the pointer.
      s.el.style.transform = `translateX(${deltaX}px) scale(1.05)`;
      s.el.style.zIndex = "50";
      s.el.style.transition = "none";

      const over = computeOver(e.clientX, s.from);
      setOverIndex(over);
    },
    [computeOver],
  );

  const commitDrag = useCallback(
    (index: number) => {
      const s = session.current;
      if (!s || s.from !== index) return;

      // Reset inline styles on the dragged tile.
      s.el.style.transform = "";
      s.el.style.zIndex = "";
      s.el.style.transition = "";

      const from = s.from;
      session.current = null;

      setDragIndex(null);
      setOverIndex(null);

      if (overIndex !== null && overIndex !== from) {
        onReorder(from, overIndex);
      }
    },
    // overIndex is captured via closure but we read from state — intentionally
    // included in deps so the callback always closes over the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReorder, overIndex],
  );

  const handlePointerUp = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      commitDrag(index);
    },
    [commitDrag],
  );

  const handlePointerCancel = useCallback(
    (index: number) => (e: React.PointerEvent<HTMLElement>) => {
      const s = session.current;
      if (s && s.from === index) {
        s.el.style.transform = "";
        s.el.style.zIndex = "";
        s.el.style.transition = "";
        session.current = null;
      }
      e.currentTarget.releasePointerCapture(e.pointerId);
      setDragIndex(null);
      setOverIndex(null);
    },
    [],
  );

  const getItemProps = useCallback(
    (index: number): DragItemProps => {
      const isDragging = dragIndex === index;
      return {
        onPointerDown: handlePointerDown(index),
        onPointerMove: handlePointerMove(index),
        onPointerUp: handlePointerUp(index),
        onPointerCancel: handlePointerCancel(index),
        // touch-action: none prevents the browser from claiming the touch
        // for page scrolling while a drag is in progress.
        style: { touchAction: "none", cursor: isDragging ? "grabbing" : "grab" },
        "data-drag-index": index,
        "data-is-dragging": isDragging,
      };
    },
    [dragIndex, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel],
  );

  return { dragIndex, overIndex, getItemProps };
}
