"""Tests for the /api/me/punchlist aggregated dashboard endpoint."""
from __future__ import annotations

import json
import time

import pytest

import main
from models import Listing, PurchaseOrder


@pytest.fixture
def cleanup_orders(db_session, test_user):
    yield
    db_session.query(PurchaseOrder).filter(
        (PurchaseOrder.seller_id == test_user.id)
        | (PurchaseOrder.buyer_id == test_user.id)
    ).delete()
    db_session.commit()


def test_empty_punchlist(authed_client):
    r = authed_client.get("/api/me/punchlist")
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "pickups_to_confirm": [],
        "offers_to_review": [],
        "unread_messages": [],
        "draft_listings": [],
    }


def test_punchlist_returns_pending_pickups_for_seller(
    authed_client, db_session, test_user, make_user, cleanup_orders
):
    buyer = make_user(display_name="Buyer One", neighborhood="SoHo")

    listing_id = f"pl-{int(time.time() * 1000) % 1_000_000_000}"
    listing = Listing(
        id=listing_id,
        user_id=test_user.id,
        brand="ACME",
        name="Widget",
        price_cents=4200,
        posted_at=time.time(),
        image_url="https://test.storage.fake/img.jpg",
    )
    db_session.add(listing)

    order = PurchaseOrder(
        listing_id=listing_id,
        buyer_id=buyer.id,
        seller_id=test_user.id,
        status="pending",
        selected_pickup_slots=json.dumps(
            [{"date": "2026-05-20", "time": "2 PM – 4 PM"}]
        ),
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)

    try:
        r = authed_client.get("/api/me/punchlist")
        assert r.status_code == 200
        body = r.json()
        assert len(body["pickups_to_confirm"]) == 1
        p = body["pickups_to_confirm"][0]
        assert p["order_id"] == order.id
        assert p["listing_id"] == listing_id
        assert p["listing_title"] == "ACME Widget"
        assert p["listing_image"] == "https://test.storage.fake/img.jpg"
        assert "2026-05-20" in p["slot"]
        assert body["offers_to_review"] == []
        assert body["unread_messages"] == []
        assert body["draft_listings"] == []
    finally:
        db_session.query(PurchaseOrder).filter(
            PurchaseOrder.id == order.id
        ).delete()
        db_session.query(Listing).filter(Listing.id == listing_id).delete()
        db_session.commit()


def test_punchlist_excludes_non_pending_and_buyer_side_orders(
    authed_client, db_session, test_user, make_user, cleanup_orders
):
    other_seller = make_user(display_name="Other Seller")

    # Order where current_user is the BUYER — should not appear.
    buy_listing_id = f"plb-{int(time.time() * 1000) % 1_000_000_000}"
    db_session.add(Listing(
        id=buy_listing_id,
        user_id=other_seller.id,
        brand="X",
        name="Y",
        price_cents=100,
        posted_at=time.time(),
    ))
    buy_order = PurchaseOrder(
        listing_id=buy_listing_id,
        buyer_id=test_user.id,
        seller_id=other_seller.id,
        status="pending",
        selected_pickup_slots=json.dumps(
            [{"date": "2026-05-21", "time": "10 AM – 12 PM"}]
        ),
    )
    db_session.add(buy_order)

    # Order where current_user is the SELLER but already confirmed — should not appear.
    sold_listing_id = f"pls-{int(time.time() * 1000) % 1_000_000_000}"
    db_session.add(Listing(
        id=sold_listing_id,
        user_id=test_user.id,
        brand="A",
        name="B",
        price_cents=200,
        posted_at=time.time(),
    ))
    sold_order = PurchaseOrder(
        listing_id=sold_listing_id,
        buyer_id=other_seller.id,
        seller_id=test_user.id,
        status="confirmed",
        selected_pickup_slots=json.dumps(
            [{"date": "2026-05-21", "time": "12-2 PM"}]
        ),
    )
    db_session.add(sold_order)
    db_session.commit()

    try:
        r = authed_client.get("/api/me/punchlist")
        assert r.status_code == 200
        assert r.json()["pickups_to_confirm"] == []
    finally:
        db_session.query(PurchaseOrder).filter(
            PurchaseOrder.id.in_([buy_order.id, sold_order.id])
        ).delete()
        db_session.query(Listing).filter(
            Listing.id.in_([buy_listing_id, sold_listing_id])
        ).delete()
        db_session.commit()
