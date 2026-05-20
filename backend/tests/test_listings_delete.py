"""Tests for DELETE /api/listings/{listing_id}."""
from __future__ import annotations

import json
import time

import pytest

import main
from models import Listing, Notification, PurchaseOrder


def _make_listing(db_session, owner_id: str, *, status: str = "open") -> str:
    listing_id = f"dl-{int(time.time() * 1_000_000) % 1_000_000_000}"
    db_session.add(Listing(
        id=listing_id,
        user_id=owner_id,
        brand="ACME",
        name="Widget",
        price_cents=4200,
        posted_at=time.time(),
        status=status,
        image_url="https://test.storage.fake/img.jpg",
    ))
    db_session.commit()
    return listing_id


@pytest.fixture
def cleanup(db_session, test_user):
    yield
    db_session.query(Notification).filter(
        Notification.user_id == test_user.id
    ).delete()
    db_session.query(PurchaseOrder).filter(
        (PurchaseOrder.seller_id == test_user.id)
        | (PurchaseOrder.buyer_id == test_user.id)
    ).delete()
    db_session.query(Listing).filter(Listing.user_id == test_user.id).delete()
    db_session.commit()


def test_delete_own_listing_no_orders_returns_204(
    authed_client, db_session, test_user, cleanup
):
    listing_id = _make_listing(db_session, test_user.id)

    r = authed_client.delete(f"/api/listings/{listing_id}")

    assert r.status_code == 204
    assert db_session.query(Listing).filter(Listing.id == listing_id).first() is None


def test_delete_other_users_listing_returns_403(
    authed_client, db_session, test_user, make_user, cleanup
):
    other = make_user(display_name="Other Seller")
    listing_id = _make_listing(db_session, other.id)

    r = authed_client.delete(f"/api/listings/{listing_id}")

    assert r.status_code == 403
    assert db_session.query(Listing).filter(Listing.id == listing_id).first() is not None
    db_session.query(Listing).filter(Listing.id == listing_id).delete()
    db_session.commit()


def test_delete_missing_listing_returns_404(authed_client):
    r = authed_client.delete("/api/listings/does-not-exist")
    assert r.status_code == 404


def test_delete_sold_listing_returns_400(
    authed_client, db_session, test_user, cleanup
):
    listing_id = _make_listing(db_session, test_user.id, status="sold")

    r = authed_client.delete(f"/api/listings/{listing_id}")

    assert r.status_code == 400
    assert db_session.query(Listing).filter(Listing.id == listing_id).first() is not None


def test_delete_cascades_pending_order_to_cancelled_by_seller(
    authed_client, db_session, test_user, make_user, cleanup
):
    buyer = make_user(display_name="Buyer")
    listing_id = _make_listing(db_session, test_user.id)

    order = PurchaseOrder(
        listing_id=listing_id,
        buyer_id=buyer.id,
        seller_id=test_user.id,
        status="pending",
        selected_pickup_slots=json.dumps(
            [{"date": "2026-05-22", "time": "2 PM – 4 PM"}]
        ),
    )
    db_session.add(order)
    db_session.commit()
    db_session.refresh(order)
    order_id = order.id

    r = authed_client.delete(f"/api/listings/{listing_id}")

    assert r.status_code == 204
    assert db_session.query(Listing).filter(Listing.id == listing_id).first() is None
    db_session.expire_all()
    cancelled = db_session.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    assert cancelled is not None
    assert cancelled.status == "cancelled_by_seller"

    notif = (
        db_session.query(Notification)
        .filter(
            Notification.user_id == buyer.id,
            Notification.type == "order_cancelled",
            Notification.listing_id == listing_id,
        )
        .first()
    )
    assert notif is not None
    db_session.query(Notification).filter(Notification.user_id == buyer.id).delete()
    db_session.commit()


def test_delete_does_not_touch_terminal_orders(
    authed_client, db_session, test_user, make_user, cleanup
):
    buyer = make_user(display_name="Buyer")
    listing_id = _make_listing(db_session, test_user.id)

    declined = PurchaseOrder(
        listing_id=listing_id,
        buyer_id=buyer.id,
        seller_id=test_user.id,
        status="declined",
    )
    db_session.add(declined)
    db_session.commit()
    db_session.refresh(declined)
    declined_id = declined.id

    r = authed_client.delete(f"/api/listings/{listing_id}")

    assert r.status_code == 204
    db_session.expire_all()
    still_declined = db_session.query(PurchaseOrder).filter(
        PurchaseOrder.id == declined_id
    ).first()
    assert still_declined.status == "declined"
    db_session.query(PurchaseOrder).filter(PurchaseOrder.id == declined_id).delete()
    db_session.commit()
