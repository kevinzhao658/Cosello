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


from services.ranking import _community_overlap
from models import Friendship, Listing as RankingListing
from services.circles import count_mutual_friends, seller_circles_for_viewer, set_circle_consent, set_user_building


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
    seller = make_user(display_name="Seller")
    viewer = make_user(display_name="Viewer")
    # both in the same building, but seller has NOT opted in yet
    b = set_user_building(db_session, seller, "500 W 30th St")
    set_user_building(db_session, viewer, "500 W 30th St")
    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    assert res["building"]["shared"] is False         # consent off
    set_circle_consent(db_session, seller.id, b.id, True)
    res = seller_circles_for_viewer(db_session, seller.id, viewer)
    assert res["building"]["shared"] is True           # consent on + same building
    assert res["building"]["label"] == "Same building"
    assert res["mutualFriends"]["count"] == 0
    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()


import time as _time
import uuid as _uuid


def test_ranking_overlap_uses_seller_memberships(db_session, make_user):
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
    # 1 shared circle / COMMUNITY_OVERLAP_NORM(3) ≈ 0.333
    assert _community_overlap(viewer, listing, db_session) > 0.0
    db_session.query(RankingListing).filter(RankingListing.id == listing.id).delete()
    db_session.query(CommunityMember).filter(CommunityMember.community_id == b.id).delete()
    db_session.query(Community).filter(Community.id == b.id).delete()
    db_session.commit()
