/**
 * Relative-time string from an epoch-seconds timestamp.
 *
 * Examples: "just now", "5 min ago", "2 hours ago", "3 days ago",
 * "2 months ago", "1 year ago".
 */
export function formatRelativeTime(epochSeconds: number): string {
  const now = Date.now() / 1000;
  const delta = Math.max(0, now - epochSeconds);
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)} min ago`;
  if (delta < 86400) {
    const h = Math.floor(delta / 3600);
    return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  }
  const days = Math.floor(delta / 86400);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/**
 * Walking-estimate display label.
 *
 * - Under 10 min: "<10 min" (privacy circle edge case)
 * - 10-59 min: "~N min"
 * - 60+ min: "~N hr" or "~N hr M min"
 */
export function formatWalkMinutes(mins: number): string {
  if (mins < 10) return "<10 min";
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `~${h} hr ${m} min` : `~${h} hr`;
  }
  return `~${mins} min`;
}

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
