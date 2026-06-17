import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, SchoolSeed, User
from services.circles import list_user_schools


def test_register_defaults_consent_on_and_captures_pronouns(db_session, make_user, client, override_auth_user):
    user = make_user(display_name="Pre")
    seed = SchoolSeed(name="New York University", state="NY")
    db_session.add(seed); db_session.commit(); db_session.refresh(seed)
    override_auth_user(user)
    resp = client.post("/api/auth/register", json={
        "display_name": "Maya Rodriguez", "neighborhood": "Chelsea",
        "pickup_address": "123 W 21st St", "zip_code": "10011",
        "pronouns": "she/her", "school_seed_ids": [seed.id],
    })
    assert resp.status_code == 200, resp.text
    db_session.expire_all()
    u = db_session.query(User).filter(User.id == user.id).first()
    assert u.pronouns == "she/her"
    assert u.share_mutual_friends is True                       # default-on
    b = db_session.query(Community).join(CommunityMember, CommunityMember.community_id==Community.id)\
        .filter(CommunityMember.user_id==user.id, Community.kind=="building").first()
    bm = db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id, CommunityMember.community_id==b.id).first()
    assert bm.share_with_mutuals is True                        # default-on
    schools = list_user_schools(db_session, user.id)
    sm = db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id, CommunityMember.community_id==schools[0].id).first()
    assert sm.share_with_mutuals is True                        # default-on
    db_session.query(CommunityMember).filter(CommunityMember.user_id==user.id).delete()
    db_session.query(Community).filter(Community.id.in_([b.id, schools[0].id])).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id==seed.id).delete(); db_session.commit()


def test_user_model_has_pronouns():
    from models import User
    assert hasattr(User, "pronouns")


def test_schools_search_endpoint(db_session, client, authed_client):
    seeds = [SchoolSeed(name="Boston University", state="MA"),
             SchoolSeed(name="Boston College", state="MA")]
    db_session.add_all(seeds); db_session.commit()
    ids = [s.id for s in seeds]
    resp = authed_client.get("/api/schools/search", params={"q": "boston"})
    assert resp.status_code == 200
    names = {r["name"] for r in resp.json()}
    assert {"Boston University", "Boston College"} <= names
    assert all({"id", "name"} <= set(r) for r in resp.json())
    db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(ids)).delete(synchronize_session=False)
    db_session.commit()
