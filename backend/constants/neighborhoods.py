"""Canonical Manhattan neighborhood list.

Source of truth for two consumers:
- supabase/migrations/0007_neighborhood_communities.sql + 0008_align_*.sql
  (pre-seed Community rows)
- backend/routers/communities.py (GET /api/communities/neighborhoods endpoint)

The FE consumes the list ONLY via the endpoint — there is no FE-local
list anymore (frontend/src/lib/neighborhoods.ts deleted in PR 2).

When extending to additional cities, append to the list and add a
follow-up migration that INSERTs the new rows.
"""

MANHATTAN_NEIGHBORHOODS: list[str] = [
    "Battery Park City",
    "Carnegie Hill",
    "Chelsea",
    "Chinatown",
    "Civic Center",
    "Clinton (Hell's Kitchen)",
    "East Harlem",
    "East Village",
    "Financial District",
    "Flatiron District",
    "Gramercy Park",
    "Greenwich Village",
    "Hamilton Heights",
    "Harlem",
    "Hudson Heights",
    "Inwood",
    "Kips Bay",
    "Lenox Hill",
    "Lincoln Square",
    "Little Italy",
    "Lower East Side",
    "Marble Hill",
    "Midtown East",
    "Midtown West",
    "Morningside Heights",
    "Murray Hill",
    "NoHo",
    "NoMad",
    "Nolita",
    "Roosevelt Island",
    "SoHo",
    "Stuyvesant Town",
    "Sutton Place",
    "Theater District",
    "Tribeca",
    "Tudor City",
    "Turtle Bay",
    "Two Bridges",
    "Upper East Side",
    "Upper West Side",
    "Washington Heights",
    "West Village",
    "Yorkville",
]
