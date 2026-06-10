/**
 * Manhattan ZIP codes — exact match with backend/scripts/seed_zip_centroids.py.
 * Keeping these in sync prevents "valid in dropdown but rejected by backend" drift.
 * Sorted ascending by ZIP string.
 */
export const NYC_ZIPS: readonly { zip: string; neighborhood: string }[] = [
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
] as const;

/** Set of valid ZIP strings — O(1) membership check. */
export const NYC_ZIP_SET: ReadonlySet<string> = new Set(NYC_ZIPS.map((z) => z.zip));

/**
 * Representative seeded ZIP per Manhattan neighborhood.
 * Mirrors backend/constants/neighborhood_zips.py exactly (43 entries).
 * Used to prefill the signup ZIP from a selected neighborhood.
 */
export const NEIGHBORHOOD_ZIP: Readonly<Record<string, string>> = {
  "Battery Park City": "10280",
  "Carnegie Hill": "10128",
  "Chelsea": "10011",
  "Chinatown": "10013",
  "Civic Center": "10007",
  "Clinton (Hell's Kitchen)": "10019",
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
} as const;

// ZIP → the canonical Manhattan neighborhood that contains it. Each value MUST
// be a member of MANHATTAN_NEIGHBORHOODS so it's a valid user.neighborhood (and
// resolves to a neighborhood community). Used to keep the neighborhood label in
// sync when a user confirms/changes their ZIP. A ZIP can sit in more than one
// neighborhood; we pick one representative.
export const ZIP_NEIGHBORHOOD: Readonly<Record<string, string>> = {
  "10001": "NoMad", "10002": "Lower East Side", "10003": "East Village",
  "10004": "Financial District", "10005": "Financial District", "10006": "Financial District",
  "10007": "Tribeca", "10009": "East Village", "10010": "Gramercy Park",
  "10011": "Chelsea", "10012": "SoHo", "10013": "Tribeca", "10014": "West Village",
  "10016": "Murray Hill", "10017": "Midtown East", "10018": "Midtown West",
  "10019": "Clinton (Hell's Kitchen)", "10021": "Lenox Hill", "10022": "Midtown East",
  "10023": "Lincoln Square", "10024": "Upper West Side", "10025": "Upper West Side",
  "10026": "Harlem", "10027": "Morningside Heights", "10028": "Yorkville",
  "10029": "East Harlem", "10030": "Harlem", "10031": "Hamilton Heights",
  "10032": "Washington Heights", "10033": "Washington Heights", "10034": "Inwood",
  "10035": "East Harlem", "10036": "Theater District", "10037": "Harlem",
  "10038": "Financial District", "10039": "Harlem", "10040": "Inwood",
  "10044": "Roosevelt Island", "10065": "Lenox Hill", "10075": "Upper East Side",
  "10128": "Carnegie Hill", "10280": "Battery Park City",
} as const;
