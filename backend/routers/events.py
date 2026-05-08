"""Behavioral event capture for the FYP ranker.

Three endpoints, all auth-required, all return 204:
- POST /api/events/view        — listing impressions + dwell
- POST /api/events/search      — query strings + filters
- POST /api/interactions       — explicit signals (hide / block_seller / not_interested)

`/api/interactions` is idempotent on `(user_id, listing_id, action)`: a duplicate
post updates the row's `ts` instead of inserting a new row.
"""
import json
import time
from typing import Optional

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User, ListingView, SearchQuery, ListingInteraction
from auth import get_current_user


router = APIRouter(prefix="/api", tags=["events"])


# ---------- Schemas ----------

class ViewEventRequest(BaseModel):
    listing_id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    dwell_ms: int = Field(..., ge=0)


class SearchEventRequest(BaseModel):
    query: str
    filters: Optional[dict] = None


class InteractionRequest(BaseModel):
    listing_id: str = Field(..., min_length=1)
    action: str = Field(..., min_length=1)


# ---------- Endpoints ----------

@router.post("/events/view", status_code=204)
async def record_view(
    req: ViewEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.add(ListingView(
        user_id=current_user.id,
        listing_id=req.listing_id,
        source=req.source,
        dwell_ms=req.dwell_ms,
        ts=time.time(),
    ))
    db.commit()
    return Response(status_code=204)


@router.post("/events/search", status_code=204)
async def record_search(
    req: SearchEventRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.add(SearchQuery(
        user_id=current_user.id,
        query_text=req.query,
        filters_json=json.dumps(req.filters) if req.filters is not None else None,
        ts=time.time(),
    ))
    db.commit()
    return Response(status_code=204)


@router.post("/interactions", status_code=204)
async def record_interaction(
    req: InteractionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(ListingInteraction).filter(
        ListingInteraction.user_id == current_user.id,
        ListingInteraction.listing_id == req.listing_id,
        ListingInteraction.action == req.action,
    ).first()
    if existing is not None:
        existing.ts = time.time()
    else:
        db.add(ListingInteraction(
            user_id=current_user.id,
            listing_id=req.listing_id,
            action=req.action,
            ts=time.time(),
        ))
    db.commit()
    return Response(status_code=204)
