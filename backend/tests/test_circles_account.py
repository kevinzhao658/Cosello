"""Phase 5 backend tests: service helpers + circles management API + profile schools.

Uses sentinel names (zzzqa*) so results are immune to the ~6k seeded school rows.
All test users are created via the make_user fixture (Supabase Admin API) and torn
down automatically. Community/membership cleanup is performed inline to avoid leaking
state into later tests.
"""
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, SchoolSeed
from services.circles import (
    add_user_school,
    get_user_circles_summary,
    list_user_schools,
    remove_user_school,
    set_circle_consent,
)
from services.neighborhood import get_neighborhood_community, set_user_neighborhood


# ---------------------------------------------------------------------------
# Task 4 helpers: remove_user_school + get_user_circles_summary
# ---------------------------------------------------------------------------

def test_remove_user_school_drops_membership(db_session, make_user):
    u = make_user(display_name="ZzzqaRemover")
    seed = SchoolSeed(name="Zzzqa Fordham University", state="NY")
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)
    school = add_user_school(db_session, u, seed.id)
    remove_user_school(db_session, u, school.id)
    assert list_user_schools(db_session, u.id) == []
    # cleanup
    db_session.query(Community).filter(Community.id == school.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_circles_summary_shape(db_session, make_user):
    """get_user_circles_summary returns neighborhood (not building) per spec rev 2026-06-19."""
    u = make_user(display_name="ZzzqaSumUser")
    set_user_neighborhood(db_session, u, "Chelsea")
    nbr = get_neighborhood_community(db_session, "Chelsea")
    assert nbr is not None, "Chelsea neighborhood community must be seeded"
    set_circle_consent(db_session, u.id, nbr.id, True)
    u.share_mutual_friends = True
    db_session.commit()

    summary = get_user_circles_summary(db_session, u)
    assert summary["neighborhood"] is not None
    assert summary["neighborhood"]["share"] is True
    assert summary["neighborhood"]["community_id"] == nbr.id
    assert summary["neighborhood"]["label"] == "Chelsea"
    assert summary["schools"] == []
    assert summary["mutualFriends"]["share"] is True

    # cleanup (don't delete the system-owned neighborhood Community)
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id == u.id,
    ).delete(synchronize_session=False)
    u.share_mutual_friends = False
    db_session.commit()


# ---------------------------------------------------------------------------
# Task 5 management API
# ---------------------------------------------------------------------------

def test_circles_me_and_consent_and_schools(db_session, make_user, client, override_auth_user):
    u = make_user(display_name="ZzzqaAcctUser")
    set_user_neighborhood(db_session, u, "Chelsea")
    seed = SchoolSeed(name="Zzzqa Pace University", state="NY")
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)
    override_auth_user(u)

    # --- GET /api/circles/me ---
    me = client.get("/api/circles/me").json()
    assert me["neighborhood"] is not None
    assert me["neighborhood"]["share"] is False   # default-off until we toggle
    assert me["neighborhood"]["label"] == "Chelsea"
    nbr_cid = me["neighborhood"]["community_id"]

    # --- PATCH /api/circles/consent (neighborhood toggle) ---
    resp = client.patch("/api/circles/consent", json={"community_id": nbr_cid, "share": True})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    me2 = client.get("/api/circles/me").json()
    assert me2["neighborhood"]["share"] is True

    # --- PATCH /api/circles/mutual-friends ---
    resp = client.patch("/api/circles/mutual-friends", json={"share": True})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    me3 = client.get("/api/circles/me").json()
    assert me3["mutualFriends"]["share"] is True

    # --- POST /api/circles/schools ---
    added = client.post("/api/circles/schools", json={"seed_id": seed.id})
    assert added.status_code == 200
    s_cid = added.json()["community_id"]
    assert added.json()["name"] == "Zzzqa Pace University"
    me4 = client.get("/api/circles/me").json()
    assert any(s["community_id"] == s_cid for s in me4["schools"])

    # --- DELETE /api/circles/schools/{community_id} ---
    resp = client.delete(f"/api/circles/schools/{s_cid}")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    me5 = client.get("/api/circles/me").json()
    assert me5["schools"] == []

    # cleanup
    nbr = get_neighborhood_community(db_session, "Chelsea")
    if nbr:
        db_session.query(CommunityMember).filter(
            CommunityMember.community_id == nbr.id,
            CommunityMember.user_id == u.id,
        ).delete(synchronize_session=False)
    db_session.query(Community).filter(Community.id == s_cid).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()


def test_consent_404_for_non_member(db_session, make_user, client, override_auth_user):
    """PATCH /api/circles/consent with a community the caller doesn't belong to returns 404."""
    u = make_user(display_name="ZzzqaNonMember")
    override_auth_user(u)
    # Use community_id=999999 — very unlikely to exist.
    resp = client.patch("/api/circles/consent", json={"community_id": 999999, "share": True})
    assert resp.status_code == 404


def test_add_school_over_cap_returns_400(db_session, make_user, client, override_auth_user):
    u = make_user(display_name="ZzzqaCapUser")
    seeds = [
        SchoolSeed(name=f"Zzzqa Cap School {i}", state="NY")
        for i in range(3)
    ]
    db_session.add_all(seeds)
    db_session.commit()
    override_auth_user(u)

    assert client.post("/api/circles/schools", json={"seed_id": seeds[0].id}).status_code == 200
    assert client.post("/api/circles/schools", json={"seed_id": seeds[1].id}).status_code == 200
    third = client.post("/api/circles/schools", json={"seed_id": seeds[2].id})
    assert third.status_code == 400

    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.user_id == u.id).delete()
    db_session.query(Community).filter(
        Community.school_seed_id.in_([s.id for s in seeds])
    ).delete(synchronize_session=False)
    db_session.query(SchoolSeed).filter(
        SchoolSeed.id.in_([s.id for s in seeds])
    ).delete(synchronize_session=False)
    db_session.commit()


def test_add_school_unknown_seed_returns_404(db_session, make_user, client, override_auth_user):
    u = make_user(display_name="ZzzqaUnknownSeed")
    override_auth_user(u)
    resp = client.post("/api/circles/schools", json={"seed_id": 999999})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Task 6 (plan Task 3): profile endpoint includes schools
# ---------------------------------------------------------------------------

def test_profile_includes_schools(db_session, make_user, client, override_auth_user):
    seller = make_user(display_name="ZzzqaSeller")
    viewer = make_user(display_name="ZzzqaViewer")
    seed = SchoolSeed(name="Zzzqa Hunter College", state="NY")
    db_session.add(seed)
    db_session.commit()
    db_session.refresh(seed)
    school = add_user_school(db_session, seller, seed.id)

    override_auth_user(viewer)
    resp = client.get(f"/api/friends/profile/{seller.id}")
    assert resp.status_code == 200
    schools = resp.json().get("schools", [])
    assert "Zzzqa Hunter College" in [s["name"] for s in schools]

    # cleanup
    db_session.query(CommunityMember).filter(CommunityMember.user_id == seller.id).delete()
    db_session.query(Community).filter(Community.id == school.id).delete()
    db_session.query(SchoolSeed).filter(SchoolSeed.id == seed.id).delete()
    db_session.commit()
