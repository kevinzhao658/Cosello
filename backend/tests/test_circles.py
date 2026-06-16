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
    rows = [
        SchoolSeed(name="New York University", state="NY"),
        SchoolSeed(name="Columbia University", state="NY"),
        SchoolSeed(name="University of Michigan", state="MI"),
    ]
    db_session.add_all(rows)
    db_session.commit()
    ids = [r.id for r in rows]
    yield rows
    db_session.query(Community).filter(Community.school_seed_id.in_(ids)).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()


def test_search_schools_prefix_and_substring(db_session, seeded_schools):
    names = [r.name for r in search_schools(db_session, "univers")]
    assert "Columbia University" in names and "University of Michigan" in names
    assert search_schools(db_session, "") == []


def test_add_user_school_enforces_cap_of_two(db_session, make_user, seeded_schools):
    u = make_user(display_name="S")
    add_user_school(db_session, u, seeded_schools[0].id)
    add_user_school(db_session, u, seeded_schools[1].id)
    with pytest.raises(TooManySchools):
        add_user_school(db_session, u, seeded_schools[2].id)
    assert {s.name for s in list_user_schools(db_session, u.id)} == {
        "New York University", "Columbia University",
    }
    # cleanup memberships
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.commit()


from services.circles import set_circle_consent


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
