import { NYC_ZIPS } from "./nycZips";

/**
 * Searches the NYC_ZIPS list by ZIP prefix or neighborhood substring.
 *
 * Ranking:
 *   Tier 1 — exact ZIP match (single entry at most)
 *   Tier 2 — ZIP starts with the query digits
 *   Tier 3 — neighborhood name starts with the query (case-insensitive)
 *   Tier 4 — neighborhood name contains the query (case-insensitive)
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
    const zipLower = entry.zip.toLowerCase();
    const namelower = entry.neighborhood.toLowerCase();

    if (zipLower === q) {
      tier1.push(entry);
    } else if (zipLower.startsWith(q)) {
      tier2.push(entry);
    } else if (namelower.startsWith(q)) {
      tier3.push(entry);
    } else if (namelower.includes(q)) {
      tier4.push(entry);
    }
  }

  return [...tier1, ...tier2, ...tier3, ...tier4].slice(0, 6);
}
