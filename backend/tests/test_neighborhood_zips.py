from constants.neighborhoods import NYC_NEIGHBORHOODS
from constants.neighborhood_zips import NEIGHBORHOOD_ZIP, ZIP_NEIGHBORHOOD
from scripts.seed_zip_centroids import MANHATTAN_ZIPS

_SEEDED = {z[0] for z in MANHATTAN_ZIPS}

def test_every_neighborhood_maps_to_a_seeded_zip():
    for n in NYC_NEIGHBORHOODS:
        assert n in NEIGHBORHOOD_ZIP, f"missing map entry: {n}"
        assert NEIGHBORHOOD_ZIP[n] in _SEEDED, f"{n} -> {NEIGHBORHOOD_ZIP[n]} not seeded"

def test_no_extra_keys():
    assert set(NEIGHBORHOOD_ZIP) == set(NYC_NEIGHBORHOODS)


def test_zip_neighborhood_values_are_canonical():
    """Every ZIP_NEIGHBORHOOD value must be a canonical neighborhood."""
    bad = {z: n for z, n in ZIP_NEIGHBORHOOD.items() if n not in NYC_NEIGHBORHOODS}
    assert bad == {}, f"non-canonical neighborhoods mapped: {bad}"


def test_zip_neighborhood_covers_every_seeded_zip():
    """Every ZIP in the centroid seed must resolve to a neighborhood."""
    from scripts.seed_zip_centroids import all_seed_zips  # added in Task 3
    missing = [z for z in all_seed_zips() if z not in ZIP_NEIGHBORHOOD]
    assert missing == [], f"ZIPs with no neighborhood mapping: {missing}"


def test_new_neighborhoods_have_representative_zip():
    """Every commuter-belt neighborhood has a NEIGHBORHOOD_ZIP entry."""
    belt = ["Long Island City", "Astoria", "Sunnyside", "Woodside",
            "Jackson Heights", "Forest Hills", "Greenpoint", "Williamsburg",
            "Bushwick", "Bedford-Stuyvesant", "Clinton Hill", "DUMBO",
            "Boerum Hill", "Prospect Heights", "Park Slope", "Carroll Gardens",
            "Crown Heights", "Prospect-Lefferts Gardens", "Flatbush"]
    missing = [n for n in belt if n not in NEIGHBORHOOD_ZIP]
    assert missing == [], f"neighborhoods missing a representative ZIP: {missing}"
