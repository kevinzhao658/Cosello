"""Wishlist router — save/unsave listings, folder management."""

import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import Listing, User, WishlistFolder, WishlistItem

router = APIRouter()

# 7 days — mirrors the LISTING_EXPIRY_SECONDS constant in listings.py.
_LISTING_EXPIRY_SECONDS = 7 * 24 * 60 * 60


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class WishlistFolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WishlistFolderUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class WishlistItemFolderUpdate(BaseModel):
    folder_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_folder_name(name: str) -> str:
    trimmed = (name or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Folder name cannot be empty")
    if len(trimmed) > 80:
        raise HTTPException(status_code=400, detail="Folder name too long (max 80)")
    return trimmed


# ---------------------------------------------------------------------------
# Wishlist item endpoints
# ---------------------------------------------------------------------------

@router.get("/api/wishlist")
def get_wishlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = db.query(WishlistItem).filter(WishlistItem.user_id == current_user.id).all()
    return [item.listing_id for item in items]


@router.get("/api/wishlist/listings")
def get_wishlist_listings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )
    if not items:
        return []
    folder_by_listing = {item.listing_id: item.folder_id for item in items}
    wishlisted_ids = set(folder_by_listing.keys())
    now = time.time()
    cutoff = now - _LISTING_EXPIRY_SECONDS
    rows = db.query(Listing).filter(Listing.id.in_(wishlisted_ids), Listing.posted_at >= cutoff).all()
    results = []
    for r in rows:
        d = r.to_dict()
        d["folder_id"] = folder_by_listing.get(r.id)
        results.append(d)
    return results


# ---------------------------------------------------------------------------
# Wishlist folder endpoints
#
# These routes are declared BEFORE `POST /api/wishlist/{listing_id}` so the
# literal `/folders` and `/{listing_id}/folder` paths don't get shadowed by
# the catch-all `{listing_id}` segment (FastAPI matches routes in
# registration order).
# ---------------------------------------------------------------------------

@router.get("/api/wishlist/folders")
def list_wishlist_folders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folders = (
        db.query(WishlistFolder)
        .filter(WishlistFolder.user_id == current_user.id)
        .order_by(WishlistFolder.created_at.asc())
        .all()
    )
    if not folders:
        return []
    folder_ids = [f.id for f in folders]
    counts: dict[int, int] = {fid: 0 for fid in folder_ids}
    rows = (
        db.query(WishlistItem.folder_id)
        .filter(
            WishlistItem.user_id == current_user.id,
            WishlistItem.folder_id.in_(folder_ids),
        )
        .all()
    )
    for (fid,) in rows:
        counts[fid] = counts.get(fid, 0) + 1
    return [
        {"id": f.id, "name": f.name, "item_count": counts.get(f.id, 0)}
        for f in folders
    ]


@router.post("/api/wishlist/folders", status_code=201)
def create_wishlist_folder(
    body: WishlistFolderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = _validate_folder_name(body.name)
    folder = WishlistFolder(user_id=current_user.id, name=name)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder.to_dict()


@router.patch("/api/wishlist/folders/{folder_id}")
def update_wishlist_folder(
    folder_id: int,
    body: WishlistFolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = (
        db.query(WishlistFolder)
        .filter(
            WishlistFolder.id == folder_id,
            WishlistFolder.user_id == current_user.id,
        )
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = _validate_folder_name(body.name)
    db.commit()
    db.refresh(folder)
    return folder.to_dict()


@router.delete("/api/wishlist/folders/{folder_id}", status_code=204)
def delete_wishlist_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    folder = (
        db.query(WishlistFolder)
        .filter(
            WishlistFolder.id == folder_id,
            WishlistFolder.user_id == current_user.id,
        )
        .first()
    )
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    # FK uses ON DELETE SET NULL — items remain wishlisted, just unfiled.
    db.delete(folder)
    db.commit()
    return


@router.patch("/api/wishlist/{listing_id}/folder", status_code=204)
def set_wishlist_item_folder(
    listing_id: str,
    body: WishlistItemFolderUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(WishlistItem)
        .filter(
            WishlistItem.user_id == current_user.id,
            WishlistItem.listing_id == listing_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Listing not in wishlist")
    if body.folder_id is not None:
        folder = (
            db.query(WishlistFolder)
            .filter(
                WishlistFolder.id == body.folder_id,
                WishlistFolder.user_id == current_user.id,
            )
            .first()
        )
        if not folder:
            raise HTTPException(status_code=400, detail="Folder not owned by user")
    item.folder_id = body.folder_id
    db.commit()
    return


@router.post("/api/wishlist/{listing_id}")
def toggle_wishlist(
    listing_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing = db.query(WishlistItem).filter(
        WishlistItem.user_id == current_user.id,
        WishlistItem.listing_id == listing_id,
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"wishlisted": False}
    item = WishlistItem(user_id=current_user.id, listing_id=listing_id)
    db.add(item)
    db.commit()
    return {"wishlisted": True}
