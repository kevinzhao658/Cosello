"""Representative seeded ZIP per Manhattan neighborhood. Used to prefill the
signup ZIP and to derive a default for ZIP-less existing users. Coarse by
design (neighborhood-level); users refine via the dropdown. Every value MUST be
a ZIP seeded in scripts/seed_zip_centroids.py (enforced by test_neighborhood_zips)."""

NEIGHBORHOOD_ZIP: dict[str, str] = {
    "Battery Park City": "10280", "Carnegie Hill": "10128", "Chelsea": "10011",
    "Chinatown": "10013", "Civic Center": "10007", "Clinton (Hell's Kitchen)": "10019",
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
