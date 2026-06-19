import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, SchoolSeed, User
from services.circles import list_user_schools


def _get_or_create_school(db_session, name: str, state: str) -> tuple[SchoolSeed, bool]:
    """Return (seed_row, created).

    Tries to find an existing row first to avoid violating the
    uq_school_seed_name_state unique constraint on the shared live DB.
    Returns created=False when an existing row is reused so the teardown
    knows NOT to delete a row it didn't own.
    """
    existing = (
        db_session.query(SchoolSeed)
        .filter(SchoolSeed.name == name, SchoolSeed.state == state)
        .first()
    )
    if existing:
        return existing, False
    seed = SchoolSeed(name=name, state=state)
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)
    return seed, True


def test_register_defaults_consent_on_and_captures_pronouns(db_session, make_user, client, override_auth_user):
    user = make_user(display_name="Pre")
    seed, seed_created = _get_or_create_school(db_session, "New York University", "NY")
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
    # Only delete the seed row if this test created it — reused rows from the
    # seeded school_seed table must not be removed.
    if seed_created:
        db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_user_model_has_pronouns():
    from models import User
    assert hasattr(User, "pronouns")


def test_schools_search_endpoint(db_session, client, authed_client):
    # Use get_or_create so the test is safe whether or not these schools are
    # already in the seeded school_seed table (UNIQUE constraint on name+state).
    bu, bu_created = _get_or_create_school(db_session, "Boston University", "MA")
    bc, bc_created = _get_or_create_school(db_session, "Boston College", "MA")
    created_ids = [s.id for s, created in [(bu, bu_created), (bc, bc_created)] if created]
    resp = authed_client.get("/api/schools/search", params={"q": "boston"})
    assert resp.status_code == 200
    names = {r["name"] for r in resp.json()}
    assert {"Boston University", "Boston College"} <= names
    assert all({"id", "name"} <= set(r) for r in resp.json())
    if created_ids:
        db_session.query(SchoolSeed).filter(SchoolSeed.id.in_(created_ids)).delete(synchronize_session=False)
        db_session.commit()


def test_schools_search_accessible_without_profile_row(db_session, client):
    """Regression guard: school search must return 200 during registration wizard
    when the caller has no profile row yet (no Authorization header). This was
    broken when the endpoint used get_current_user, which raises 401 for any
    request where there is no matching public.users row."""
    seed, seed_created = _get_or_create_school(db_session, "Zzzqa Wizard University", "NY")
    # No Authorization header at all — simulates a browser before sign-in, or
    # the mid-registration state where the Supabase session exists but no
    # public.users row has been created yet.
    resp = client.get("/api/schools/search", params={"q": "zzzqa wizard"})
    assert resp.status_code == 200, (
        f"Expected 200 but got {resp.status_code}: {resp.text!r} — "
        "school search must not require an authenticated profile row"
    )
    names = [r["name"] for r in resp.json()]
    assert "Zzzqa Wizard University" in names
    if seed_created:
        db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
        db_session.commit()
