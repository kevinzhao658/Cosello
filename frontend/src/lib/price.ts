/**
 * Shared float-based price helpers for preview/display contexts.
 *
 * NOTE: These helpers use parseFloat and accept decimals (e.g. "$12.50").
 * They are intentionally distinct from the manual-path integer-only check
 * in App.tsx (whole-dollar prices, /^[0-9]+$/ + parseInt) and from
 * SellWizard's priceStringToCents (>= 0 semantics). Do not unify them.
 */

export function parsePriceFloat(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/^\$/, "").trim());
  return Number.isFinite(n) ? n : null;
}

export function isPricePositive(raw: string): boolean {
  const n = parsePriceFloat(raw);
  return n !== null && n > 0;
}

export function formatPriceDisplay(raw: string): string {
  const stripped = raw.replace(/^\$/, "").trim();
  const n = Number.parseFloat(stripped);
  return Number.isFinite(n) && n > 0 ? `$${stripped}` : "$—";
}
