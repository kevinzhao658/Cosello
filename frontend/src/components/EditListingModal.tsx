import { useState } from "react";
import { Loader2, Pencil, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { PriceInput } from "./ui/price-input";
import { ModalShell } from "./ui/ModalShell";
import { ListingImage } from "./ui/ListingImage";
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
      <div className="relative bg-canvas border border-hairline rounded-xl p-6 max-w-md w-full mx-4 shadow-overlay max-h-[85vh] overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 size-8 rounded-full inline-flex items-center justify-center text-muted hover:text-ink hover:bg-surface-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
        >
          <X className="size-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 rounded-full bg-primary-soft inline-flex items-center justify-center">
            <Pencil className="size-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-ink">Edit listing</h3>
        </div>

        {previewUrls.length > 0 && (
          <div className="mb-4">
            <ListingImage
              src={previewUrls[0]}
              alt=""
              size="modalPreview"
              className="block mx-auto w-full max-w-md max-h-[50vh] object-contain rounded-md border border-hairline bg-surface-soft"
            />
            {previewUrls.length > 1 && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1 justify-center">
                {previewUrls.slice(1).map((url, i) => (
                  <ListingImage
                    key={i}
                    src={url}
                    alt=""
                    size="small"
                    className="size-14 rounded-md object-cover border border-hairline shrink-0"
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/*
            Brand + Name replace the old single Title input. The
            buyer-facing title is composed via formatTitle on render.
          */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Brand</label>
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-canvas border border-border-strong rounded-md px-3 py-2 text-ink text-sm resize-none outline-none focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px] transition-[color,box-shadow]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Price</label>
              <PriceInput value={price} onChange={setPrice} className="text-sm" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full bg-canvas border border-border-strong rounded-md px-3 py-2 text-ink text-sm outline-none focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[3px] transition-[color,box-shadow] appearance-none"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Location</label>
            <Input value={location} readOnly disabled className="text-sm" />
            <p className="text-[11px] text-muted-soft mt-1">Location is synced from your profile</p>
          </div>

          {showCategory && (
            <>
              <CategorySelector category={category} schemas={categorySchemas} onChange={setCategory} />
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
            <label className="text-xs text-muted mb-1 block">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-primary-soft border border-primary/30 text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((_, j) => j !== i))}
                    aria-label={`Remove tag ${tag}`}
                    className="text-primary/70 hover:text-primary transition-colors"
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
                placeholder="Add tag…"
                className="text-sm flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (newTag.trim()) {
                    setTags([...tags, newTag.trim()]);
                    setNewTag("");
                  }
                }}
                aria-label="Add tag"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (!brand.trim() && !name.trim()) || !price.trim()}
              className="flex-1"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
