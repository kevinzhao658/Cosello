"""Phase-2 Mapbox integration helpers — static map image + walking-time estimate.

All functions degrade gracefully to ``None`` when ``MAPBOX_TOKEN`` is not set or
when Mapbox returns an error / times out.  No FastAPI imports — pure functions
only so they can be unit-tested without spinning up the app.

Phase-2 integration points:
  - ``build_static_map_url``  — Mapbox Static Images API (backend-proxied PNG)
  - ``fetch_static_map_png``  — streams the image bytes; token never leaves the server
  - ``walking_minutes``       — Mapbox Directions API, walking profile, duration only

Phase-3 hooks (not yet implemented):
  - Car / subway ETAs (deferred; subway requires a transit vendor or GTFS)
  - Post-acceptance real route + precise ETA
"""
from __future__ import annotations

import json
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

# Buyer-facing approximate-area circle radius (miles). 0.15 mi at zoom 15 keeps
# the circle well inside the frame with street labels visible around it (user-
# aligned 2026-06-11; was LOCATION_FUZZ_RADIUS_MI=0.4 which swallowed the frame).
# Becomes the default for per-listing `map_radius_mi` when Phase 2b lands.
MAP_CIRCLE_RADIUS_MI = 0.15

# Mapbox Static Images endpoint base
_STATIC_BASE = "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static"

# Mapbox Directions endpoint base
_DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox"

# Approximate degrees per mile at mid-Manhattan latitude (~40.75 N).
# Used to convert the fuzz radius (miles) into polygon degrees for the overlay.
_DEG_PER_MILE_LAT = 1.0 / 69.0      # latitude degrees per mile (roughly constant)
_DEG_PER_MILE_LNG_40 = 1.0 / 52.6   # longitude degrees per mile at ~40.75 N


def _circle_geojson(lat: float, lng: float, radius_mi: float, n_points: int = 64) -> str:
    """Return a compact GeoJSON Polygon string approximating a circle.

    The polygon is used as a Mapbox Static Images ``geojson`` overlay to
    communicate the approximate pickup area without revealing an exact pin.
    """
    r_lat = radius_mi * _DEG_PER_MILE_LAT
    r_lng = radius_mi * _DEG_PER_MILE_LNG_40
    coords: list[list[float]] = []
    for i in range(n_points):
        angle = 2 * math.pi * i / n_points
        coords.append([
            round(lng + r_lng * math.cos(angle), 6),
            round(lat + r_lat * math.sin(angle), 6),
        ])
    coords.append(coords[0])  # close ring
    geojson = {
        "type": "Feature",
        "properties": {
            "fill": "#D4A017",        # warm amber — Cosello brand-ish
            "fill-opacity": 0.25,
            "stroke": "#D4A017",
            "stroke-width": 2,
            "stroke-opacity": 0.6,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords],
        },
    }
    return json.dumps(geojson, separators=(",", ":"))


def build_static_map_url(lat: float, lng: float, radius_mi: float, token: str) -> str:
    """Build a Mapbox Static Images URL with a translucent circle overlay.

    The circle is centred on ``(lat, lng)`` with an approximate radius of
    ``radius_mi`` miles (drawn from the listing's already-coarsened coordinates).
    No marker/pin is added — the circle alone communicates the approximate area.

    Returns a URL string pointing at a 640×400 @2x PNG.
    """
    import urllib.parse

    geojson_str = _circle_geojson(lat, lng, radius_mi)
    encoded = urllib.parse.quote(geojson_str, safe="")
    overlay = f"geojson({encoded})"
    # Zoom 15 — streets-v12 renders numbered cross-street labels (25th St,
    # 40th St…) from z15; z14 left the map mostly label-less. The 0.4 mi
    # circle still fits the 640x400 frame at this zoom. @2x for HiDPI.
    position = f"{lng},{lat},15,0"
    url = (
        f"{_STATIC_BASE}"
        f"/{overlay}"
        f"/{position}"
        f"/640x400@2x"
        f"?access_token={token}"
    )
    return url


def fetch_static_map_png(
    lat: float, lng: float, radius_mi: float, token: str
) -> Optional[bytes]:
    """GET the Mapbox static map PNG and return the raw bytes.

    Returns ``None`` on any network error, timeout, or non-200 response so the
    caller can fall back to a 503/204 gracefully.  The Mapbox token is only ever
    embedded in the server-side HTTP request — it is never returned to the client.

    Timeout: 4 seconds (keeps modal render unblocked).
    """
    import httpx

    url = build_static_map_url(lat, lng, radius_mi, token)
    try:
        resp = httpx.get(url, timeout=4.0, follow_redirects=True)
        if resp.status_code == 200:
            return resp.content
        logger.warning("Mapbox static map returned HTTP %s", resp.status_code)
        return None
    except Exception as exc:  # network error, timeout, etc.
        logger.warning("Mapbox static map fetch failed: %s", exc)
        return None


def walking_minutes(
    o_lat: float, o_lng: float, d_lat: float, d_lng: float, token: str
) -> Optional[int]:
    """Estimate walking time in whole minutes using the Mapbox Directions API.

    Calls the ``walking`` profile between the buyer's ZIP centroid ``(o_lat,
    o_lng)`` and the listing's coarse centroid ``(d_lat, d_lng)``.  Returns the
    duration rounded **up** to the next whole minute, or ``None`` on any error,
    timeout, or route-not-found.

    Only the duration is returned — no route geometry is passed to the caller.
    Timeout: 4 seconds.
    """
    import httpx
    import math as _math

    url = (
        f"{_DIRECTIONS_BASE}/walking"
        f"/{o_lng},{o_lat};{d_lng},{d_lat}"
        f"?geometries=geojson"
        f"&overview=false"
        f"&access_token={token}"
    )
    try:
        resp = httpx.get(url, timeout=4.0, follow_redirects=True)
        if resp.status_code != 200:
            logger.warning("Mapbox Directions returned HTTP %s", resp.status_code)
            return None
        data = resp.json()
        routes = data.get("routes") or []
        if not routes:
            logger.warning("Mapbox Directions: no routes returned")
            return None
        duration_sec: float = routes[0].get("duration", 0.0)
        # Round up to whole minutes (math.ceil of seconds / 60)
        return int(_math.ceil(duration_sec / 60.0))
    except Exception as exc:
        logger.warning("Mapbox Directions fetch failed: %s", exc)
        return None
