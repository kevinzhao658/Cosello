"""Unit tests for the circles 'insights' enrichment (degree + shape)."""
from services.circles import _connection_degree_from_sets


def test_degree_direct_friend():
    # seller is directly in viewer's friend set
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "A"}, seller_friends={"V"},
        edges_from_viewer_friends={}, viewer_id="V") == 1


def test_degree_mutual_friend():
    # viewer and seller share friend "M"
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"M"}, seller_friends={"M"},
        edges_from_viewer_friends={}, viewer_id="V") == 2


def test_degree_third():
    # viewer→A (friend), A→B (edge), B→seller (B in seller_friends): degree 3
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        edges_from_viewer_friends={"A": {"B"}}, viewer_id="V") == 3


def test_degree_none_beyond_third():
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"A"}, seller_friends={"B"},
        edges_from_viewer_friends={"A": {"C"}}, viewer_id="V") is None


def test_degree_self_is_none():
    assert _connection_degree_from_sets(
        seller_id="V", viewer_friends=set(), seller_friends=set(),
        edges_from_viewer_friends={}, viewer_id="V") is None


def test_degree_lowest_wins():
    # direct friend AND shares a mutual → still 1
    assert _connection_degree_from_sets(
        seller_id="S", viewer_friends={"S", "M"}, seller_friends={"M"},
        edges_from_viewer_friends={}, viewer_id="V") == 1


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
