import React from "react";
import { HelpCircle } from "lucide-react";

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
      <label className="text-xs text-white/40 uppercase tracking-wider">Category</label>
      <select
        value={category}
        onChange={(e) => onChange(e.target.value as CategorySlug)}
        className="mt-1 w-full bg-white/5 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9"
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

        return (
          <div key={field.key} className={field.key === "dimensions" ? "col-span-2" : ""}>
            <label className="text-xs text-white/40 uppercase tracking-wider inline-flex items-center gap-1">
              {field.label}
              {field.tooltip && (
                <span className="group relative">
                  <HelpCircle className="size-3 text-white/20 hover:text-white/40 cursor-help" />
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 border border-white/20 rounded text-xs text-white/70 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
                    {field.tooltip}
                  </span>
                </span>
              )}
            </label>
            {field.type === "select" && field.options ? (
              <select
                value={value}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`mt-1 w-full bg-white/5 border text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 h-9 ${
                  needsAmberOutline ? "border-amber-400/60" : isRecommendedEmpty ? "border-cyan-400/30" : "border-white/20"
                }`}
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
                className={`mt-1 w-full bg-white/5 border text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:border-fuchsia-400 ${
                  needsAmberOutline ? "border-amber-400/60" : isRecommendedEmpty ? "border-cyan-400/30" : "border-white/20"
                }`}
              />
            )}
          </div>
        );
      })}
      {allFields.some((f) => f.required && !attributes[f.key]) && (
        <p className="text-[10px] text-cyan-400/50 mt-1 col-span-2">Filling in highlighted fields increases your chances of selling</p>
      )}
    </div>
  );
}
