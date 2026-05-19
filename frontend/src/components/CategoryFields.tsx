import React from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip } from "./ui/tooltip";

type CategorySlug = "clothing" | "furniture" | "electronics" | "sports" | "collectibles" | "other";

interface CategoryField {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
  tooltip?: string;
}

interface CategorySchema {
  label: string;
  fields: CategoryField[];
}

interface CategorySelectorProps {
  category: CategorySlug;
  schemas: Record<string, CategorySchema>;
  onChange: (slug: CategorySlug) => void;
}

export function CategorySelector({ category, schemas, onChange }: CategorySelectorProps) {
  return (
    <div>
      <label className="text-xs text-muted uppercase tracking-wider">Category</label>
      <select
        value={category}
        onChange={(e) => onChange(e.target.value as CategorySlug)}
        className="mt-1 w-full bg-canvas border border-border-strong text-ink rounded-md px-3 py-2 text-sm h-9 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas transition-colors"
      >
        {Object.entries(schemas).map(([slug, schema]) => (
          <option key={slug} value={slug}>{schema.label}</option>
        ))}
      </select>
    </div>
  );
}

interface CategoryAttributeFieldsProps {
  category: CategorySlug;
  schemas: Record<string, CategorySchema>;
  attributes: Record<string, string>;
  identifierConfidence?: "high" | "medium" | "low";
  onChange: (key: string, value: string) => void;
}

export function CategoryAttributeFields({
  category,
  schemas,
  attributes,
  identifierConfidence,
  onChange,
}: CategoryAttributeFieldsProps) {
  const schema = schemas[category];
  // Brand and model are now top-level listing fields (edited via the
  // listing-level Brand/Name inputs in EditListingModal). If a backend
  // schema still ships them as category attributes, filter them out so we
  // don't render duplicate inputs that drift from the canonical values.
  const allFields = (schema?.fields || []).filter(
    (f) => f.key !== "brand" && f.key !== "model",
  );

  if (allFields.length === 0) return null;

  const isLowConfidence = identifierConfidence && identifierConfidence !== "high";

  return (
    <div className="grid grid-cols-2 gap-3">
      {allFields.map((field) => {
        // brand_or_creator (collectibles) still gets the low-confidence
        // amber outline since it's the only remaining identity-style field
        // rendered through this component.
        const needsAmberOutline = isLowConfidence && field.key === "brand_or_creator";
        const value = attributes[field.key] || "";
        const isRecommendedEmpty = field.required && !value;
        const borderClass = needsAmberOutline
          ? "border-warning/60"
          : isRecommendedEmpty
            ? "border-primary/40"
            : "border-border-strong";

        return (
          <div key={field.key} className={field.key === "dimensions" ? "col-span-2" : ""}>
            <label className="text-xs text-muted uppercase tracking-wider inline-flex items-center gap-1">
              {field.label}
              {field.tooltip && (
                <Tooltip content={field.tooltip}>
                  <span tabIndex={0} aria-label={`About ${field.label}`} className="inline-flex">
                    <HelpCircle className="size-3 text-muted-soft hover:text-muted cursor-help" />
                  </span>
                </Tooltip>
              )}
            </label>
            {field.type === "select" && field.options ? (
              <select
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`mt-1 w-full bg-canvas border text-ink rounded-md px-3 py-2 text-sm h-9 focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas transition-colors ${borderClass}`}
              >
                <option value="">Select...</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.label}
                className={`mt-1 w-full bg-canvas border text-ink placeholder:text-muted-soft rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas transition-colors ${borderClass}`}
              />
            )}
          </div>
        );
      })}
      {allFields.some((f) => f.required && !attributes[f.key]) && (
        <p className="text-[11px] text-muted mt-1 col-span-2">Filling in highlighted fields increases your chances of selling.</p>
      )}
    </div>
  );
}
