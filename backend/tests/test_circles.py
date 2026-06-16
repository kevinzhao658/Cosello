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
