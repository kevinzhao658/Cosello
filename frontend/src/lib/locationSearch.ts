import { NYC_ZIPS, ZIP_NEIGHBORHOOD } from "./nycZips";

/**
 * Searches Manhattan ZIPs by ZIP prefix or CANONICAL neighborhood name.
 *
 * Each returned entry's `neighborhood` is the canonical label from
 * ZIP_NEIGHBORHOOD (the value that gets saved to the user profile and
 * determines community membership), NOT the descriptive USPS alias from
 * NYC_ZIPS. This keeps the dropdown options consistent with the selected
 * display in LocationCombobox.
 *
 * Ranking:
 *   Tier 1 — exact ZIP match (single entry at most)
 *   Tier 2 — ZIP starts with the query digits
 *   Tier 3 — canonical neighborhood name starts with the query (case-insensitive)
 *   Tier 4 — canonical neighborhood name contains the query (case-insensitive)
 *
 * Stable within each tier. Returns at most 6 results.
 * Empty or whitespace-only query returns [].
 */
export function searchLocations(
  query: string,
): { zip: string; neighborhood: string }[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];

  const tier1: { zip: string; neighborhood: string }[] = [];
  const tier2: { zip: string; neighborhood: string }[] = [];
  const tier3: { zip: string; neighborhood: string }[] = [];
  const tier4: { zip: string; neighborhood: string }[] = [];

  for (const entry of NYC_ZIPS) {
    const canonicalNeighborhood = ZIP_NEIGHBORHOOD[entry.zip];
    // Skip ZIPs that have no canonical mapping (should not happen with aligned data).
    if (!canonicalNeighborhood) continue;

    const zipLower = entry.zip.toLowerCase();
    const nameLower = canonicalNeighborhood.toLowerCase();
    const canonical = { zip: entry.zip, neighborhood: canonicalNeighborhood };

    if (zipLower === q) {
      tier1.push(canonical);
    } else if (zipLower.startsWith(q)) {
      tier2.push(canonical);
    } else if (nameLower.startsWith(q)) {
      tier3.push(canonical);
    } else if (nameLower.includes(q)) {
      tier4.push(canonical);
    }
  }

  return [...tier1, ...tier2, ...tier3, ...tier4].slice(0, 6);
}
