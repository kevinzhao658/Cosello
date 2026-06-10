"""Tests for PUT /api/auth/profile ZIP validation and zip_confirmed flag.

UpdateProfileRequest has all-optional fields (display_name, neighborhood,
pickup_address, zip_code), so test bodies only need {"zip_code": "..."}.
No other required fields exist — a bare ZIP-only body is valid.
"""
import pytest
from models import ZipCentroid, User


def test_profile_update_rejects_unseeded_zip(authed_client, test_user, db_session):
    """A ZIP not present in zip_centroids must return 400."""
    r = authed_client.put("/api/auth/profile", json={"zip_code": "99999"})
    assert r.status_code == 400
    assert "NYC ZIP" in r.json()["detail"]


def test_profile_update_valid_zip_sets_confirmed(authed_client, test_user, db_session):
    """A valid seeded ZIP must return 200, set zip_code, zip_confirmed=True on the
    user row, and include zip_confirmed=true in the response body."""
    # Ensure the ZIP centroid row exists (idempotent insert).
    if db_session.get(ZipCentroid, "10014") is None:
        db_session.add(
            ZipCentroid(zip_code="10014", latitude=40.734, longitude=-74.006, borough="Manhattan")
        )
        db_session.commit()

    r = authed_client.put("/api/auth/profile", json={"zip_code": "10014"})
    assert r.status_code == 200

    # The endpoint commits via its own session; expire the fixture session's
    # cached object then re-query to pick up the committed change.
    db_session.expire(test_user)
    updated = db_session.query(User).filter(User.id == test_user.id).first()
    assert updated.zip_code == "10014"
    assert updated.zip_confirmed is True

    body = r.json()
    assert body["zip_code"] == "10014"
    assert body["zip_confirmed"] is True
