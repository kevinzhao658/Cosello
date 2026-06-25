/**
 * NYC ZIP codes — Manhattan + close-in Queens/Brooklyn commuter belt.
 * Exact match with backend/scripts/seed_zip_centroids.py.
 * Keeping these in sync prevents "valid in dropdown but rejected by backend" drift.
 * Sorted ascending by ZIP string within each borough group.
 */
export const NYC_ZIPS: readonly { zip: string; neighborhood: string }[] = [
  // --- Manhattan ---
  { zip: "10001", neighborhood: "Chelsea / Penn Station" },
  { zip: "10002", neighborhood: "Lower East Side" },
  { zip: "10003", neighborhood: "East Village" },
  { zip: "10004", neighborhood: "Financial District / Governors Island" },
  { zip: "10005", neighborhood: "Financial District" },
  { zip: "10006", neighborhood: "Financial District / City Hall" },
  { zip: "10007", neighborhood: "Tribeca / City Hall" },
  { zip: "10009", neighborhood: "Alphabet City" },
  { zip: "10010", neighborhood: "Gramercy" },
  { zip: "10011", neighborhood: "Chelsea" },
  { zip: "10012", neighborhood: "NoHo / SoHo" },
  { zip: "10013", neighborhood: "Tribeca / SoHo" },
  { zip: "10014", neighborhood: "West Village" },
  { zip: "10016", neighborhood: "Murray Hill" },
  { zip: "10017", neighborhood: "Midtown East" },
  { zip: "10018", neighborhood: "Hell's Kitchen / Garment District" },
  { zip: "10019", neighborhood: "Midtown West" },
  { zip: "10021", neighborhood: "Upper East Side" },
  { zip: "10022", neighborhood: "Midtown East" },
  { zip: "10023", neighborhood: "Upper West Side" },
  { zip: "10024", neighborhood: "Upper West Side" },
  { zip: "10025", neighborhood: "Morningside Heights" },
  { zip: "10026", neighborhood: "Central Harlem" },
  { zip: "10027", neighborhood: "Harlem" },
  { zip: "10028", neighborhood: "Upper East Side" },
  { zip: "10029", neighborhood: "East Harlem" },
  { zip: "10030", neighborhood: "Harlem" },
  { zip: "10031", neighborhood: "Hamilton Heights" },
  { zip: "10032", neighborhood: "Washington Heights" },
  { zip: "10033", neighborhood: "Washington Heights" },
  { zip: "10034", neighborhood: "Inwood" },
  { zip: "10035", neighborhood: "East Harlem" },
  { zip: "10036", neighborhood: "Hell's Kitchen" },
  { zip: "10037", neighborhood: "Harlem" },
  { zip: "10038", neighborhood: "Fulton Seaport" },
  { zip: "10039", neighborhood: "Harlem" },
  { zip: "10040", neighborhood: "Washington Heights" },
  { zip: "10044", neighborhood: "Roosevelt Island" },
  { zip: "10065", neighborhood: "Upper East Side" },
  { zip: "10075", neighborhood: "Upper East Side" },
  { zip: "10128", neighborhood: "Yorkville" },
  { zip: "10280", neighborhood: "Battery Park City" },
  // --- Queens (commuter belt) ---
  { zip: "11101", neighborhood: "Long Island City" },
  { zip: "11102", neighborhood: "Astoria" },
  { zip: "11103", neighborhood: "Astoria" },
  { zip: "11104", neighborhood: "Sunnyside" },
  { zip: "11105", neighborhood: "Astoria" },
  { zip: "11106", neighborhood: "Astoria" },
  { zip: "11109", neighborhood: "Long Island City" },
  { zip: "11372", neighborhood: "Jackson Heights" },
  { zip: "11375", neighborhood: "Forest Hills" },
  { zip: "11377", neighborhood: "Woodside" },
  // --- Brooklyn (commuter belt) ---
  { zip: "11201", neighborhood: "DUMBO" },
  { zip: "11205", neighborhood: "Clinton Hill" },
  { zip: "11206", neighborhood: "Williamsburg" },
  { zip: "11211", neighborhood: "Williamsburg" },
  { zip: "11213", neighborhood: "Crown Heights" },
  { zip: "11215", neighborhood: "Park Slope" },
  { zip: "11216", neighborhood: "Bedford-Stuyvesant" },
  { zip: "11217", neighborhood: "Boerum Hill" },
  { zip: "11221", neighborhood: "Bushwick" },
  { zip: "11222", neighborhood: "Greenpoint" },
  { zip: "11225", neighborhood: "Prospect-Lefferts Gardens" },
  { zip: "11226", neighborhood: "Flatbush" },
  { zip: "11231", neighborhood: "Carroll Gardens" },
  { zip: "11233", neighborhood: "Bedford-Stuyvesant" },
  { zip: "11237", neighborhood: "Bushwick" },
  { zip: "11238", neighborhood: "Prospect Heights" },
  { zip: "11249", neighborhood: "Williamsburg" },
] as const;

/** Set of valid ZIP strings — O(1) membership check. */
export const NYC_ZIP_SET: ReadonlySet<string> = new Set(NYC_ZIPS.map((z) => z.zip));

/**
 * Representative seeded ZIP per neighborhood.
 * Mirrors backend/constants/neighborhood_zips.py NEIGHBORHOOD_ZIP exactly (62 entries).
 * Used to prefill the signup ZIP from a selected neighborhood.
 */
export const NEIGHBORHOOD_ZIP: Readonly<Record<string, string>> = {
  // --- Manhattan ---
  "Battery Park City": "10280",
  "Carnegie Hill": "10128",
  "Chelsea": "10011",
  "Chinatown": "10013",
  "Civic Center": "10007",
  "Hell's Kitchen": "10019",
  "East Harlem": "10029",
  "East Village": "10009",
  "Financial District": "10004",
  "Flatiron District": "10010",
  "Gramercy Park": "10010",
  "Greenwich Village": "10012",
  "Hamilton Heights": "10031",
  "Harlem": "10027",
  "Hudson Heights": "10033",
  "Inwood": "10034",
  "Kips Bay": "10016",
  "Lenox Hill": "10021",
  "Lincoln Square": "10023",
  "Little Italy": "10013",
  "Lower East Side": "10002",
  "Marble Hill": "10034",
  "Midtown East": "10022",
  "Midtown West": "10019",
  "Morningside Heights": "10025",
  "Murray Hill": "10016",
  "NoHo": "10012",
  "NoMad": "10001",
  "Nolita": "10012",
  "Roosevelt Island": "10044",
  "SoHo": "10012",
  "Stuyvesant Town": "10009",
  "Sutton Place": "10022",
  "Theater District": "10036",
  "Tribeca": "10013",
  "Tudor City": "10017",
  "Turtle Bay": "10022",
  "Two Bridges": "10002",
  "Upper East Side": "10021",
  "Upper West Side": "10024",
  "Washington Heights": "10032",
  "West Village": "10014",
  "Yorkville": "10028",
  // --- Queens (commuter belt) ---
  "Long Island City": "11101",
  "Astoria": "11102",
  "Sunnyside": "11104",
  "Woodside": "11377",
  "Jackson Heights": "11372",
  "Forest Hills": "11375",
  // --- Brooklyn (commuter belt) ---
  "Greenpoint": "11222",
  "Williamsburg": "11211",
  "Bushwick": "11237",
  "Bedford-Stuyvesant": "11216",
  "Clinton Hill": "11205",
  "DUMBO": "11201",
  "Boerum Hill": "11217",
  "Prospect Heights": "11238",
  "Park Slope": "11215",
  "Carroll Gardens": "11231",
  "Crown Heights": "11213",
  "Prospect-Lefferts Gardens": "11225",
  "Flatbush": "11226",
} as const;

// ZIP → the single canonical neighborhood that contains it. Each value MUST be
// a member of NYC_NEIGHBORHOODS so it's a valid user.neighborhood (and resolves
// to a neighborhood community). Mirrors backend/constants/neighborhood_zips.py
// ZIP_NEIGHBORHOOD (keep the two in sync). A ZIP can sit in more than one
// neighborhood; we pick one representative.
export const ZIP_NEIGHBORHOOD: Readonly<Record<string, string>> = {
  // --- Manhattan ---
  "10001": "NoMad", "10002": "Lower East Side", "10003": "East Village",
  "10004": "Financial District", "10005": "Financial District", "10006": "Financial District",
  "10007": "Tribeca", "10009": "East Village", "10010": "Gramercy Park",
  "10011": "Chelsea", "10012": "SoHo", "10013": "Tribeca", "10014": "West Village",
  "10016": "Murray Hill", "10017": "Midtown East", "10018": "Midtown West",
  "10019": "Hell's Kitchen", "10021": "Lenox Hill", "10022": "Midtown East",
  "10023": "Lincoln Square", "10024": "Upper West Side", "10025": "Upper West Side",
  "10026": "Harlem", "10027": "Morningside Heights", "10028": "Yorkville",
  "10029": "East Harlem", "10030": "Harlem", "10031": "Hamilton Heights",
  "10032": "Washington Heights", "10033": "Washington Heights", "10034": "Inwood",
  "10035": "East Harlem", "10036": "Theater District", "10037": "Harlem",
  "10038": "Financial District", "10039": "Harlem", "10040": "Inwood",
  "10044": "Roosevelt Island", "10065": "Lenox Hill", "10075": "Upper East Side",
  "10128": "Carnegie Hill", "10280": "Battery Park City",
  // --- Queens (commuter belt) ---
  "11101": "Long Island City", "11109": "Long Island City",
  "11102": "Astoria", "11103": "Astoria", "11105": "Astoria", "11106": "Astoria",
  "11104": "Sunnyside", "11377": "Woodside", "11372": "Jackson Heights", "11375": "Forest Hills",
  // --- Brooklyn (commuter belt) ---
  "11222": "Greenpoint", "11211": "Williamsburg", "11249": "Williamsburg", "11206": "Williamsburg",
  "11237": "Bushwick", "11221": "Bushwick", "11216": "Bedford-Stuyvesant", "11233": "Bedford-Stuyvesant",
  "11205": "Clinton Hill", "11201": "DUMBO", "11217": "Boerum Hill", "11238": "Prospect Heights",
  "11215": "Park Slope", "11231": "Carroll Gardens", "11213": "Crown Heights",
  "11225": "Prospect-Lefferts Gardens", "11226": "Flatbush",
} as const;

/**
 * Returns the first ZIP (ascending by ZIP string) whose canonical neighborhood
 * in ZIP_NEIGHBORHOOD matches `canonicalNeighborhood`. Falls back to
 * NEIGHBORHOOD_ZIP[canonicalNeighborhood] for neighborhoods whose ZIPs are all
 * shared with sibling areas (may return undefined).
 */
export function topZipForNeighborhood(
  canonicalNeighborhood: string,
): string | undefined {
  // NYC_ZIPS is already sorted ascending by ZIP string.
  for (const entry of NYC_ZIPS) {
    if (ZIP_NEIGHBORHOOD[entry.zip] === canonicalNeighborhood) {
      return entry.zip;
    }
  }
  return NEIGHBORHOOD_ZIP[canonicalNeighborhood];
}
