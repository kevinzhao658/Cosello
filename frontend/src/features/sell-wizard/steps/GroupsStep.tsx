import React from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { ChevronRight, Loader2, Plus } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import { GroupCard } from "../GroupCard";
import { TypedInstruction } from "../TypedInstruction";
import type {
  BulkReviewPhase,
  BulkItemDetails,
  DragState,
  SegmentationResult,
  UploadedImage,
} from "../useSellWizard";

export interface GroupsStepProps {
  bulkReviewPhase: BulkReviewPhase;
  segmentation: SegmentationResult;
  uploadedImages: UploadedImage[];
  bulkItems: BulkItemDetails[];
  brandHints: string[];
  names: string[];
  rationale: string;
  rationaleOther: string;
  isGenerating: boolean;
  instructionExiting: boolean;
  currentCardIndex: number;
  dragImageState: DragState | null;
  dragOverGroup: number | null;
  dragOverGap: number | null;
  wizardAnchorRef: React.RefObject<HTMLDivElement | null>;
  onBackArrow: () => void;
  onAdvanceToReason: () => void;
  onGenerate: () => void;
  setRationale: (v: string) => void;
  setRationaleOther: (v: string) => void;
  setDragOverGap: (i: number | null) => void;
  setDragOverGroup: (i: number | null) => void;
  onDropNewGroup: (gapIndex: number) => void;
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
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onClearAll: () => void;
}

export function GroupsStep({
  bulkReviewPhase, segmentation, uploadedImages, bulkItems, brandHints, names,
  rationale, rationaleOther, isGenerating, instructionExiting, currentCardIndex,
  dragImageState, dragOverGroup, dragOverGap, wizardAnchorRef,
  onBackArrow, onAdvanceToReason, onGenerate, setRationale, setRationaleOther,
  setDragOverGap, setDragOverGroup, onDropNewGroup, onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd, onDeleteMouseDown, onDeleteClick, onBrandChange, onNameChange,
  onCardSelect, fileInputRef, onClearAll,
}: GroupsStepProps) {
  return (
    <>
      <div ref={wizardAnchorRef} className="mt-3 flex items-center justify-center gap-2 text-xs text-white/40 uppercase tracking-wider">
        <button
          type="button"
          onClick={onBackArrow}
          aria-label="Back"
          className="size-6 rounded-full flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <ChevronRight className="size-3.5 rotate-180" />
        </button>
        <span>
          {bulkReviewPhase === "review"
            ? "Step 2 of 5 — Optional"
            : bulkReviewPhase === "reason"
              ? "Step 3 of 5 — Optional"
              : bulkReviewPhase === "cards"
                ? "Step 4 of 5 — Review"
                : "Step 5 of 5 — Pickup Location"}
        </span>
      </div>
      <TypedInstruction bulkReviewPhase={bulkReviewPhase} exiting={instructionExiting} />
      <div className={`flex flex-wrap items-stretch justify-center gap-x-3 gap-y-5 mt-8 mb-2 transition-opacity duration-500 ${bulkReviewPhase === "reason" || bulkReviewPhase === "pickup" ? "opacity-30" : "opacity-100"}`}>
        {segmentation.groupings.map((group, groupIdx) => (
          <React.Fragment key={groupIdx}>
            {groupIdx > 0 && (
              <div aria-hidden="true" className="self-stretch border-l border-white/10" />
            )}
            <GroupCard
              group={group}
              groupIdx={groupIdx}
              isDropTarget={dragOverGroup === groupIdx}
              isActiveCard={currentCardIndex === groupIdx}
              dragImageState={dragImageState}
              uploadedImages={uploadedImages}
              imageUrls={segmentation.image_urls}
              bulkReviewPhase={bulkReviewPhase}
              brandHint={brandHints[groupIdx] ?? ""}
              nameHint={names[groupIdx] ?? ""}
              bulkItemTitle={
                formatTitle(bulkItems[groupIdx]?.brand, bulkItems[groupIdx]?.name)
                || [brandHints[groupIdx], names[groupIdx]].filter(Boolean).join(" ")
              }
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDeleteMouseDown={onDeleteMouseDown}
              onDeleteClick={onDeleteClick}
              onBrandChange={onBrandChange}
              onNameChange={onNameChange}
              onCardSelect={onCardSelect}
            />
          </React.Fragment>
        ))}

        {dragImageState && (
          <div
            className={`self-stretch min-w-[5rem] rounded-lg border border-dashed flex items-center justify-center text-[11px] px-3 transition-all ${
              dragOverGap === segmentation.groupings.length
                ? "border-fuchsia-400/60 bg-fuchsia-500/10 text-fuchsia-200"
                : "border-white/15 text-white/40"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverGap(segmentation.groupings.length);
              setDragOverGroup(null);
            }}
            onDragLeave={() => setDragOverGap(null)}
            onDrop={() => onDropNewGroup(segmentation.groupings.length)}
          >
            New group
          </div>
        )}

        {bulkReviewPhase === "review" && (
          <div className="ml-auto self-center shrink-0 flex flex-col gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="size-8 rounded-lg border border-dashed border-white/20 flex items-center justify-center text-white/40 hover:text-white/60 hover:border-white/40 transition-all"
              aria-label="Add more photos"
            >
              <Plus className="size-4" />
            </button>
            <button
              onClick={onClearAll}
              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-400/20 hover:bg-red-500/10"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Step 2 / Step 3 right-side panel: Continue button or rationale group */}
      {(bulkReviewPhase === "review" || bulkReviewPhase === "reason") && !isGenerating && (
        <div
          key={bulkReviewPhase}
          className="mt-4 wizard-step-enter"
          style={{ animation: "wizardStepIn 300ms ease-out both" }}
        >
          {bulkReviewPhase === "review" ? (
            <Button
              onClick={onAdvanceToReason}
              disabled={
                segmentation.groupings.length === 0 ||
                segmentation.groupings.some((g) => g.length === 0)
              }
              className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
            >
              {`Continue (${segmentation.groupings.length} ${segmentation.groupings.length === 1 ? "item" : "items"})`}
            </Button>
          ) : (
            <div className="p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
              <div className="space-y-2">
                {[
                  "Moving",
                  "Upgrading",
                  "No longer fits",
                  "Gift never used",
                  "Decluttering",
                  "Other",
                ].map((opt) => {
                  const isSelected = rationale === opt;
                  return (
                    <label
                      key={opt}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-fuchsia-500/10 border-fuchsia-400/40 text-fuchsia-100"
                          : "bg-white/5 border-white/15 text-white/70 hover:bg-white/[0.07] hover:border-white/25"
                      }`}
                    >
                      <input
                        type="radio"
                        name="sell-rationale"
                        value={opt}
                        checked={isSelected}
                        onChange={() => setRationale(opt)}
                        className="size-4 accent-fuchsia-500 shrink-0"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  );
                })}
              </div>
              {rationale === "Other" && (
                <div>
                  <label className="text-xs text-white/40 uppercase tracking-wider">Tell us briefly why</label>
                  <Input
                    value={rationaleOther}
                    onChange={(e) => setRationaleOther(e.target.value)}
                    placeholder="Tell us briefly why"
                    maxLength={200}
                    className="mt-1 bg-white/5 border-white/20 text-white"
                  />
                </div>
              )}
              <Button
                onClick={onGenerate}
                disabled={
                  isGenerating ||
                  (rationale === "Other" && rationaleOther.trim() === "")
                }
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  `Generate Listings (${segmentation.groupings.length})`
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
