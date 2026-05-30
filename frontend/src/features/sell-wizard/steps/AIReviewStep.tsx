import React, { useRef } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { PriceInput } from "../../../components/ui/price-input";
import { CategorySelector, CategoryAttributeFields } from "../../../components/CategoryFields";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { Tooltip } from "../../../components/ui/tooltip";
import { SkeletonImage } from "../../../components/ui/SkeletonImage";
import { formatTitle } from "../../../lib/format";
import { CONDITIONS } from "../../../lib/listings";
import type { CategorySchema } from "../../../lib/types";
import type { BulkItemDetails, UploadedImage } from "../useSellWizard";

export interface AIReviewStepProps {
  bulkItems: BulkItemDetails[];
  currentCardIndex: number;
  uploadedImages: UploadedImage[];
  // Persistent Supabase URLs from segmentation. Prefer over local blob URLs
  // for thumbnails — iOS Safari invalidates blob URLs after backgrounding.
  imageUrls?: string[];
  categorySchemas: Record<string, CategorySchema>;
  editingTitle: string | null;
  newTag: string;
  isGenerating: boolean;
  setEditingTitle: (v: string | null) => void;
  setNewTag: (v: string) => void;
  setCurrentCardIndex: (i: number) => void;
  deleteBulkItem: (i: number) => void;
  updateBulkItem: (i: number, patch: Partial<BulkItemDetails>) => void;
  updateBulkItemField: (i: number, field: string, value: unknown) => void;
  regenerateBulkItem: (groupIdx: number) => void;
  addPhotoToBulkItem: (index: number, files: FileList) => void;
  onAdvance: () => void;
}

export function AIReviewStep({
  bulkItems, currentCardIndex, uploadedImages, imageUrls, categorySchemas, editingTitle, newTag,
  isGenerating, setEditingTitle, setNewTag, setCurrentCardIndex, deleteBulkItem,
  updateBulkItem, updateBulkItemField, regenerateBulkItem, addPhotoToBulkItem, onAdvance,
}: AIReviewStepProps) {
  const bulkPhotoInputRef = useRef<HTMLInputElement>(null);
  const currentItem = bulkItems[currentCardIndex];
  if (!currentItem) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted">
            Item {currentCardIndex + 1} of {bulkItems.length}
          </span>
        </div>
        <div className="flex gap-1">
          {bulkItems.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentCardIndex
                  ? "bg-primary"
                  : i < currentCardIndex
                  ? "bg-primary-soft"
                  : "bg-surface-strong"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 bg-surface-card rounded-md border border-hairline shadow-card space-y-4 text-left">
        <div className="flex items-center gap-2 mb-1">
          {currentItem.imageIndices.map((imgIdx) => {
            // Prefer persistent server URL over local blob URL (iOS Safari
            // can drop blob URLs after backgrounding).
            const src = imageUrls?.[imgIdx] ?? uploadedImages[imgIdx]?.preview ?? null;
            return (
              <div key={imgIdx} className="relative size-16 rounded-md border border-hairline overflow-hidden">
                <SkeletonImage src={src} alt="Item" />
              </div>
            );
          })}
          <input
            ref={bulkPhotoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                addPhotoToBulkItem(currentCardIndex, e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>

        {currentItem._error && (
          <div className="flex items-start gap-3 p-3 rounded-md border border-error/40 bg-error/5 text-body">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-error" />
            <div className="flex-1 text-xs">
              <div className="font-semibold text-error">This item failed to generate</div>
              <div className="mt-1 text-muted">{currentItem._error}</div>
            </div>
            <button
              type="button"
              onClick={() => regenerateBulkItem(currentCardIndex)}
              disabled={isGenerating}
              className="shrink-0 text-[11px] text-error hover:text-on-primary hover:bg-error px-2 py-1 rounded-md border border-error/40 transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              {isGenerating ? <Loader2 className="size-3 animate-spin" /> : "Regenerate this item"}
            </button>
          </div>
        )}
        {currentItem.retrieval_fallback === true && (
          <div className="flex gap-3 p-3 rounded-md border border-warning/40 bg-warning/5 text-body">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
            <div className="text-xs">
              <div className="font-semibold text-ink">Listing created with limited enrichment</div>
              <div className="mt-1 text-muted">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
            </div>
          </div>
        )}
        <div>
          <label htmlFor={`bulk-title-${currentCardIndex}`} className="text-xs text-muted uppercase tracking-wider">Title</label>
          <Input
            id={`bulk-title-${currentCardIndex}`}
            value={editingTitle ?? formatTitle(currentItem.brand, currentItem.name)}
            onFocus={() => setEditingTitle(formatTitle(currentItem.brand, currentItem.name))}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={() => {
              if (editingTitle === null) return;
              const newTitle = editingTitle.trim();
              const currentBrand = (currentItem.brand || "").trim();
              const patch: Partial<BulkItemDetails> = {};
              if (currentBrand && newTitle.toLowerCase().startsWith(currentBrand.toLowerCase() + " ")) {
                patch.name = newTitle.slice(currentBrand.length + 1).trim();
              } else {
                patch.name = newTitle;
                patch.brand = "";
              }
              updateBulkItem(currentCardIndex, patch);
              setEditingTitle(null);
            }}
            className="mt-1"
          />
        </div>
        <div>
          <label htmlFor={`bulk-description-${currentCardIndex}`} className="text-xs text-muted uppercase tracking-wider">Description</label>
          <textarea
            id={`bulk-description-${currentCardIndex}`}
            value={currentItem.description}
            onChange={(e) => updateBulkItemField(currentCardIndex, "description", e.target.value)}
            rows={3}
            className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`bulk-price-${currentCardIndex}`} className="text-xs text-muted uppercase tracking-wider">Price ($)</label>
            <PriceInput
              id={`bulk-price-${currentCardIndex}`}
              value={currentItem.price}
              onChange={(next) => updateBulkItemField(currentCardIndex, "price", next)}
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor={`bulk-condition-${currentCardIndex}`} className="text-xs text-muted uppercase tracking-wider">Condition</label>
            <select
              id={`bulk-condition-${currentCardIndex}`}
              value={currentItem.condition}
              onChange={(e) => updateBulkItemField(currentCardIndex, "condition", e.target.value)}
              className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 h-9"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        {Object.keys(categorySchemas).length > 0 && (
          <>
            <CategorySelector
              category={currentItem.category || "other"}
              schemas={categorySchemas}
              onChange={(slug) => updateBulkItem(currentCardIndex, { category: slug })}
            />
            <CategoryAttributeFields
              category={currentItem.category || "other"}
              schemas={categorySchemas}
              attributes={currentItem.categoryAttributes || {}}
              identifierConfidence={currentItem.identifierConfidence}
              onChange={(key, value) =>
                updateBulkItem(currentCardIndex, {
                  categoryAttributes: {
                    ...(currentItem.categoryAttributes || {}),
                    [key]: value,
                  },
                })
              }
            />
          </>
        )}
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Tags</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {currentItem.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary-soft border border-primary/20 text-primary-active"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    updateBulkItemField(currentCardIndex, "tags", currentItem.tags.filter((_, i) => i !== index))
                  }
                  className="hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas rounded-full"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = newTag.trim();
                if (trimmed && !currentItem.tags.includes(trimmed)) {
                  updateBulkItemField(currentCardIndex, "tags", [...currentItem.tags, trimmed]);
                  setNewTag("");
                }
              }}
              className="inline-flex"
            >
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add tag..."
                aria-label="Add tag"
                className="w-24 px-2 py-1 rounded-full text-xs bg-canvas border border-border-strong text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors"
              />
            </form>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          onClick={() => setCurrentCardIndex(Math.max(0, currentCardIndex - 1))}
          disabled={currentCardIndex === 0}
          variant="outline"
          className="flex-1 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          Previous
        </Button>
        <Tooltip content="Remove this item">
          <Button
            onClick={() => deleteBulkItem(currentCardIndex)}
            variant="outline"
            className="border-error/40 text-error hover:bg-error/10 hover:text-error px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            aria-label="Remove this item"
          >
            <X className="size-4" />
          </Button>
        </Tooltip>
        <Button
          onClick={() => {
            if (currentCardIndex < bulkItems.length - 1) {
              setCurrentCardIndex(currentCardIndex + 1);
            } else {
              onAdvance();
            }
          }}
          className="flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          {currentCardIndex < bulkItems.length - 1 ? "Next Item" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
