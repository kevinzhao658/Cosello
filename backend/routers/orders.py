import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, Notification
from auth import get_current_user
from listings_store import listings_db

router = APIRouter(prefix="/api/orders", tags=["orders"])


class CreateOrderRequest(BaseModel):
    listing_id: str
    selected_pickup_slots: list[dict]


class ConfirmOrderRequest(BaseModel):
    confirmed_slot: dict  # { date, time }


def _find_listing(listing_id: str):
    for l in listings_db:
        if l["id"] == listing_id:
            return l
    return None


@router.post("")
async def create_order(
    req: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = _find_listing(req.listing_id)
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")

    if listing.get("status") == "sold":
        raise HTTPException(status_code=400, detail="This listing has already been sold")

    seller_id = listing.get("userId")
    if seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot buy your own listing")

    existing = db.query(PurchaseOrder).filter(
        PurchaseOrder.listing_id == req.listing_id,
        PurchaseOrder.buyer_id == current_user.id,
        PurchaseOrder.status.in_(["pending", "confirmed"]),
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You already have an order for this listing")

    order = PurchaseOrder(
        listing_id=req.listing_id,
        buyer_id=current_user.id,
        seller_id=seller_id,
        status="pending",
        selected_pickup_slots=json.dumps(req.selected_pickup_slots),
    )
    db.add(order)

    # Update listing status to pending
    listing["status"] = "pending"

    buyer_name = current_user.display_name or "Someone"
    notification = Notification(
        user_id=seller_id,
        type="purchase",
        title="New Purchase!",
        message=f'{buyer_name} wants to buy your "{listing["title"]}"',
        related_user_id=current_user.id,
        listing_id=req.listing_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(order)

    return {
        "id": order.id,
        "listing_id": order.listing_id,
        "buyer_id": order.buyer_id,
        "seller_id": order.seller_id,
        "status": order.status,
        "selected_pickup_slots": json.loads(order.selected_pickup_slots) if order.selected_pickup_slots else [],
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.post("/{order_id}/confirm")
async def confirm_order(
    order_id: int,
    req: ConfirmOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the seller can confirm this order")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Order is not pending")

    order.status = "confirmed"
    order.selected_pickup_slots = json.dumps([req.confirmed_slot])

    # Update listing status to sold
    listing = _find_listing(order.listing_id)
    if listing:
        listing["status"] = "sold"

    # Notify the buyer
    seller_name = current_user.display_name or "Seller"
    listing_title = listing["title"] if listing else "an item"
    slot_date = req.confirmed_slot.get("date", "")
    slot_time = req.confirmed_slot.get("time", "")
    time_labels = {"morning": "8am-12pm", "afternoon": "12-5pm", "evening": "5-9pm"}
    time_display = time_labels.get(slot_time, slot_time)

    notification = Notification(
        user_id=order.buyer_id,
        type="order_confirmed",
        title="Pickup Confirmed!",
        message=f'{seller_name} confirmed pickup for "{listing_title}" on {slot_date} ({time_display})',
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    )
    db.add(notification)
    db.commit()

    return {
        "id": order.id,
        "status": order.status,
        "confirmed_slot": req.confirmed_slot,
    }


@router.get("")
async def get_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(PurchaseOrder)
        .filter(
            (PurchaseOrder.buyer_id == current_user.id)
            | (PurchaseOrder.seller_id == current_user.id)
        )
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )

    # Collect buyer IDs for name lookup
    buyer_ids = {o.buyer_id for o in orders}
    buyer_map: dict[int, str] = {}
    if buyer_ids:
        buyers = db.query(User).filter(User.id.in_(buyer_ids)).all()
        for b in buyers:
            buyer_map[b.id] = b.display_name or "Someone"

    results = []
    for o in orders:
        listing = _find_listing(o.listing_id)
        listing_title = listing.get("title", "") if listing else ""
        listing_image = listing.get("imageUrl", "") if listing else ""
        listing_price = listing.get("price", "") if listing else ""

        results.append({
            "id": o.id,
            "listing_id": o.listing_id,
            "listing_title": listing_title,
            "listing_image": listing_image,
            "listing_price": listing_price,
            "buyer_id": o.buyer_id,
            "buyer_name": buyer_map.get(o.buyer_id, "Someone"),
            "seller_id": o.seller_id,
            "status": o.status,
            "selected_pickup_slots": json.loads(o.selected_pickup_slots) if o.selected_pickup_slots else [],
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "role": "buyer" if o.buyer_id == current_user.id else "seller",
        })
    return results
