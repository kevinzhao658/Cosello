import json
import time
import datetime
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User, PurchaseOrder, Notification, Review
from auth import get_current_user
from listings_store import listings_db

LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days

router = APIRouter(prefix="/api/orders", tags=["orders"])


class CreateOrderRequest(BaseModel):
    listing_id: str
    selected_pickup_slots: list[dict]


class ConfirmOrderRequest(BaseModel):
    confirmed_slot: dict  # { date, time }
    confirmed_time: str = ""  # e.g. "2:30 PM"


class UpdateSlotsRequest(BaseModel):
    selected_pickup_slots: list[dict]


class CompleteOrderRequest(BaseModel):
    rating: int  # 1-5
    comment: str = ""


def _find_listing(listing_id: str, check_expiry: bool = False):
    now = time.time()
    for l in listings_db:
        if l["id"] == listing_id:
            if check_expiry and now - l.get("postedAt", 0) >= LISTING_EXPIRY_SECONDS:
                return None
            return l
    return None


def _check_and_expire_order(order: PurchaseOrder, db: Session) -> bool:
    """If all pickup slots have passed, set status='expired', notify both parties."""
    if order.status != "pending" or not order.selected_pickup_slots:
        return False
    slots = json.loads(order.selected_pickup_slots)
    now_dt = datetime.datetime.now()
    for slot in slots:
        end_hour = 18
        time_str = slot.get("time", "")
        dash_match = re.search(r'[–-]\s*(\d{1,2})\s*(AM|PM)', time_str, re.IGNORECASE)
        if dash_match:
            h = int(dash_match.group(1))
            ampm = dash_match.group(2).upper()
            if ampm == "PM" and h != 12:
                h += 12
            if ampm == "AM" and h == 12:
                h = 0
            end_hour = h
        slot_end = datetime.datetime.strptime(slot["date"], "%Y-%m-%d").replace(hour=end_hour)
        if now_dt <= slot_end:
            return False
    # All slots expired
    order.status = "expired"
    listing = _find_listing(order.listing_id)
    listing_title = listing["title"] if listing else "an item"
    db.add(Notification(
        user_id=order.buyer_id,
        type="order_expired",
        title="Order Expired",
        message=f'Your order for "{listing_title}" has expired — all proposed pickup times have passed.',
        related_user_id=order.seller_id,
        listing_id=order.listing_id,
    ))
    db.add(Notification(
        user_id=order.seller_id,
        type="order_expired",
        title="Order Expired",
        message=f'A buy request for "{listing_title}" has expired — all proposed pickup times have passed.',
        related_user_id=order.buyer_id,
        listing_id=order.listing_id,
    ))
    db.commit()
    return True


@router.post("")
async def create_order(
    req: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    listing = _find_listing(req.listing_id, check_expiry=True)
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

    # Block buyers whose order was declined by the seller
    existing_declined = db.query(PurchaseOrder).filter(
        PurchaseOrder.listing_id == req.listing_id,
        PurchaseOrder.buyer_id == current_user.id,
        PurchaseOrder.status == "declined",
    ).first()
    if existing_declined:
        raise HTTPException(status_code=400, detail="Your order for this listing was declined")

    order = PurchaseOrder(
        listing_id=req.listing_id,
        buyer_id=current_user.id,
        seller_id=seller_id,
        status="pending",
        selected_pickup_slots=json.dumps(req.selected_pickup_slots),
    )
    db.add(order)

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
    if req.confirmed_time:
        order.confirmed_time = req.confirmed_time

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

    time_msg = f"on {slot_date} at {req.confirmed_time}" if req.confirmed_time else f"on {slot_date} ({time_display})"
    neighborhood = current_user.neighborhood or ""
    location_msg = f" — Pickup in {neighborhood}. Exact location revealed at time of pickup." if neighborhood else ""
    notification = Notification(
        user_id=order.buyer_id,
        type="order_confirmed",
        title="Pickup Confirmed!",
        message=f'{seller_name} confirmed pickup for "{listing_title}" {time_msg}{location_msg}',
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    )
    db.add(notification)

    # Auto-decline all other pending orders for this listing
    other_pending = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.listing_id == order.listing_id,
            PurchaseOrder.id != order_id,
            PurchaseOrder.status == "pending",
        )
        .all()
    )
    for other in other_pending:
        other.status = "declined"
        db.add(Notification(
            user_id=other.buyer_id,
            type="order_declined",
            title="Order Update",
            message=f'Your order for "{listing_title}" could not be fulfilled \u2014 the seller may have had scheduling conflicts, accepted another offer, or withdrawn the listing.',
            related_user_id=current_user.id,
            listing_id=order.listing_id,
        ))

    db.commit()

    return {
        "id": order.id,
        "status": order.status,
        "confirmed_slot": req.confirmed_slot,
        "confirmed_time": req.confirmed_time,
    }


@router.post("/{order_id}/decline")
async def decline_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the seller can decline this order")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Order is not pending")

    order.status = "declined"

    # Notify the buyer
    listing = _find_listing(order.listing_id)
    listing_title = listing["title"] if listing else "an item"
    notification = Notification(
        user_id=order.buyer_id,
        type="order_declined",
        title="Order Update",
        message=f'Your order for "{listing_title}" could not be fulfilled \u2014 the seller may have had scheduling conflicts, accepted another offer, or withdrawn the listing.',
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    )
    db.add(notification)
    db.commit()

    return {"id": order.id, "status": "declined"}


@router.post("/{order_id}/withdraw")
async def withdraw_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can withdraw this order")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Order is not pending")

    order.status = "withdrawn"

    listing = _find_listing(order.listing_id)
    buyer_name = current_user.display_name or "Someone"
    listing_title = listing["title"] if listing else "an item"
    db.add(Notification(
        user_id=order.seller_id,
        type="order_withdrawn",
        title="Order Withdrawn",
        message=f'{buyer_name} withdrew their order for "{listing_title}"',
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    ))
    db.commit()

    return {"id": order.id, "status": "withdrawn"}


@router.post("/{order_id}/expire")
async def expire_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if current_user.id not in (order.buyer_id, order.seller_id):
        raise HTTPException(status_code=403, detail="Not part of this order")

    if order.status == "expired":
        return {"id": order.id, "status": "expired"}

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Order is not pending")

    _check_and_expire_order(order, db)

    return {"id": order.id, "status": "expired"}


@router.post("/{order_id}/update-slots")
async def update_order_slots(
    order_id: int,
    req: UpdateSlotsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can update this order")

    if order.status != "pending":
        raise HTTPException(status_code=400, detail="Can only update pending orders")

    order.selected_pickup_slots = json.dumps(req.selected_pickup_slots)

    listing = _find_listing(order.listing_id)
    buyer_name = current_user.display_name or "Someone"
    listing_title = listing["title"] if listing else "an item"
    db.add(Notification(
        user_id=order.seller_id,
        type="order_updated",
        title="Pickup Windows Updated",
        message=f'{buyer_name} updated their pickup windows for "{listing_title}"',
        related_user_id=current_user.id,
        listing_id=order.listing_id,
    ))
    db.commit()

    return {
        "id": order.id,
        "status": order.status,
        "selected_pickup_slots": req.selected_pickup_slots,
    }


@router.post("/{order_id}/notify-pickup-ready")
async def notify_pickup_ready(
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

    # Idempotent: if already notified, return early
    if order.pickup_notified:
        return {"id": order.id, "pickup_notified": True}

    order.pickup_notified = 1

    listing = _find_listing(order.listing_id)
    listing_title = listing["title"] if listing else "an item"

    db.add(Notification(
        user_id=order.buyer_id,
        type="pickup_ready",
        title="Confirm Pickup",
        message=f'Time to confirm pickup for "{listing_title}" and rate your experience.',
        related_user_id=order.seller_id,
        listing_id=order.listing_id,
    ))
    db.add(Notification(
        user_id=order.seller_id,
        type="pickup_ready",
        title="Confirm Pickup",
        message=f'Time to confirm pickup for "{listing_title}" and rate your experience.',
        related_user_id=order.buyer_id,
        listing_id=order.listing_id,
    ))
    db.commit()

    return {"id": order.id, "pickup_notified": True}


@router.get("/status/{listing_id}")
async def get_order_status_for_listing(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.listing_id == listing_id,
            PurchaseOrder.buyer_id == current_user.id,
        )
        .order_by(PurchaseOrder.created_at.desc())
        .first()
    )
    if not order:
        return {"status": None}

    # Auto-expire if all pickup slots have passed
    if order.status == "pending":
        _check_and_expire_order(order, db)

    return {
        "status": order.status,
        "order_id": order.id,
        "selected_pickup_slots": json.loads(order.selected_pickup_slots) if order.selected_pickup_slots else [],
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

    # Update review flags
    if role == "buyer":
        order.buyer_reviewed = True
    else:
        order.seller_reviewed = True

    # Only mark completed when BOTH parties have reviewed
    if order.buyer_reviewed and order.seller_reviewed:
        order.status = "completed"

    # Notify the other party
    listing = _find_listing(order.listing_id)
    listing_title = listing["title"] if listing else "an item"
    reviewer_name = current_user.display_name or "Someone"

    if role == "buyer":
        if order.seller_reviewed:
            notif_title = "Transaction Complete!"
            notif_type = "order_completed"
            notif_message = f'Both parties confirmed pickup for "{listing_title}" — transaction complete!'
        else:
            notif_title = "Pickup Confirmed — Your Turn!"
            notif_type = "review_submitted"
            notif_message = f'{reviewer_name} confirmed pickup and rated your sale of "{listing_title}". Please confirm on your end!'
    else:
        if order.buyer_reviewed:
            notif_title = "Transaction Complete!"
            notif_type = "order_completed"
            notif_message = f'Both parties confirmed pickup for "{listing_title}" — transaction complete!'
        else:
            notif_title = "Pickup Confirmed — Your Turn!"
            notif_type = "review_submitted"
            notif_message = f'{reviewer_name} confirmed pickup and rated your purchase of "{listing_title}". Please confirm on your end!'

    notification = Notification(
        user_id=reviewee_id,
        type=notif_type,
        title=notif_title,
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

    # Compute pickup target ISO for live countdown in notifications
    slots = json.loads(order.selected_pickup_slots) if order.selected_pickup_slots else []
    slot = slots[0] if slots else {}
    slot_date = slot.get("date", "")
    pickup_time_display = order.confirmed_time or ""
    target_hour, target_min = 18, 0
    if order.confirmed_time:
        ct_match = re.match(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', order.confirmed_time, re.IGNORECASE)
        if ct_match:
            h = int(ct_match.group(1))
            target_min = int(ct_match.group(2))
            ampm = ct_match.group(3).upper()
            if ampm == "PM" and h != 12: h += 12
            if ampm == "AM" and h == 12: h = 0
            target_hour = h
    else:
        time_str = slot.get("time", "")
        dash_match = re.search(r'[–-]\s*(\d{1,2})\s*(AM|PM)', time_str, re.IGNORECASE)
        if dash_match:
            h = int(dash_match.group(1))
            ampm = dash_match.group(2).upper()
            if ampm == "PM" and h != 12: h += 12
            if ampm == "AM" and h == 12: h = 0
            target_hour = h
        # Format a display time from target_hour
        if target_hour >= 12:
            dh = target_hour - 12 if target_hour > 12 else 12
            pickup_time_display = f"{dh}:00 PM"
        else:
            dh = target_hour if target_hour > 0 else 12
            pickup_time_display = f"{dh}:00 AM"
    pickup_target_iso = f"{slot_date}T{target_hour:02d}:{target_min:02d}:00"

    # Message format: base_text||pickup_time_display||pickup_target_iso
    # Frontend parses this for live countdown rendering
    db.add(Notification(
        user_id=order.seller_id,
        type="address_released",
        title="Upcoming Pickup",
        message=f'"{listing_title}" ready for pickup with {buyer_name}.||{pickup_time_display}||{pickup_target_iso}',
        related_user_id=order.buyer_id,
        listing_id=order.listing_id,
    ))
    db.add(Notification(
        user_id=order.buyer_id,
        type="address_released",
        title="Upcoming Pickup",
        message=f'"{listing_title}" ready for pickup at {order.pickup_address}.||{pickup_time_display}||{pickup_target_iso}',
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
    buyer_map: dict[int, dict] = {}
    if buyer_ids:
        buyers = db.query(User).filter(User.id.in_(buyer_ids)).all()
        for b in buyers:
            buyer_map[b.id] = {"name": b.display_name or "Someone", "picture": b.profile_picture}

    # Filter out orders whose listing no longer exists or has expired,
    # and clean up orphaned orders from the database.
    orphaned_ids = []
    results = []
    for o in orders:
        listing = _find_listing(o.listing_id, check_expiry=True)
        if listing is None:
            # Notify buyers with pending orders that the listing expired
            if o.status == "pending" and o.buyer_id == current_user.id:
                raw_listing = _find_listing(o.listing_id, check_expiry=False)
                listing_title = raw_listing["title"] if raw_listing else "an item"
                db.add(Notification(
                    user_id=o.buyer_id,
                    type="order_cancelled",
                    title="Order Cancelled",
                    message=f'The listing "{listing_title}" has expired. Your order has been cancelled.',
                    listing_id=o.listing_id,
                ))
            orphaned_ids.append(o.id)
            continue

        # Auto-expire pending orders whose pickup slots have all passed
        if o.status == "pending":
            _check_and_expire_order(o, db)

        results.append({
            "id": o.id,
            "listing_id": o.listing_id,
            "listing_title": listing.get("title", ""),
            "listing_image": listing.get("imageUrl", ""),
            "listing_price": listing.get("price", ""),
            "buyer_id": o.buyer_id,
            "buyer_name": buyer_map.get(o.buyer_id, {}).get("name", "Someone"),
            "buyer_picture": buyer_map.get(o.buyer_id, {}).get("picture"),
            "seller_id": o.seller_id,
            "status": o.status,
            "selected_pickup_slots": json.loads(o.selected_pickup_slots) if o.selected_pickup_slots else [],
            "confirmed_time": o.confirmed_time,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "role": "buyer" if o.buyer_id == current_user.id else "seller",
            "buyer_reviewed": bool(o.buyer_reviewed),
            "seller_reviewed": bool(o.seller_reviewed),
            "pickup_address": o.pickup_address if o.address_released else None,
            "address_released": bool(o.address_released),
            "is_neighborhood": "neighborhood" in listing.get("communities", []),
            "pickup_notified": bool(o.pickup_notified),
        })

    # Delete orphaned orders from the database
    if orphaned_ids:
        db.query(PurchaseOrder).filter(PurchaseOrder.id.in_(orphaned_ids)).delete(synchronize_session=False)
        db.commit()

    return results
