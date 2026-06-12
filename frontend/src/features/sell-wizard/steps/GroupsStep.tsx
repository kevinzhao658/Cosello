import React from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Loader2, Plus } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import { GroupCard } from "../GroupCard";
import { TypedInstruction } from "../TypedInstruction";
import { AddressPrivacyNotice } from "../AddressPrivacyNotice";
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
  wizardAnchorRef: React.RefObject<HTMLDivElement>;
  onBackArrow: () => void;
  onAdvanceToReason: () => void;
  onFillManually: () => void;
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
  fileInputRef: React.RefObject<HTMLInputElement>;
  onClearAll: () => void;
}

export function GroupsStep({
  bulkReviewPhase, segmentation, uploadedImages, bulkItems, brandHints, names,
  rationale, rationaleOther, isGenerating, instructionExiting, currentCardIndex,
  dragImageState, dragOverGroup, dragOverGap, wizardAnchorRef,
  onBackArrow, onAdvanceToReason, onFillManually, onGenerate, setRationale, setRationaleOther,
  setDragOverGap, setDragOverGroup, onDropNewGroup, onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd, onDeleteMouseDown, onDeleteClick, onBrandChange, onNameChange,
  onCardSelect, fileInputRef, onClearAll,
}: GroupsStepProps) {
  return (
    <>
      <div ref={wizardAnchorRef} />
      <TypedInstruction bulkReviewPhase={bulkReviewPhase} exiting={instructionExiting} onBack={onBackArrow} />
      {bulkReviewPhase === "pickup" && <AddressPrivacyNotice />}
      <div className={`flex flex-wrap items-stretch justify-center gap-x-3 gap-y-5 mt-8 mb-2 transition-opacity duration-500 ${bulkReviewPhase === "reason" || bulkReviewPhase === "pickup" ? "opacity-30" : "opacity-100"}`}>
        {segmentation.groupings.map((group, groupIdx) => (
          <React.Fragment key={groupIdx}>
            {groupIdx > 0 && (
              <div aria-hidden="true" className="self-stretch border-l border-hairline" />
            )}
            <GroupCard
              // Prefer the live per-item photo order from bulkItems (the source
              // of truth for the published cover) so reordering/adding/deleting
              // photos in the review step is reflected in this item tab. Falls
              // back to the raw segmentation grouping before bulkItems exist
              // (pre-generation review/reason phases).
              group={bulkItems[groupIdx]?.imageIndices ?? group}
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
            className={`self-stretch min-w-[5rem] rounded-md border border-dashed flex items-center justify-center text-[11px] px-3 transition-colors ${
              dragOverGap === segmentation.groupings.length
                ? "border-primary bg-primary-soft text-primary-active"
                : "border-border-strong text-muted"
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
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="size-8 rounded-md border border-dashed border-border-strong flex items-center justify-center text-muted hover:text-primary hover:border-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              aria-label="Add more photos"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="text-[10px] text-muted hover:text-error transition-colors px-2 py-1 rounded-md border border-transparent hover:border-error/30 hover:bg-error/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={onAdvanceToReason}
                disabled={
                  segmentation.groupings.length === 0 ||
                  segmentation.groupings.some((g) => g.length === 0)
                }
                className="flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                {`Generate with AI (${segmentation.groupings.length})`}
              </Button>
              <Button
                variant="outline"
                onClick={onFillManually}
                disabled={
                  segmentation.groupings.length === 0 ||
                  segmentation.groupings.some((g) => g.length === 0)
                }
                className="flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
              >
                Fill in manually
              </Button>
            </div>
          ) : (
            <div className="p-6 bg-surface-card rounded-md border border-hairline shadow-card space-y-4 text-left">
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary-soft border-primary text-primary-active"
                          : "bg-canvas border-hairline text-body hover:bg-surface-soft hover:border-border-strong"
                      } focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-canvas`}
                    >
                      <input
                        type="radio"
                        name="sell-rationale"
                        value={opt}
                        checked={isSelected}
                        onChange={() => setRationale(opt)}
                        className="size-4 accent-primary shrink-0"
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  );
                })}
              </div>
              {rationale === "Other" && (
                <div>
                  <label htmlFor="sell-rationale-other" className="text-xs text-muted">Tell us briefly why</label>
                  <Input
                    id="sell-rationale-other"
                    value={rationaleOther}
                    onChange={(e) => setRationaleOther(e.target.value)}
                    placeholder="Tell us briefly why"
                    maxLength={200}
                    className="mt-1"
                  />
                </div>
              )}
              <Button
                onClick={onGenerate}
                disabled={
                  isGenerating ||
                  (rationale === "Other" && rationaleOther.trim() === "")
                }
                className="w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
