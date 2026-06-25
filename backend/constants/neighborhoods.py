"""Canonical NYC neighborhood list (Manhattan + close-in Queens/Brooklyn
commuter belt).

Source of truth for two consumers:
- supabase/migrations/0007_*, 0008_*, 0020_* (pre-seed Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods)

The FE consumes the list ONLY via the endpoint. When extending to more
neighborhoods, append here AND add a follow-up migration that INSERTs the
new community rows.
"""

NYC_NEIGHBORHOODS: list[str] = [
    # --- Manhattan ---
    "Battery Park City", "Carnegie Hill", "Chelsea", "Chinatown", "Civic Center",
    "Hell's Kitchen", "East Harlem", "East Village", "Financial District",
    "Flatiron District", "Gramercy Park", "Greenwich Village", "Hamilton Heights",
    "Harlem", "Hudson Heights", "Inwood", "Kips Bay", "Lenox Hill", "Lincoln Square",
    "Little Italy", "Lower East Side", "Marble Hill", "Midtown East", "Midtown West",
    "Morningside Heights", "Murray Hill", "NoHo", "NoMad", "Nolita",
    "Roosevelt Island", "SoHo", "Stuyvesant Town", "Sutton Place", "Theater District",
    "Tribeca", "Tudor City", "Turtle Bay", "Two Bridges", "Upper East Side",
    "Upper West Side", "Washington Heights", "West Village", "Yorkville",
    # --- Queens (commuter belt) ---
    "Long Island City", "Astoria", "Sunnyside", "Woodside", "Jackson Heights",
    "Forest Hills",
    # --- Brooklyn (commuter belt) ---
    "Greenpoint", "Williamsburg", "Bushwick", "Bedford-Stuyvesant", "Clinton Hill",
    "DUMBO", "Boerum Hill", "Prospect Heights", "Park Slope", "Carroll Gardens",
    "Crown Heights", "Prospect-Lefferts Gardens", "Flatbush",
]
