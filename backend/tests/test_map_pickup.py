"""Phase 2b — map pickup picker backend tests. All Mapbox HTTP is mocked."""
import pytest
import services.mapbox as mb


def test_radius_constants():
    assert mb.MIN_MAP_RADIUS_MI == 0.1
    assert mb.MAX_MAP_RADIUS_MI == 0.4
    assert mb.MAP_CIRCLE_RADIUS_MI == 0.15


def test_reverse_geocode_zip_parses_postcode(monkeypatch):
    class FakeResp:
        status_code = 200
        def json(self):
            return {"features": [{
                "place_name": "123 Mercer St, New York, New York 10012, United States",
                "context": [{"id": "postcode.123", "text": "10012"}],
            }]}
    monkeypatch.setattr(mb.httpx, "get", lambda *a, **k: FakeResp())
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") == ("10012", "123 Mercer St, New York, New York 10012, United States")


def test_reverse_geocode_zip_none_on_error(monkeypatch):
    def boom(*a, **k):
        raise mb.httpx.ConnectError("down")
    monkeypatch.setattr(mb.httpx, "get", boom)
    assert mb.reverse_geocode_zip(40.725, -73.998, "tok") is None
