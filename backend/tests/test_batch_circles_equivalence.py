"""Equivalence tests: seller_circles_for_viewer_batch == seller_circles_for_viewer.

For each scenario in the fixture matrix, we assert that the batched output for
a given seller_id is identical to the per-call output.  This pins the batch
path against any future drift in _assemble_circles logic.

Fixture matrix:
  A. Seller shares a neighborhood the viewer is in (shared=True).
  B. Seller shares a school the viewer is in (shared=True).
  C. Seller has N mutual friends with the viewer.
  D. Seller is a direct friend of the viewer.
  E. Seller has no overlap with the viewer.
  F. Seller has share_mutual_friends=False (mutual counts suppressed).
"""
import sys
import secrets
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from models import Community, CommunityMember, Friendship, User
from services.circles import (
    seller_circles_for_viewer,
    seller_circles_for_viewer_batch,
    set_circle_consent,
)
from services.neighborhood import get_neighborhood_community


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_create_school(db_session, name: str, created_by_id: str) -> Community:
    """Find or create a school-kind community with the given name."""
    c = db_session.query(Community).filter(
        Community.kind == "school", Community.name == name
    ).first()
    if c is None:
        c = Community(
            name=name,
            kind="school",
            is_public=True,
            invite_code=secrets.token_urlsafe(8),
            created_by=created_by_id,
        )
        db_session.add(c)
        db_session.commit()
        db_session.refresh(c)
    return c


def _enroll(db_session, community_id: int, user_id: str, share: bool = False) -> None:
    existing = db_session.query(CommunityMember).filter(
        CommunityMember.community_id == community_id,
        CommunityMember.user_id == user_id,
    ).first()
    if existing is None:
        m = CommunityMember(
            community_id=community_id,
            user_id=user_id,
            role="member",
            share_with_mutuals=share,
        )
        db_session.add(m)
        db_session.commit()
    elif existing.share_with_mutuals != share:
        existing.share_with_mutuals = share
        db_session.commit()


def _befriend(db_session, uid_a: str, uid_b: str) -> None:
    existing = db_session.query(Friendship).filter(
        Friendship.user_id == uid_a,
        Friendship.friend_id == uid_b,
    ).first()
    if existing is None:
        f = Friendship(user_id=uid_a, friend_id=uid_b, status="accepted")
        db_session.add(f)
        db_session.commit()


def _viewer_circle_ids(db_session, viewer_id: str) -> set[int]:
    return {
        m.community_id
        for m in db_session.query(CommunityMember.community_id)
        .filter(CommunityMember.user_id == viewer_id)
        .all()
    }


def _assert_batch_equals_single(
    db_session, seller_ids: list[str], viewer: User, viewer_cids: set[int]
) -> None:
    """Core assertion: batch output must equal per-call output for every seller."""
    batch = seller_circles_for_viewer_batch(
        db_session,
        seller_ids,
        viewer,
        viewer_circle_ids=viewer_cids,
    )
    for sid in seller_ids:
        single = seller_circles_for_viewer(
            db_session, sid, viewer, viewer_circle_ids=viewer_cids
        )
        assert batch[sid] == single, (
            f"Mismatch for seller {sid}:\n  batch={batch[sid]}\n  single={single}"
        )


# ---------------------------------------------------------------------------
# Fixture matrix
# ---------------------------------------------------------------------------

def test_scenario_a_shared_neighborhood(db_session, make_user):
    """Seller shares a neighborhood circle the viewer is also in."""
    from services.neighborhood import set_user_neighborhood

    seller = make_user(display_name="SellerA")
    viewer = make_user(display_name="ViewerA")

    seller.neighborhood = None
    viewer.neighborhood = None
    db_session.commit()

    set_user_neighborhood(db_session, seller, "Chelsea")
    set_user_neighborhood(db_session, viewer, "Chelsea")

    nbr = get_neighborhood_community(db_session, "Chelsea")
    assert nbr is not None

    set_circle_consent(db_session, seller.id, nbr.id, True)
    # viewer does not need consent; they just need membership

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)
    assert nbr.id in viewer_cids, "viewer must be enrolled in Chelsea"

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    # Verify the expected value is correct (not just "both paths agree on wrong answer")
    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["neighborhood"]["shared"] is True
    assert single["neighborhood"]["label"] == "Chelsea"
    assert single["school"]["shared"] is False

    # Cleanup memberships (not the system-owned Community row)
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id.in_([seller.id, viewer.id]),
    ).delete(synchronize_session=False)
    db_session.commit()


def test_scenario_b_shared_school(db_session, make_user):
    """Seller shares a school circle the viewer is also in."""
    seller = make_user(display_name="SellerB")
    viewer = make_user(display_name="ViewerB")

    school = _get_or_create_school(db_session, "ZZZTest University Batch", seller.id)
    _enroll(db_session, school.id, seller.id, share=True)
    _enroll(db_session, school.id, viewer.id, share=False)

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["school"]["shared"] is True
    assert single["school"]["label"] == "ZZZTest University Batch"
    assert single["neighborhood"]["shared"] is False

    # Cleanup
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school.id
    ).delete()
    db_session.query(Community).filter(Community.id == school.id).delete()
    db_session.commit()


def test_scenario_c_mutual_friends(db_session, make_user):
    """Seller has N mutual friends with the viewer."""
    seller = make_user(display_name="SellerC")
    viewer = make_user(display_name="ViewerC")
    mutual1 = make_user(display_name="Mutual1")
    mutual2 = make_user(display_name="Mutual2")

    # seller and viewer are each friends with mutual1 and mutual2
    _befriend(db_session, seller.id, mutual1.id)
    _befriend(db_session, seller.id, mutual2.id)
    _befriend(db_session, viewer.id, mutual1.id)
    _befriend(db_session, viewer.id, mutual2.id)

    # Enable sharing on seller
    seller.share_mutual_friends = True
    db_session.commit()

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["mutualFriends"]["count"] == 2
    assert single["mutualFriends"]["directFriend"] is False

    # Cleanup
    db_session.query(Friendship).filter(
        Friendship.user_id.in_([seller.id, viewer.id, mutual1.id, mutual2.id])
        | Friendship.friend_id.in_([seller.id, viewer.id, mutual1.id, mutual2.id])
    ).delete(synchronize_session=False)
    seller.share_mutual_friends = False
    db_session.commit()


def test_scenario_d_direct_friend(db_session, make_user):
    """Seller is a direct friend of the viewer."""
    seller = make_user(display_name="SellerD")
    viewer = make_user(display_name="ViewerD")

    _befriend(db_session, seller.id, viewer.id)
    seller.share_mutual_friends = True
    db_session.commit()

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["mutualFriends"]["directFriend"] is True

    # Cleanup
    db_session.query(Friendship).filter(
        (Friendship.user_id == seller.id) | (Friendship.friend_id == seller.id)
    ).delete(synchronize_session=False)
    seller.share_mutual_friends = False
    db_session.commit()


def test_scenario_e_no_overlap(db_session, make_user):
    """Seller has no community or friend overlap with the viewer."""
    seller = make_user(display_name="SellerE")
    viewer = make_user(display_name="ViewerE")

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["neighborhood"]["shared"] is False
    assert single["school"]["shared"] is False
    assert single["mutualFriends"]["count"] == 0
    assert single["mutualFriends"]["directFriend"] is False


def test_scenario_f_share_mutual_friends_false(db_session, make_user):
    """Seller has friends in common but share_mutual_friends=False; counts suppressed."""
    seller = make_user(display_name="SellerF")
    viewer = make_user(display_name="ViewerF")
    mutual = make_user(display_name="MutualF")

    _befriend(db_session, seller.id, mutual.id)
    _befriend(db_session, viewer.id, mutual.id)

    # seller.share_mutual_friends is False by default
    assert not seller.share_mutual_friends

    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, [seller.id], viewer, viewer_cids)

    single = seller_circles_for_viewer(
        db_session, seller.id, viewer, viewer_circle_ids=viewer_cids
    )
    assert single["mutualFriends"]["count"] == 0
    assert single["mutualFriends"]["directFriend"] is False

    # Cleanup
    db_session.query(Friendship).filter(
        Friendship.user_id.in_([seller.id, viewer.id, mutual.id])
        | Friendship.friend_id.in_([seller.id, viewer.id, mutual.id])
    ).delete(synchronize_session=False)
    db_session.commit()


def test_batch_multi_seller_mixed(db_session, make_user):
    """All six scenarios in a single batch call — verifies batch groups correctly."""
    from services.neighborhood import set_user_neighborhood

    viewer = make_user(display_name="ViewerBatch")
    seller_nbr = make_user(display_name="SellerNeighborhood")
    seller_school = make_user(display_name="SellerSchool")
    seller_mutual = make_user(display_name="SellerMutual")
    seller_direct = make_user(display_name="SellerDirect")
    seller_none = make_user(display_name="SellerNone")
    mutual_friend = make_user(display_name="MutualBatch")

    # Neighborhood scenario
    seller_nbr.neighborhood = None
    viewer.neighborhood = None
    db_session.commit()
    set_user_neighborhood(db_session, seller_nbr, "SoHo")
    set_user_neighborhood(db_session, viewer, "SoHo")
    nbr = get_neighborhood_community(db_session, "SoHo")
    set_circle_consent(db_session, seller_nbr.id, nbr.id, True)

    # School scenario
    school = _get_or_create_school(db_session, "ZZZBatchUniversity", seller_school.id)
    _enroll(db_session, school.id, seller_school.id, share=True)
    _enroll(db_session, school.id, viewer.id, share=False)

    # Mutual friends scenario
    _befriend(db_session, seller_mutual.id, mutual_friend.id)
    _befriend(db_session, viewer.id, mutual_friend.id)
    seller_mutual.share_mutual_friends = True
    db_session.commit()

    # Direct friend scenario
    _befriend(db_session, seller_direct.id, viewer.id)
    seller_direct.share_mutual_friends = True
    db_session.commit()

    seller_ids = [
        seller_nbr.id,
        seller_school.id,
        seller_mutual.id,
        seller_direct.id,
        seller_none.id,
    ]
    viewer_cids = _viewer_circle_ids(db_session, viewer.id)

    _assert_batch_equals_single(db_session, seller_ids, viewer, viewer_cids)

    # Cleanup
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == nbr.id,
        CommunityMember.user_id.in_([seller_nbr.id, viewer.id]),
    ).delete(synchronize_session=False)
    db_session.query(CommunityMember).filter(
        CommunityMember.community_id == school.id
    ).delete(synchronize_session=False)
    db_session.query(Community).filter(Community.id == school.id).delete()
    db_session.query(Friendship).filter(
        Friendship.user_id.in_(seller_ids + [viewer.id, mutual_friend.id])
        | Friendship.friend_id.in_(seller_ids + [viewer.id, mutual_friend.id])
    ).delete(synchronize_session=False)
    for u in [seller_mutual, seller_direct]:
        u.share_mutual_friends = False
    db_session.commit()
