"""Unit tests for the circles 'insights' enrichment (degree + shape)."""
from services.circles import _connection_degree_from_sets


def test_degree_direct_friend():
    # seller is directly in viewer's friend set
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "A"}, seller_friends={"V"},
        reachable_seller_friends=set(), viewer_id="V") == 1


def test_degree_mutual_friend():
    # viewer and seller share friend "M"
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"M"}, seller_friends={"M"},
        reachable_seller_friends=set(), viewer_id="V") == 2


def test_degree_third():
    # viewer→A→B→seller: B is in seller_friends AND reachable from viewer_friends
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        reachable_seller_friends={"B"}, viewer_id="V") == 3


def test_degree_none_beyond_third():
    # B is in seller_friends but NOT reachable from viewer_friends → no path
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        reachable_seller_friends=set(), viewer_id="V") is None


def test_degree_self_is_none():
    assert _connection_degree_from_sets(
        seller_id="V", viewer_friends=set(), seller_friends=set(),
        reachable_seller_friends=set(), viewer_id="V") is None


def test_degree_lowest_wins():
    # direct friend AND shares a mutual → still 1
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "M"}, seller_friends={"M"},
        reachable_seller_friends=set(), viewer_id="V") == 1


from services.circles import EMPTY_CIRCLES


def test_empty_circles_new_shape():
    assert EMPTY_CIRCLES == {"connection": {"degree": None}, "school": None}


def test_empty_circles_is_not_mutated_accidentally():
    # canonical constant must keep both keys
    assert set(EMPTY_CIRCLES.keys()) == {"connection", "school"}


def test_batch_returns_new_shape_for_each_seller(db_session, make_user, test_user):
    seller = make_user(display_name="Seller")
    from services.circles import seller_circles_for_viewer_batch
    out = seller_circles_for_viewer_batch(
        db_session, [seller.id], test_user, viewer_circle_ids=set(),
    )
    assert set(out[seller.id].keys()) == {"connection", "school"}
    assert out[seller.id]["connection"]["degree"] is None  # strangers, no graph
    assert out[seller.id]["school"] is None                 # seller has no school


def test_summary_has_no_neighborhood_key(db_session, test_user):
    from services.circles import get_user_circles_summary
    out = get_user_circles_summary(db_session, test_user)
    assert "neighborhood" not in out
    assert set(out.keys()) == {"schools", "mutualFriends"}
