"""Representative seeded ZIP per Manhattan neighborhood. Used to prefill the
signup ZIP and to derive a default for ZIP-less existing users. Coarse by
design (neighborhood-level); users refine via the dropdown. Every value MUST be
a ZIP seeded in scripts/seed_zip_centroids.py (enforced by test_neighborhood_zips)."""

NEIGHBORHOOD_ZIP: dict[str, str] = {
    "Battery Park City": "10280", "Carnegie Hill": "10128", "Chelsea": "10011",
    "Chinatown": "10013", "Civic Center": "10007", "Hell's Kitchen": "10019",
    "East Harlem": "10029", "East Village": "10009", "Financial District": "10004",
    "Flatiron District": "10010", "Gramercy Park": "10010", "Greenwich Village": "10012",
    "Hamilton Heights": "10031", "Harlem": "10027", "Hudson Heights": "10033",
    "Inwood": "10034", "Kips Bay": "10016", "Lenox Hill": "10021",
    "Lincoln Square": "10023", "Little Italy": "10013", "Lower East Side": "10002",
    "Marble Hill": "10034", "Midtown East": "10022", "Midtown West": "10019",
    "Morningside Heights": "10025", "Murray Hill": "10016", "NoHo": "10012",
    "NoMad": "10001", "Nolita": "10012", "Roosevelt Island": "10044",
    "SoHo": "10012", "Stuyvesant Town": "10009", "Sutton Place": "10022",
    "Theater District": "10036", "Tribeca": "10013", "Tudor City": "10017",
    "Turtle Bay": "10022", "Two Bridges": "10002", "Upper East Side": "10021",
    "Upper West Side": "10024", "Washington Heights": "10032", "West Village": "10014",
    "Yorkville": "10028",
}

# Representative ZIP for each commuter-belt neighborhood (append to NEIGHBORHOOD_ZIP above).
NEIGHBORHOOD_ZIP.update({
    "Long Island City": "11101", "Astoria": "11102", "Sunnyside": "11104",
    "Woodside": "11377", "Jackson Heights": "11372", "Forest Hills": "11375",
    "Greenpoint": "11222", "Williamsburg": "11211", "Bushwick": "11237",
    "Bedford-Stuyvesant": "11216", "Clinton Hill": "11205", "DUMBO": "11201",
    "Boerum Hill": "11217", "Prospect Heights": "11238", "Park Slope": "11215",
    "Carroll Gardens": "11231", "Crown Heights": "11213",
    "Prospect-Lefferts Gardens": "11225", "Flatbush": "11226",
})

# ZIP -> the single canonical neighborhood that contains it. Every value MUST be
# a member of NYC_NEIGHBORHOODS (enforced by test_neighborhood_zips). Mirrors the
# FE map in frontend/src/lib/nycZips.ts (keep the two in sync).
ZIP_NEIGHBORHOOD: dict[str, str] = {
    # --- Manhattan ---
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
    # --- Queens (commuter belt) ---
    "11101": "Long Island City", "11109": "Long Island City",
    "11102": "Astoria", "11103": "Astoria", "11105": "Astoria", "11106": "Astoria",
    "11104": "Sunnyside", "11377": "Woodside", "11372": "Jackson Heights",
    "11375": "Forest Hills",
    # --- Brooklyn (commuter belt) ---
    "11222": "Greenpoint", "11211": "Williamsburg", "11249": "Williamsburg",
    "11206": "Williamsburg", "11237": "Bushwick", "11221": "Bushwick",
    "11216": "Bedford-Stuyvesant", "11233": "Bedford-Stuyvesant",
    "11205": "Clinton Hill", "11201": "DUMBO", "11217": "Boerum Hill",
    "11238": "Prospect Heights", "11215": "Park Slope", "11231": "Carroll Gardens",
    "11213": "Crown Heights", "11225": "Prospect-Lefferts Gardens", "11226": "Flatbush",
}
