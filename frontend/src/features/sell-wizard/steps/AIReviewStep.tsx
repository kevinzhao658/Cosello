import React, { useRef } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { PriceInput } from "../../../components/ui/price-input";
import { CategorySelector, CategoryAttributeFields } from "../../../components/CategoryFields";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { formatTitle } from "../../../lib/format";
import { CONDITIONS } from "../../../lib/listings";
import type { CategorySchema } from "../../../lib/types";
import type { BulkItemDetails, UploadedImage } from "../useSellWizard";

export interface AIReviewStepProps {
  bulkItems: BulkItemDetails[];
  currentCardIndex: number;
  uploadedImages: UploadedImage[];
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
  bulkItems, currentCardIndex, uploadedImages, categorySchemas, editingTitle, newTag,
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
          <span className="text-white/40">
            Item {currentCardIndex + 1} of {bulkItems.length}
          </span>
        </div>
        <div className="flex gap-1">
          {bulkItems.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentCardIndex
                  ? "bg-fuchsia-400 scale-125"
                  : i < currentCardIndex
                  ? "bg-fuchsia-400/40"
                  : "bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="p-6 bg-white/5 rounded-lg border border-white/10 space-y-4 text-left">
        <div className="flex items-center gap-2 mb-1">
          {currentItem.imageIndices.map((imgIdx) => (
            <div key={imgIdx} className="relative">
              <img
                src={uploadedImages[imgIdx]?.preview}
                alt="Item"
                className="size-16 object-cover rounded-lg border border-white/20"
              />
            </div>
          ))}
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
          <div className="flex items-start gap-3 p-3 rounded-lg border border-red-400/40 bg-red-500/10 text-red-200">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-300" />
            <div className="flex-1 text-xs">
              <div className="font-medium text-red-100">This item failed to generate</div>
              <div className="mt-1 text-red-200/90">{currentItem._error}</div>
            </div>
            <button
              onClick={() => regenerateBulkItem(currentCardIndex)}
              disabled={isGenerating}
              className="shrink-0 text-[11px] text-red-100 hover:text-white px-2 py-1 rounded border border-red-300/30 hover:bg-red-500/20 disabled:opacity-40"
            >
              {isGenerating ? <Loader2 className="size-3 animate-spin" /> : "Regenerate this item"}
            </button>
          </div>
        )}
        {currentItem.retrieval_fallback === true && (
          <div className="flex gap-3 p-3 rounded-lg border border-yellow-400/40 bg-yellow-500/10 text-yellow-200">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-yellow-300" />
            <div className="text-xs">
              <div className="font-medium text-yellow-100">Listing created with limited enrichment</div>
              <div className="mt-1 text-yellow-200/90">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
            </div>
          </div>
        )}
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Title</label>
          <Input
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
            className="mt-1 bg-white/5 border-white/20 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-white/40 uppercase tracking-wider">Description</label>
          <textarea
            value={currentItem.description}
            onChange={(e) => updateBulkItemField(currentCardIndex, "description", e.target.value)}
            rows={3}
            className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 resize-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider">Price ($)</label>
            <PriceInput
              value={currentItem.price}
              onChange={(next) => updateBulkItemField(currentCardIndex, "price", next)}
              className="mt-1 bg-white/5 border-white/20 text-white"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 uppercase tracking-wider">Condition</label>
            <select
              value={currentItem.condition}
              onChange={(e) => updateBulkItemField(currentCardIndex, "condition", e.target.value)}
              className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9"
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
          <label className="text-xs text-white/40 uppercase tracking-wider">Tags</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {currentItem.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-fuchsia-500/15 border border-fuchsia-400/30 text-fuchsia-300"
              >
                {tag}
                <button
                  onClick={() =>
                    updateBulkItemField(currentCardIndex, "tags", currentItem.tags.filter((_, i) => i !== index))
                  }
                  className="hover:text-white transition-colors"
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
                className="w-20 px-2 py-1 rounded-full text-xs bg-white/5 border border-white/20 text-white placeholder:text-white/30 focus:outline-none focus:border-fuchsia-400 transition-colors"
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
          className="flex-1 border-white/20 text-white/60 hover:text-white disabled:opacity-30"
        >
          Previous
        </Button>
        <Button
          onClick={() => deleteBulkItem(currentCardIndex)}
          variant="outline"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 px-3"
          title="Remove this item"
        >
          <X className="size-4" />
        </Button>
        <Button
          onClick={() => {
            if (currentCardIndex < bulkItems.length - 1) {
              setCurrentCardIndex(currentCardIndex + 1);
            } else {
              onAdvance();
            }
          }}
          className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0"
        >
          {currentCardIndex < bulkItems.length - 1 ? "Next Item" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
