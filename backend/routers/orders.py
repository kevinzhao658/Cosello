import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, Notification, Review
from auth import get_current_user
from listings_store import listings_db

router = APIRouter(prefix="/api/orders", tags=["orders"])


class CreateOrderRequest(BaseModel):
    listing_id: str
    selected_pickup_slots: list[dict]


class ConfirmOrderRequest(BaseModel):
    confirmed_slot: dict  # { date, time }


class CompleteOrderRequest(BaseModel):
    rating: int  # 1-5
    comment: str = ""


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

    # Snapshot seller's pickup address for neighborhood listings
    listing = _find_listing(order.listing_id)
    if listing and "neighborhood" in listing.get("communities", []):
        if current_user.pickup_address:
            order.pickup_address = current_user.pickup_address

    # Update listing status to sold
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


@router.post("/{order_id}/complete")
async def complete_order(
    order_id: int,
    req: CompleteOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in ("confirmed", "completed"):
        raise HTTPException(status_code=400, detail="Order must be confirmed before completing")

    # Determine caller's role
    if current_user.id == order.buyer_id:
        role = "buyer"
        if order.buyer_reviewed:
            raise HTTPException(status_code=400, detail="You have already reviewed this order")
        reviewee_id = order.seller_id
    elif current_user.id == order.seller_id:
        role = "seller"
        if order.seller_reviewed:
            raise HTTPException(status_code=400, detail="You have already reviewed this order")
        reviewee_id = order.buyer_id
    else:
        raise HTTPException(status_code=403, detail="Not part of this order")

    # Create review
    review = Review(
        order_id=order.id,
        reviewer_id=current_user.id,
        reviewee_id=reviewee_id,
        reviewer_role=role,
        rating=req.rating,
        comment=req.comment,
    )
    db.add(review)

    # Update review flags and order status
    if role == "buyer":
        order.buyer_reviewed = True
    else:
        order.seller_reviewed = True
    order.status = "completed"

    # Notify the other party
    listing = _find_listing(order.listing_id)
    listing_title = listing["title"] if listing else "an item"
    reviewer_name = current_user.display_name or "Someone"

    if role == "buyer":
        notif_message = f'{reviewer_name} confirmed pickup and rated your sale of "{listing_title}"'
    else:
        notif_message = f'{reviewer_name} confirmed pickup and rated your purchase of "{listing_title}"'

    notification = Notification(
        user_id=reviewee_id,
        type="review_submitted",
        title="Pickup Confirmed & Rated!",
        message=notif_message,
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    )
    db.add(notification)
    db.commit()

    return {
        "id": order.id,
        "status": order.status,
        "buyer_reviewed": order.buyer_reviewed,
        "seller_reviewed": order.seller_reviewed,
    }


@router.post("/{order_id}/release-address")
async def release_address(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.id not in (order.buyer_id, order.seller_id):
        raise HTTPException(status_code=403, detail="Not part of this order")

    if order.status != "confirmed":
        raise HTTPException(status_code=400, detail="Order not confirmed")

    # Idempotent: if already released, return current state
    if order.address_released:
        return {
            "id": order.id,
            "address_released": True,
            "pickup_address": order.pickup_address,
        }

    listing = _find_listing(order.listing_id)
    is_neighborhood = listing and "neighborhood" in listing.get("communities", [])

    if not is_neighborhood or not order.pickup_address:
        raise HTTPException(status_code=400, detail="Address release not applicable")

    order.address_released = 1

    listing_title = listing["title"] if listing else "an item"
    buyer = db.query(User).filter(User.id == order.buyer_id).first()
    seller = db.query(User).filter(User.id == order.seller_id).first()
    buyer_name = buyer.display_name if buyer else "Buyer"
    seller_name = seller.display_name if seller else "Seller"

    db.add(Notification(
        user_id=order.seller_id,
        type="address_released",
        title="Address Shared",
        message=f'Your pickup address has been shared with {buyer_name} for "{listing_title}"',
        related_user_id=order.buyer_id,
        listing_id=order.listing_id,
    ))
    db.add(Notification(
        user_id=order.buyer_id,
        type="address_released",
        title="Pickup Address Available",
        message=f'Pickup address for "{listing_title}": {order.pickup_address}',
        related_user_id=order.seller_id,
        listing_id=order.listing_id,
    ))
    db.commit()

    return {
        "id": order.id,
        "address_released": True,
        "pickup_address": order.pickup_address,
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
            "buyer_reviewed": bool(o.buyer_reviewed),
            "seller_reviewed": bool(o.seller_reviewed),
            "pickup_address": o.pickup_address if o.address_released else None,
            "address_released": bool(o.address_released),
            "is_neighborhood": listing is not None and "neighborhood" in listing.get("communities", []),
        })
    return results
