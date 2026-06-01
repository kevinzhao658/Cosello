"""Top-searches aggregation endpoint.

Reads the existing `search_queries` table (written by /api/events/search) and
returns the most-searched normalized terms within a rolling time window.
Read-only — no schema or logging changes.
"""
import time

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from models import SearchQuery, User

router = APIRouter(prefix="/api", tags=["searches"])


class TopSearch(BaseModel):
    query_text: str
    count: int


class TopSearchesResponse(BaseModel):
    items: list[TopSearch]


@router.get("/searches/top", response_model=TopSearchesResponse)
async def top_searches(
    window_days: int = Query(7, ge=1, le=90),
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    cutoff = time.time() - window_days * 86400
    norm = func.lower(func.trim(SearchQuery.query_text))
    rows = (
        db.query(norm.label("q"), func.count().label("c"))
        .filter(SearchQuery.ts >= cutoff, func.trim(SearchQuery.query_text) != "")
        .group_by(norm)
        .order_by(func.count().desc())
        .limit(limit)
        .all()
    )
    return TopSearchesResponse(items=[TopSearch(query_text=q, count=c) for q, c in rows])
