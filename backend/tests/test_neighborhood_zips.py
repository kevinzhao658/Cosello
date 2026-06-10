from constants.neighborhoods import MANHATTAN_NEIGHBORHOODS
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP
from scripts.seed_zip_centroids import MANHATTAN_ZIPS

_SEEDED = {z[0] for z in MANHATTAN_ZIPS}

def test_every_neighborhood_maps_to_a_seeded_zip():
    for n in MANHATTAN_NEIGHBORHOODS:
        assert n in NEIGHBORHOOD_ZIP, f"missing map entry: {n}"
        assert NEIGHBORHOOD_ZIP[n] in _SEEDED, f"{n} -> {NEIGHBORHOOD_ZIP[n]} not seeded"

def test_no_extra_keys():
    assert set(NEIGHBORHOOD_ZIP) == set(MANHATTAN_NEIGHBORHOODS)
