import { AlertTriangle, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { PriceInput } from "../../components/ui/price-input";
import { CategorySelector, CategoryAttributeFields } from "../../components/CategoryFields";
import { CONDITIONS } from "../../lib/listings";
import type { CategorySchema, CategorySlug } from "../../lib/types";
import type { ProductDetails } from "./useSellWizard";

interface SingleListingFormProps {
  productDetails: ProductDetails;
  setProductDetails: (details: ProductDetails | null) => void;
  categorySchemas: Record<string, CategorySchema>;
  setSingleCategory: (slug: CategorySlug) => void;
  newTag: string;
  setNewTag: (v: string) => void;
  onContinue: () => void;
  isAuthenticated: boolean;
}

export function SingleListingForm({
  productDetails, setProductDetails, categorySchemas, setSingleCategory,
  newTag, setNewTag, onContinue, isAuthenticated,
}: SingleListingFormProps) {
  return (
    <div className="mt-6 p-6 bg-surface-card rounded-lg border border-hairline space-y-4 text-left">
      {productDetails.retrieval_fallback === true && (
        <div className="flex gap-3 p-3 rounded-md border border-warning/40 bg-warning/5 text-body">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
          <div className="text-xs">
            <div className="font-semibold text-ink">Listing created with limited enrichment</div>
            <div className="mt-1 text-muted">We couldn't reach our product lookup service, so this listing was generated from the photo alone. Double-check the brand, model, and price before posting.</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Brand</label>
          <Input
            value={productDetails.brand}
            onChange={(e) => setProductDetails({ ...productDetails, brand: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Name</label>
          <Input
            value={productDetails.name}
            onChange={(e) => setProductDetails({ ...productDetails, name: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted uppercase tracking-wider">Description</label>
        <textarea
          value={productDetails.description}
          onChange={(e) => setProductDetails({ ...productDetails, description: e.target.value })}
          rows={3}
          className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Price ($)</label>
          <PriceInput
            value={productDetails.price}
            onChange={(next) => setProductDetails({ ...productDetails, price: next })}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted uppercase tracking-wider">Condition</label>
          <select
            value={productDetails.condition}
            onChange={(e) => setProductDetails({ ...productDetails, condition: e.target.value })}
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
            category={productDetails.category || "other"}
            schemas={categorySchemas}
            onChange={setSingleCategory}
          />
          <CategoryAttributeFields
            category={productDetails.category || "other"}
            schemas={categorySchemas}
            attributes={productDetails.categoryAttributes || {}}
            identifierConfidence={productDetails.identifierConfidence}
            onChange={(key, value) => setProductDetails({
              ...productDetails,
              categoryAttributes: { ...(productDetails.categoryAttributes || {}), [key]: value },
            })}
          />
        </>
      )}
      <div>
        <label className="text-xs text-muted uppercase tracking-wider">Tags</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {productDetails.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary-soft border border-primary/20 text-primary-active"
            >
              {tag}
              <button
                onClick={() =>
                  setProductDetails({
                    ...productDetails,
                    tags: productDetails.tags.filter((_, i) => i !== index),
                  })
                }
                className="hover:text-ink transition-colors"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = newTag.trim();
              if (trimmed && !productDetails.tags.includes(trimmed)) {
                setProductDetails({
                  ...productDetails,
                  tags: [...productDetails.tags, trimmed],
                });
                setNewTag("");
              }
            }}
            className="inline-flex"
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Add tag..."
              className="w-24 px-2 py-1 rounded-full text-xs bg-canvas border border-border-strong text-ink placeholder:text-muted-soft focus:outline-none focus:border-primary transition-colors"
            />
          </form>
        </div>
      </div>
      <Button
        onClick={onContinue}
        className="w-full mt-3"
      >
        {isAuthenticated ? "Continue →" : "Sign in to Continue"}
      </Button>
    </div>
  );
}
