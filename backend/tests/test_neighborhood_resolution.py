from services.neighborhood import neighborhood_for_zip
from models import ZipCentroid, User


def test_neighborhood_for_zip_belt():
    assert neighborhood_for_zip("11211") == "Williamsburg"
    assert neighborhood_for_zip("11103") == "Astoria"
    assert neighborhood_for_zip("11201") == "DUMBO"


def test_neighborhood_for_zip_manhattan():
    assert neighborhood_for_zip("10014") == "West Village"


def test_neighborhood_for_zip_unknown_or_none():
    assert neighborhood_for_zip("99999") is None
    assert neighborhood_for_zip(None) is None
    assert neighborhood_for_zip("") is None


def _ensure_zip(db, zip_code, lat, lng, borough):
    if db.get(ZipCentroid, zip_code) is None:
        db.add(ZipCentroid(zip_code=zip_code, latitude=lat, longitude=lng, borough=borough))
        db.commit()


def test_register_offlist_label_falls_back_to_zip(authed_client, db_session, test_user):
    """A stale Mapbox label ('Koreatown') + a valid ZIP must NOT 400; the
    neighborhood is corrected to the ZIP's canonical value."""
    _ensure_zip(db_session, "11211", 40.713, -73.957, "Brooklyn")
    r = authed_client.post("/api/auth/register", json={
        "display_name": "Belt Tester",
        "neighborhood": "Koreatown",   # not canonical
        "zip_code": "11211",
    })
    assert r.status_code == 200, r.text
    db_session.expire(test_user)
    updated = db_session.query(User).filter(User.id == test_user.id).first()
    assert updated.neighborhood == "Williamsburg"


def test_register_canonical_neighborhood_is_honored(authed_client, db_session, test_user):
    _ensure_zip(db_session, "11103", 40.763, -73.913, "Queens")
    r = authed_client.post("/api/auth/register", json={
        "display_name": "Belt Tester",
        "neighborhood": "Astoria",
        "zip_code": "11103",
    })
    assert r.status_code == 200, r.text
    db_session.expire(test_user)
    updated = db_session.query(User).filter(User.id == test_user.id).first()
    assert updated.neighborhood == "Astoria"
