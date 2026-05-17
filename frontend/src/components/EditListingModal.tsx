import { useState } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PriceInput } from "./ui/price-input";
import { ModalShell } from "./ui/ModalShell";
import { CategorySelector, CategoryAttributeFields } from "./CategoryFields";
import { CONDITIONS } from "../lib/listings";
import type {
  CategorySchema,
  CategorySlug,
  Listing,
  ListingUpdatePatch,
} from "../lib/types";

type EditListingSource = Pick<
  Listing,
  | "brand"
  | "name"
  | "description"
  | "price"
  | "condition"
  | "location"
  | "tags"
  | "imageUrl"
  | "imageUrls"
  | "category"
  | "categoryAttributes"
>;

export type EditListingModalProps = {
  open: boolean;
  onClose: () => void;
  listing: EditListingSource;
  // Location is rendered read-only and synced from the user profile, so the
  // caller passes the canonical neighborhood string explicitly rather than
  // relying on whatever stale value lives on the listing.
  location: string;
  onSave: (patch: ListingUpdatePatch) => Promise<void>;
  // When omitted (or empty), the category section is hidden. Both Marketplace
  // and MyAccount call sites pass this so the modal looks identical.
  categorySchemas?: Record<string, CategorySchema>;
  // Z-index override (App.tsx uses z=260 to stack above listing detail).
  z?: number;
};

function stripBrandModel(attrs: Record<string, string>): Record<string, string> {
  const next = { ...attrs };
  delete next.brand;
  delete next.model;
  return next;
}

export function EditListingModal({
  open,
  onClose,
  listing,
  location,
  onSave,
  categorySchemas,
  z = 50,
}: EditListingModalProps) {
  const [brand, setBrand] = useState(listing.brand || "");
  const [name, setName] = useState(listing.name || "");
  const [description, setDescription] = useState(listing.description || "");
  const [price, setPrice] = useState(listing.price);
  const [condition, setCondition] = useState(listing.condition);
  const [tags, setTags] = useState<string[]>(listing.tags || []);
  const [newTag, setNewTag] = useState("");
  const [category, setCategory] = useState<CategorySlug>(listing.category || "other");
  const [categoryAttributes, setCategoryAttributes] = useState<Record<string, string>>(
    stripBrandModel(listing.categoryAttributes || {}),
  );
  const [isSaving, setIsSaving] = useState(false);

  const showCategory = categorySchemas && Object.keys(categorySchemas).length > 0;
  const previewUrls = listing.imageUrls && listing.imageUrls.length > 0
    ? listing.imageUrls
    : listing.imageUrl
      ? [listing.imageUrl]
      : [];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const patch: ListingUpdatePatch = {
        brand,
        name,
        description,
        price,
        condition,
        location,
        tags,
      };
      if (showCategory) {
        patch.category = category;
        patch.categoryAttributes = stripBrandModel(categoryAttributes);
      }
      await onSave(patch);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} z={z}>
      <div
        className="relative border border-white/15 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "#18181b" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
        >
          <X className="size-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 bg-fuchsia-500/15 rounded-full flex items-center justify-center">
            <Pencil className="size-5 text-fuchsia-400" />
          </div>
          <h3 className="text-lg font-medium">Edit Listing</h3>
        </div>

        {previewUrls.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {previewUrls.map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                className="size-16 rounded-lg object-cover border border-white/10 shrink-0"
              />
            ))}
          </div>
        )}

        <div className="space-y-4">
          {/*
            Brand + Name replace the old single Title input. The
            buyer-facing title is composed via formatTitle on render.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Brand</label>
              <Input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="bg-white/5 border-white/10 text-white text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-white/5 border-white/10 text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-fuchsia-400/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-1 block">Price</label>
              <PriceInput
                value={price}
                onChange={setPrice}
                className="bg-white/5 border-white/10 text-white text-sm"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-fuchsia-400/40 appearance-none"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1 block">Location</label>
            <Input
              value={location}
              readOnly
              disabled
              className="bg-white/5 border-white/10 text-white/50 text-sm cursor-not-allowed"
            />
            <p className="text-[10px] text-white/30 mt-1">Location is synced from your profile</p>
          </div>

          {showCategory && (
            <>
              <CategorySelector
                category={category}
                schemas={categorySchemas}
                onChange={setCategory}
              />
              <CategoryAttributeFields
                category={category}
                schemas={categorySchemas}
                attributes={categoryAttributes}
                onChange={(key, value) =>
                  setCategoryAttributes({ ...categoryAttributes, [key]: value })
                }
              />
            </>
          )}

          <div>
            <label className="text-xs text-white/40 mb-1 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-fuchsia-500/10 border border-fuchsia-400/20 text-fuchsia-300"
                >
                  {tag}
                  <button
                    onClick={() => setTags(tags.filter((_, j) => j !== i))}
                    className="hover:text-white"
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    e.preventDefault();
                    setTags([...tags, newTag.trim()]);
                    setNewTag("");
                  }
                }}
                placeholder="Add tag..."
                className="bg-white/5 border-white/10 text-white text-sm flex-1"
              />
              <Button
                onClick={() => {
                  if (newTag.trim()) {
                    setTags([...tags, newTag.trim()]);
                    setNewTag("");
                  }
                }}
                size="sm"
                className="bg-white/10 hover:bg-white/15 text-white/60 border-0"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              onClick={onClose}
              className="flex-1 bg-white/5 hover:bg-white/10 text-white/60 border border-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (!brand.trim() && !name.trim()) || !price.trim()}
              className="flex-1 bg-fuchsia-500 hover:bg-fuchsia-600 text-white border-0 disabled:opacity-40"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
