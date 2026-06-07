import React, { memo } from "react";
import { X } from "lucide-react";
import { SkeletonImage } from "../../components/ui/SkeletonImage";

function wrapAt(text: string, maxLen = 20): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxLen) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

export interface GroupCardProps {
  group: number[];
  groupIdx: number;
  isDropTarget: boolean;
  isActiveCard: boolean;
  dragImageState: { imageIndex: number; sourceGroup: number } | null;
  uploadedImages: { file?: File; preview: string }[];
  imageUrls: string[];
  bulkReviewPhase: "review" | "reason" | "cards" | "summary" | "pickup" | null;
  brandHint: string;
  nameHint: string;
  bulkItemTitle: string;
  onDragOver: (e: React.DragEvent, groupIndex: number) => void;
  onDragLeave: () => void;
  onDrop: (groupIndex: number) => void;
  onDragStart: (imageIndex: number, sourceGroup: number) => void;
  onDragEnd: () => void;
  onDeleteMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onDeleteClick: (index: number) => void;
  onBrandChange: (groupIdx: number, value: string) => void;
  onNameChange: (groupIdx: number, value: string) => void;
  onCardSelect: (groupIdx: number) => void;
}

export const GroupCard = memo(function GroupCard({
  group, groupIdx, isDropTarget, isActiveCard, dragImageState,
  uploadedImages, imageUrls, bulkReviewPhase, brandHint, nameHint, bulkItemTitle,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd,
  onDeleteMouseDown, onDeleteClick, onBrandChange, onNameChange, onCardSelect,
}: GroupCardProps) {
  return (
    <div
      className={`inline-flex flex-col items-center gap-1 rounded-md p-1 transition-colors ${
        bulkReviewPhase === "review" && isDropTarget ? "bg-primary-soft ring-1 ring-primary" : ""
      } ${
        bulkReviewPhase === "cards" || bulkReviewPhase === "pickup"
          ? `cursor-pointer hover:bg-surface-soft ${isActiveCard ? "bg-primary-soft ring-1 ring-primary" : ""}`
          : ""
      }`}
      onClick={bulkReviewPhase === "cards" || bulkReviewPhase === "pickup" ? () => onCardSelect(groupIdx) : undefined}
      onDragOver={bulkReviewPhase === "review" ? (e) => onDragOver(e, groupIdx) : undefined}
      onDragLeave={bulkReviewPhase === "review" ? onDragLeave : undefined}
      onDrop={bulkReviewPhase === "review" ? () => onDrop(groupIdx) : undefined}
    >
      <span className="text-xs text-muted leading-none pl-0.5">{groupIdx + 1}</span>
      <div className="flex flex-nowrap items-center gap-1">
        {group.map((imgIdx) => {
          const img = uploadedImages[imgIdx];
          // Prefer the persistent Supabase URL over the local blob URL —
          // iOS Safari can invalidate blob URLs after backgrounding or state
          // transitions, which made the thumbnail go blank intermittently.
          // Server URL is cached after first load, so the perf cost is moot.
          const previewSrc = imageUrls[imgIdx] || img?.preview;
          if (!previewSrc) return null;
          const isDragging = dragImageState?.imageIndex === imgIdx;
          return (
            <div
              key={imgIdx}
              draggable={bulkReviewPhase === "review"}
              onDragStart={bulkReviewPhase === "review" ? () => onDragStart(imgIdx, groupIdx) : undefined}
              onDragEnd={bulkReviewPhase === "review" ? onDragEnd : undefined}
              className={`relative size-16 rounded-md border border-hairline transition-opacity shrink-0 overflow-hidden ${
                bulkReviewPhase === "review" ? "cursor-grab active:cursor-grabbing" : ""
              } ${isDragging ? "opacity-40" : "opacity-100"}`}
            >
              <SkeletonImage src={previewSrc} alt={`Photo ${imgIdx + 1}`} />
              {bulkReviewPhase === "review" && (
                <button
                  type="button"
                  aria-label={`Delete photo ${imgIdx + 1}`}
                  onMouseDown={onDeleteMouseDown}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteClick(imgIdx); }}
                  className="absolute top-1 right-1 z-10 size-5 inline-flex items-center justify-center rounded-full bg-ink/45 text-on-dark backdrop-blur-sm hover:bg-ink/65 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-canvas"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {bulkReviewPhase === "reason" ? (
        <p className="text-xs text-ink text-center mt-1">
          {[brandHint, nameHint].filter(Boolean).join(" ") || "—"}
        </p>
      ) : bulkReviewPhase === "cards" || bulkReviewPhase === "pickup" ? (
        <p className="text-xs text-ink text-center mt-1 whitespace-pre-line">{bulkItemTitle ? wrapAt(bulkItemTitle) : "—"}</p>
      ) : (
        <div className="flex items-start gap-3 w-full justify-center">
          <div className="flex flex-col items-center gap-0.5">
            <input
              id={`brand-hint-${groupIdx}`}
              type="text"
              value={brandHint ?? ""}
              onChange={(e) => onBrandChange(groupIdx, e.target.value)}
              placeholder="—"
              maxLength={80}
              aria-label={`Brand for item ${groupIdx + 1}`}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="min-w-[3rem] max-w-[10rem] bg-transparent border-b border-border-strong pb-0.5 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors text-center"
            />
            <label htmlFor={`brand-hint-${groupIdx}`} className="text-[10px] text-muted leading-none">Brand</label>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <input
              id={`name-hint-${groupIdx}`}
              type="text"
              value={nameHint ?? ""}
              onChange={(e) => onNameChange(groupIdx, e.target.value)}
              placeholder="—"
              maxLength={120}
              aria-label={`Name for item ${groupIdx + 1}`}
              style={{ fieldSizing: "content" } as React.CSSProperties}
              className="min-w-[3rem] max-w-[10rem] bg-transparent border-b border-border-strong pb-0.5 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors text-center"
            />
            <label htmlFor={`name-hint-${groupIdx}`} className="text-[10px] text-muted leading-none">Name</label>
          </div>
        </div>
      )}
    </div>
  );
});
