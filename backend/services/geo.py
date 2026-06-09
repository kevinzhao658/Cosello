"""Coarse geo helpers for ZIP-centroid distance. No external API.

Distance is center-to-center between ZIP centroids (intentionally coarse —
matches the privacy model where exact pickup points are never published).
"""
import math

# Fixed privacy radius (miles) for the published location circle. Phase 1 shows
# only the numeric "~X mi away"; Phase 2 draws this circle on a map. ~Manhattan-
# average ZIP footprint.
LOCATION_FUZZ_RADIUS_MI = 0.4

_EARTH_RADIUS_MI = 3958.7613


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in miles between two lat/long points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return _EARTH_RADIUS_MI * 2 * math.asin(math.sqrt(a))


def round_coord(value: float) -> float:
    """Round a coordinate to ~110 m so an exact point is never published."""
    return round(value, 3)


def centroid_for_zip(db, zip_code: str | None):
    """Return (lat, lng) for a ZIP, or None if missing/unseeded."""
    if not zip_code:
        return None
    from models import ZipCentroid
    row = db.get(ZipCentroid, zip_code)
    return (row.latitude, row.longitude) if row else None
