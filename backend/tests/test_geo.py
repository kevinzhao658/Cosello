import math
from services.geo import haversine_miles, round_coord, LOCATION_FUZZ_RADIUS_MI


def test_haversine_zero_distance():
    assert haversine_miles(40.73, -74.0, 40.73, -74.0) == 0.0


def test_haversine_known_distance():
    # ~1.68 mi between 10014 (West Village) and 10002 (LES) centroids
    # (plan comment said ~0.96 mi but actual haversine is ~1.68 mi for these coords)
    d = haversine_miles(40.734, -74.006, 40.715, -73.986)
    assert 0.8 < d < 2.0


def test_round_coord_to_3_decimals():
    assert round_coord(40.7349821) == 40.735
    assert round_coord(-74.0061234) == -74.006


def test_radius_constant():
    assert LOCATION_FUZZ_RADIUS_MI == 0.4
