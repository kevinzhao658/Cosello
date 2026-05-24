"""Canonical Manhattan neighborhood list.

Source of truth for two consumers:
- supabase/migrations/0007_neighborhood_communities.sql (pre-seeds Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods endpoint)

When extending to additional cities, append to the list — the migration is
idempotent via ON CONFLICT DO NOTHING.
"""

# Curated from NYC Department of City Planning's Neighborhood Tabulation Areas
# (NTAs) for Manhattan. Names match common usage; not a strict NTA mapping.
MANHATTAN_NEIGHBORHOODS: list[str] = [
    "Chelsea",
    "Chinatown",
    "East Harlem",
    "East Village",
    "Financial District",
    "Flatiron",
    "Gramercy",
    "Greenwich Village",
    "Harlem",
    "Hell's Kitchen",
    "Inwood",
    "Kips Bay",
    "Little Italy",
    "Lower East Side",
    "Midtown East",
    "Midtown West",
    "Morningside Heights",
    "Murray Hill",
    "NoHo",
    "NoLita",
    "Roosevelt Island",
    "SoHo",
    "Times Square",
    "Tribeca",
    "Two Bridges",
    "Union Square",
    "Upper East Side",
    "Upper West Side",
    "Washington Heights",
    "West Village",
]
