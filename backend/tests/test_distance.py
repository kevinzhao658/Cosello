"""Tests for geo-tagging: listing coord defaulting + distance computation.

Covers:
  - Listing.to_dict() serializes latitude/longitude/zip_code
  - create_listing defaults coords from the seller's ZIP centroid
  - GET /api/listings returns distance_miles and filters by max_distance
"""
import json
import io


def _img_bytes() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc\xff"
        b"\xff?\x03\x00\x06\xfc\x02\xfe\xa7V\xbd\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_listing_to_dict_has_geo_keys(db_session):
    from models import Listing
    import time
    l = Listing(id="geo-test-1", user_id="00000000-0000-0000-0000-000000000000",
                price_cents=1000, posted_at=time.time(), latitude=40.735,
                longitude=-74.006, zip_code="10014")
    d = l.to_dict()
    assert d["latitude"] == 40.735 and d["longitude"] == -74.006 and d["zip_code"] == "10014"


def test_create_listing_defaults_to_seller_zip_centroid(authed_client, test_user, db_session, mock_storage):
    from models import ZipCentroid, Listing
    if db_session.get(ZipCentroid, "10014") is None:
        db_session.add(ZipCentroid(zip_code="10014", latitude=40.734, longitude=-74.006, borough="Manhattan"))
    test_user.zip_code = "10014"; db_session.commit()
    form = {
        "data": (None, json.dumps({"brand": "B", "name": "N", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "West Village"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 201
    lid = r.json()["id"]
    row = db_session.get(Listing, lid)
    assert row.zip_code == "10014" and row.latitude == 40.734 and row.longitude == -74.006


def test_create_listing_no_zip_leaves_coords_null(authed_client, test_user, db_session, mock_storage):
    from models import Listing
    test_user.zip_code = None; db_session.commit()
    form = {
        "data": (None, json.dumps({"brand": "B", "name": "N", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "Somewhere"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 201
    row = db_session.get(Listing, r.json()["id"])
    assert row.latitude is None and row.longitude is None


def test_listings_returns_distance_and_filters(authed_client, test_user, db_session, mock_storage):
    from models import ZipCentroid
    for z, la, lo in [("10014", 40.734, -74.006), ("10040", 40.858, -73.929)]:
        if db_session.get(ZipCentroid, z) is None:
            db_session.add(ZipCentroid(zip_code=z, latitude=la, longitude=lo, borough="Manhattan"))
    # buyer in West Village
    test_user.zip_code = "10014"; db_session.commit()
    # one near listing (10014), one far (10040 ~ 8.5 mi)
    for z in ("10014", "10040"):
        test_user.zip_code = z; db_session.commit()  # seller zip drives listing centroid
        authed_client.post("/api/listings", files={
            "data": (None, json.dumps({"brand": "B", "name": f"N-{z}", "description": "d",
                     "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                     "categoryAttributes": {}})),
            "communities": (None, ""), "visibility": (None, "public"),
            "pickup_location": (None, "X"), "images": ("t.png", _img_bytes(), "image/png")})
    test_user.zip_code = "10014"; db_session.commit()  # browse as West Village buyer

    full = authed_client.get("/api/listings").json()
    items = full if isinstance(full, list) else full.get("listings", full.get("results", []))
    by_name = {i["name"]: i for i in items}
    assert by_name["N-10014"]["distance_miles"] == 0.0
    assert by_name["N-10040"]["distance_miles"] > 5

    near = authed_client.get("/api/listings", params={"max_distance": 1}).json()
    near_items = near if isinstance(near, list) else near.get("listings", near.get("results", []))
    near_names = {i["name"] for i in near_items}
    assert "N-10014" in near_names and "N-10040" not in near_names


def test_listings_distance_null_when_buyer_has_no_zip(authed_client, test_user, db_session, mock_storage):
    test_user.zip_code = None; db_session.commit()
    res = authed_client.get("/api/listings").json()
    items = res if isinstance(res, list) else res.get("listings", res.get("results", []))
    assert all(i.get("distance_miles") is None for i in items)
