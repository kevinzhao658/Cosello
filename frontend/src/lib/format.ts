/**
 * Format a listing's display title from the unified `brand` + `name` fields.
 *
 * The data model now stores brand and name separately at the listing top
 * level (no more `categoryAttributes.brand` / `categoryAttributes.model`).
 * Anywhere the buyer-facing "title" of a listing is rendered, callers route
 * through this helper so the display stays consistent.
 *
 * Edge cases:
 *   • null / undefined inputs are coerced to ""
 *   • whitespace is trimmed off both ends
 *   • the literal string "Unknown" (case-insensitive) on `brand` is treated
 *     as empty — legacy rows and Vision fallbacks sometimes wrote that as a
 *     placeholder, and we don't want it leaking into the UI as a brand name
 *   • if both inputs collapse to empty, the result is an empty string
 *     (callers decide whether to render a placeholder; we never inject one)
 */
export function formatTitle(
  brand: string | null | undefined,
  name: string | null | undefined,
): string {
  const b = (brand ?? "").trim();
  const n = (name ?? "").trim();
  const safeBrand = b.toLowerCase() === "unknown" ? "" : b;
  const joined = [safeBrand, n].filter(Boolean).join(" ").trim();
  // Always capitalize the first character — sellers may type a brand
  // ("nike") or name ("air force 1") in lowercase, but the displayed
  // title should always start uppercase. Other letters stay as typed.
  if (!joined) return "";
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
