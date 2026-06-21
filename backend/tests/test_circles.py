import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, User, SchoolSeed


def test_models_have_circle_columns():
    assert hasattr(Community, "kind")
    assert hasattr(Community, "school_seed_id")
    assert hasattr(CommunityMember, "share_with_mutuals")
    assert hasattr(User, "share_mutual_friends")
    assert SchoolSeed.__tablename__ == "school_seed"


from services.circles import normalize_address


def test_normalize_address_strips_unit_and_case():
    assert normalize_address("123 W 21st St, Apt 4B") == "123 w 21st st"
    assert normalize_address("123 W 21st St #4B") == "123 w 21st st"
    assert normalize_address("123 W 21st St, Unit 4") == "123 w 21st st"


def test_normalize_address_collapses_whitespace_and_punct():
    assert normalize_address("  123   W 21st  St.  ") == "123 w 21st st"


def test_normalize_address_empty_is_empty():
    assert normalize_address("") == ""
    assert normalize_address(None) == ""


from services.circles import set_user_building


def test_set_user_building_dedupes_by_normalized_address(db_session, make_user):
    u1 = make_user(display_name="A")
    u2 = make_user(display_name="B")
    c1 = set_user_building(db_session, u1, "123 W 21st St, Apt 4B")
    c2 = set_user_building(db_session, u2, "123 W 21st ST #9")
    assert c1.id == c2.id                      # same building circle
    assert c1.kind == "building"
    members = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == c1.id
    ).count()
    assert members == 2
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == c1.id).delete()
    db_session.query(Community).filter(Community.id == c1.id).delete()
    db_session.commit()


import pytest
from services.circles import search_schools, add_user_school, list_user_schools, TooManySchools


@pytest.fixture
def seeded_schools(db_session):
    # Names use the sentinel token "zzzqa" so they sort after all real College
    # Scorecard rows and are never crowded out by the limit=8 result window.
    rows = [
        SchoolSeed(name="Zzzqa Test University Alpha", state="NY"),
        SchoolSeed(name="Zzzqa Test College Beta", state="NY"),
        SchoolSeed(name="Zzzqa Test Institute Gamma", state="MI"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    ids = [r.id for r in rows]
    yield rows
    db_session.query(Community).filter(Community.school_seed_id.in_(ids)).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()


def test_search_schools_prefix_and_substring(db_session, seeded_schools):
    # "zzzqa" matches all three sentinel rows; only those rows contain this token
    # so the test is immune to the ~6,000 real rows loaded from College Scorecard.
    # "University" and "College" both appear in results, exercising substring matching.
    results = search_schools(db_session, "zzzqa")
    names = [r.name for r in results]
    assert "Zzzqa Test University Alpha" in names
    assert "Zzzqa Test College Beta" in names
    assert "Zzzqa Test Institute Gamma" in names
    assert search_schools(db_session, "") == []


def test_search_schools_ranks_prefix_first(db_session):
    # Insert one row where the token appears at the start (prefix) and one where
    # it appears only mid-string.  The prefix row must rank before the mid-string
    # row regardless of alphabetical order (mid-string name sorts earlier).
    token = "zzzqaprefix"
    prefix_row = SchoolSeed(name="Zzzqaprefix University", state="NY")
    midstr_row = SchoolSeed(name="College of Zzzqaprefix", state="NY")
    db_session.add_all([prefix_row, midstr_row])
    db_session.commit()
    try:
        results = search_schools(db_session, token)
        names = [r.name for r in results]
        assert "Zzzqaprefix University" in names
        assert "College of Zzzqaprefix" in names
        prefix_idx = names.index("Zzzqaprefix University")
        midstr_idx = names.index("College of Zzzqaprefix")
        assert prefix_idx < midstr_idx, (
            f"Expected prefix match first but got: {names}"
        )
    finally:
        db_session.query(SchoolSeed).filter(
            SchoolSeed.id.in_([prefix_row.id, midstr_row.id])
        ).delete(synchronize_session=False)
        db_session.commit()


def test_add_user_school_enforces_cap_of_two(db_session, make_user, seeded_schools):
    u = make_user(display_name="S")
    add_user_school(db_session, u, seeded_schools[0].id)
    add_user_school(db_session, u, seeded_schools[1].id)
    with pytest.raises(TooManySchools):
        add_user_school(db_session, u, seeded_schools[2].id)
    assert {s.name for s in list_user_schools(db_session, u.id)} == {
        "Zzzqa Test University Alpha", "Zzzqa Test College Beta",
    }
    # cleanup memberships
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.commit()


from scripts.seed_schools import parse_rows
from services.circles import set_circle_consent


def test_parse_rows_dedupes_and_skips_blanks():
    csv_text = "name,state\nNew York University,NY\nNew York University,NY\n,NY\nMIT,MA\n"
    rows = parse_rows(csv_text)
    assert rows == [("New York University", "NY"), ("MIT", "MA")]


def test_parse_rows_scorecard_format():
    # Scorecard-style CSV: extra columns, CURROPER filter, duplicate, closed school
    csv_text = (
        "UNITID,INSTNM,CITY,STABBR,CURROPER\n"
        "100001,New York University,New York,NY,1\n"   # keep
        "100002,Closed College,Albany,NY,0\n"          # drop: CURROPER != 1
        "100003,MIT,Cambridge,MA,1\n"                  # keep
        "100004,New York University,New York,NY,1\n"   # drop: duplicate (case-insensitive)
        "100005,  Boston University  ,Boston,MA,1\n"   # keep: whitespace stripped
    )
    rows = parse_rows(csv_text)
    assert rows == [
        ("New York University", "NY"),
        ("MIT", "MA"),
        ("Boston University", "MA"),
    ]


def test_set_circle_consent_toggles_membership_flag(db_session, make_user):
    u = make_user(display_name="C")
    community = set_user_building(db_session, u, "55 Hudson St")
    set_circle_consent(db_session, u.id, community.id, True)
    m = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == community.id,
        CommunityMember.user_id == u.id,
    ).first()
    assert m.share_with_mutuals is True
    set_circle_consent(db_session, u.id, community.id, False)
    db_session.refresh(m)
    assert m.share_with_mutuals is False
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == community.id).delete()
    db_session.query(Community).filter(Community.id == community.id).delete()
    db_session.commit()


def test_seller_circles_for_viewer_marks_direct_friend(db_session, make_user):
    seller = make_user(display_name="SellerDF")
    viewer = make_user(display_name="ViewerDF")
    # seller opts into sharing mutual-friend info
    from models import Friendship as _F
    seller.share_mutual_friends = True
    db_session.commit()
    # create a direct accepted friendship between seller and viewer
    db_session.add(_F(user_id=seller.id, friend_id=viewer.id, status="accepted"))
    db_session.commit()

    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    # New shape: direct friend → degree 1 (seller is in viewer's friend set)
    assert res["connection"]["degree"] == 1

    # cleanup
    db_session.query(_F).filter(
        _F.user_id == seller.id, _F.friend_id == viewer.id
    ).delete()
    seller.share_mutual_friends = False
    db_session.commit()


from services.ranking import _community_overlap
from models import Friendship, Listing as RankingListing
from services.circles import count_mutual_friends, seller_circles_for_viewer, set_circle_consent, set_user_building
from services.neighborhood import set_user_neighborhood, get_neighborhood_community


def _friend(db, a_id, b_id):
    db.add(Friendship(user_id=a_id, friend_id=b_id, status="accepted"))
    db.commit()


def test_count_mutual_friends_counts_accepted_overlap(db_session, make_user):
    seller = make_user(display_name="Seller")
    viewer = make_user(display_name="Viewer")
    shared = make_user(display_name="Shared")
    _friend(db_session, seller.id, shared.id)
    _friend(db_session, viewer.id, shared.id)
    assert count_mutual_friends(db_session, seller.id, viewer.id) == 1
    db_session.query(Friendship).filter(Friendship.user_id.in_([seller.id, viewer.id])).delete(synchronize_session=False)
    db_session.commit()


def test_seller_circles_for_viewer_respects_consent_and_match(db_session, make_user):
    """seller_circles_for_viewer now uses neighborhood (not building) as the
    local-trust circle (spec rev 2026-06-19). Test verifies consent gate and
    shared=True when both seller and viewer share the same neighborhood circle."""
    seller = make_user(display_name="SellerNbr")
    viewer = make_user(display_name="ViewerNbr")
    # Put both users in Chelsea; seller has NOT opted in yet.
    set_user_neighborhood(db_session, seller, "Chelsea")
    set_user_neighborhood(db_session, viewer, "Chelsea")
    nbr_community = get_neighborhood_community(db_session, "Chelsea")
    assert nbr_community is not None, "Chelsea neighborhood community not seeded"

    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    # New shape: school=None (no school), connection degree=None (no friendship)
    assert res["school"] is None
    assert res["connection"]["degree"] is None
    # Neighborhood no longer in the circles shape (spec rev 2026-06-20)
    assert "neighborhood" not in res
    set_circle_consent(db_session, seller.id, nbr_community.id, True)
    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    # Toggling neighborhood consent doesn't affect the new circles shape
    assert res["school"] is None
    assert res["connection"]["degree"] is None
    # cleanup memberships (neighborhood Communities are system-owned; don't delete them)
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr_community.id,
        CommunityMember.user_id.in_([seller.id, viewer.id]),
    ).delete(synchronize_session=False)
    db_session.commit()


from services.circles import compute_acronym


def test_compute_acronym_nyu():
    assert compute_acronym("New York University") == "NYU"


def test_compute_acronym_ucla():
    # Comma form (original test).
    assert compute_acronym("University of California, Los Angeles") == "UCLA"
    # Hyphen form — the actual College Scorecard encoding; was broken before
    # separator normalization was added.
    assert compute_acronym("University of California-Los Angeles") == "UCLA"


def test_compute_acronym_mit():
    assert compute_acronym("Massachusetts Institute of Technology") == "MIT"


def test_compute_acronym_single_word_returns_none():
    # A single meaningful word yields only one letter; must return None.
    assert compute_acronym("Harvard") is None


def test_compute_acronym_stopwords_only_returns_none():
    # All tokens are stopwords; no letters collected.
    assert compute_acronym("of the and") is None


def test_search_schools_acronym_match(db_session):
    """Querying "NYU" should return "New York University" ranked above a
    name-substring-only match, and above noise rows that share no letters."""
    token = "zzzqaacronym"
    nyu_row = SchoolSeed(name="Zzzqaacronym York University", state="NY",
                         acronym="ZYU")
    noise_row = SchoolSeed(name="Zzzqaacronym Community College", state="NY",
                           acronym=None)
    db_session.add_all([nyu_row, noise_row])
    db_session.commit()
    try:
        # Acronym query for "ZYU" — should find nyu_row (exact acronym match)
        # but NOT noise_row (acronym is None and name doesn't match "ZYU").
        results = search_schools(db_session, "ZYU")
        names = [r.name for r in results]
        assert "Zzzqaacronym York University" in names, (
            f"Expected acronym match but got: {names}"
        )
        # noise_row lacks the acronym "ZYU" and its name doesn't contain "ZYU",
        # so it must not appear.
        assert "Zzzqaacronym Community College" not in names, (
            f"Noise row should be excluded: {names}"
        )
        # The acronym-matched row must rank first (rank=1 exact) vs name-substring
        # matches which would rank 3 at best.
        assert names[0] == "Zzzqaacronym York University", (
            f"Acronym match must rank first but got: {names}"
        )
    finally:
        db_session.query(SchoolSeed).filter(
            SchoolSeed.id.in_([nyu_row.id, noise_row.id])
        ).delete(synchronize_session=False)
        db_session.commit()


def test_search_schools_acronym_prefix_match(db_session):
    """Acronym prefix query (e.g. "NY") should match rows whose acronym starts
    with "NY", ranked after exact acronym matches."""
    token = "zzzqapfx"
    row_nyu = SchoolSeed(name=f"{token} York University", state="NY",
                         acronym="NZYU")
    row_ny_college = SchoolSeed(name=f"{token} York College", state="NY",
                                acronym="NYC")
    db_session.add_all([row_nyu, row_ny_college])
    db_session.commit()
    try:
        # Query "NZ" — prefix of "NZYU"; should return row_nyu via acronym prefix.
        results = search_schools(db_session, "NZ")
        names = [r.name for r in results]
        assert f"{token} York University" in names, (
            f"Expected acronym prefix match for 'NZ' but got: {names}"
        )
    finally:
        db_session.query(SchoolSeed).filter(
            SchoolSeed.id.in_([row_nyu.id, row_ny_college.id])
        ).delete(synchronize_session=False)
        db_session.commit()


import time as _time
import uuid as _uuid


def test_ranking_overlap_building_kind_excluded(db_session, make_user):
    """Building circles (kind='building') must not contribute to ranking overlap.

    Since the 2026-06-19 pivot, building is no longer a DISPLAYED_CIRCLE_KIND.
    Two users who share only a building circle must get zero overlap so dormant
    building memberships do not silently boost feed ranking.
    """
    seller = make_user(display_name="RankSeller")
    viewer = make_user(display_name="RankViewer")
    b = set_user_building(db_session, seller, "9 Bank St")
    set_user_building(db_session, viewer, "9 Bank St")  # share the building circle
    listing = RankingListing(
        id=_uuid.uuid4().hex[:12],
        user_id=seller.id, description="d", price_cents=500,
        category="home", brand="Unknown", name="Chair",
        posted_at=_time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)
    # Building kind is excluded from RANKING_OVERLAP_KINDS — overlap must be zero.
    assert _community_overlap(viewer, listing, db_session) == 0.0
    db_session.query(RankingListing).filter(RankingListing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
