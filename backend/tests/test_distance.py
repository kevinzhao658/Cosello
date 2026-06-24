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
        "pickup_zip": (None, "10014"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 201
    lid = r.json()["id"]
    row = db_session.get(Listing, lid)
    assert row.zip_code == "10014" and row.latitude == 40.734 and row.longitude == -74.006


def test_create_listing_no_zip_leaves_coords_null(authed_client, test_user, db_session, mock_storage):
    """Omitting pickup_zip or sending an invalid value returns 400."""
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
    assert r.status_code == 400
    assert "ZIP" in r.json()["detail"]


def test_listings_returns_distance_and_filters(authed_client, test_user, db_session, mock_storage, make_user, override_auth_user):
    from models import ZipCentroid
    for z, la, lo in [("10014", 40.734, -74.006), ("10040", 40.858, -73.929)]:
        if db_session.get(ZipCentroid, z) is None:
            db_session.add(ZipCentroid(zip_code=z, latitude=la, longitude=lo, borough="Manhattan"))
    db_session.commit()

    # Create two sellers (different users) so their listings are visible to the buyer.
    seller_near = make_user(zip_code="10014")
    seller_far = make_user(zip_code="10040")

    # Post a near listing as seller_near
    override_auth_user(seller_near)
    authed_client.post("/api/listings", files={
        "data": (None, json.dumps({"brand": "B", "name": "N-10014", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "X"), "pickup_zip": (None, "10014"),
        "images": ("t.png", _img_bytes(), "image/png")})

    # Post a far listing as seller_far
    override_auth_user(seller_far)
    authed_client.post("/api/listings", files={
        "data": (None, json.dumps({"brand": "B", "name": "N-10040", "description": "d",
                 "priceCents": 1000, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "X"), "pickup_zip": (None, "10040"),
        "images": ("t.png", _img_bytes(), "image/png")})

    # Browse as the buyer (West Village, 10014)
    test_user.zip_code = "10014"; db_session.commit()
    override_auth_user(test_user)

    full = authed_client.get("/api/listings").json()
    # New envelope: {items: [...], nextCursor: ...}
    assert "items" in full and "nextCursor" in full
    items = full["items"]
    by_name = {i["name"]: i for i in items}
    assert by_name["N-10014"]["distance_miles"] == 0.0
    assert by_name["N-10040"]["distance_miles"] > 5

    near = authed_client.get("/api/listings", params={"max_distance": 1}).json()
    # New envelope
    assert "items" in near and "nextCursor" in near
    near_names = {i["name"] for i in near["items"]}
    assert "N-10014" in near_names and "N-10040" not in near_names


def test_listings_distance_null_when_buyer_has_no_zip(authed_client, test_user, db_session, mock_storage):
    test_user.zip_code = None; db_session.commit()
    res = authed_client.get("/api/listings").json()
    # New envelope: {items: [...], nextCursor: ...}
    assert "items" in res and "nextCursor" in res
    assert all(i.get("distance_miles") is None for i in res["items"])


# ---------------------------------------------------------------------------
# pickup_zip validation tests
# ---------------------------------------------------------------------------

def _base_form(pickup_zip: str) -> dict:
    return {
        "data": (None, json.dumps({"brand": "B", "name": "V", "description": "d",
                 "priceCents": 500, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "Test"),
        "pickup_zip": (None, pickup_zip),
        "images": ("t.png", _img_bytes(), "image/png"),
    }


def test_pickup_zip_missing_returns_400(authed_client, test_user, db_session, mock_storage):
    """Posting without pickup_zip field defaults to empty string, which fails validation."""
    form = {
        "data": (None, json.dumps({"brand": "B", "name": "V", "description": "d",
                 "priceCents": 500, "condition": "Good", "tags": [], "category": "other",
                 "categoryAttributes": {}})),
        "communities": (None, ""), "visibility": (None, "public"),
        "pickup_location": (None, "Test"),
        "images": ("t.png", _img_bytes(), "image/png"),
    }
    r = authed_client.post("/api/listings", files=form)
    assert r.status_code == 400
    assert "ZIP" in r.json()["detail"]


def test_pickup_zip_non_digits_returns_400(authed_client, test_user, db_session, mock_storage):
    """Non-numeric or wrong-length ZIP is rejected."""
    r = authed_client.post("/api/listings", files=_base_form("ABCDE"))
    assert r.status_code == 400
    assert "ZIP" in r.json()["detail"]


def test_pickup_zip_too_short_returns_400(authed_client, test_user, db_session, mock_storage):
    """Fewer than 5 digits is rejected."""
    r = authed_client.post("/api/listings", files=_base_form("1001"))
    assert r.status_code == 400
    assert "ZIP" in r.json()["detail"]


def test_pickup_zip_unseeded_returns_400(authed_client, test_user, db_session, mock_storage):
    """A syntactically valid ZIP that is not in zip_centroids is rejected."""
    r = authed_client.post("/api/listings", files=_base_form("99999"))
    assert r.status_code == 400
    assert "ZIP" in r.json()["detail"]


def test_pickup_zip_valid_returns_201_with_centroid(authed_client, test_user, db_session, mock_storage):
    """Valid, seeded ZIP produces a 201 and the listing's coords match the centroid."""
    from models import ZipCentroid, Listing
    if db_session.get(ZipCentroid, "10014") is None:
        db_session.add(ZipCentroid(zip_code="10014", latitude=40.734, longitude=-74.006, borough="Manhattan"))
        db_session.commit()
    r = authed_client.post("/api/listings", files=_base_form("10014"))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["zip_code"] == "10014"
    # Coords should be round_coord(centroid) = round(value, 3)
    assert body["latitude"] == round(40.734, 3)
    assert body["longitude"] == round(-74.006, 3)
