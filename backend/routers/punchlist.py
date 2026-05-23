"""Aggregated dashboard ("punchlist") for the current user.

Currently surfaces only `pickups_to_confirm` (seller-side pending orders where
the buyer has proposed slots and the seller hasn't acted yet). The other
three buckets — offers, unread messages, drafts — are stubbed empty until
those features ship; the response shape is locked so the frontend can render
"All clear" empty states without a follow-up backend change.
"""
import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Listing, PurchaseOrder, User

router = APIRouter(prefix="/api/me", tags=["punchlist"])


@router.get("/punchlist")
async def get_punchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pending_orders = (
        db.query(PurchaseOrder)
        .filter(
            PurchaseOrder.seller_id == current_user.id,
            PurchaseOrder.status == "pending",
            PurchaseOrder.selected_pickup_slots.isnot(None),
        )
        .order_by(PurchaseOrder.created_at.desc())
        .all()
    )

    listing_ids = {o.listing_id for o in pending_orders}
    listings_by_id: dict[str, Listing] = {}
    if listing_ids:
        rows = db.query(Listing).filter(Listing.id.in_(listing_ids)).all()
        listings_by_id = {r.id: r for r in rows}

    pickups: list[dict] = []
    for o in pending_orders:
        listing = listings_by_id.get(o.listing_id)
        if listing is None:
            continue
        slots = json.loads(o.selected_pickup_slots) if o.selected_pickup_slots else []
        first_slot = slots[0] if slots else None
        slot_label: str | None = None
        if first_slot:
            date = first_slot.get("date") or ""
            time_label = first_slot.get("time") or ""
            slot_label = f"{date} {time_label}".strip() or None

        image_urls = json.loads(listing.image_urls) if listing.image_urls else []
        first_image = listing.image_url or (image_urls[0] if image_urls else None)

        pickups.append({
            "order_id": o.id,
            "listing_id": o.listing_id,
            "listing_title": listing.title_str,
            "listing_image": first_image,
            "slot": slot_label,
        })

    return {
        "pickups_to_confirm": pickups,
        "offers_to_review": [],
        "unread_messages": [],
        "draft_listings": [],
    }
