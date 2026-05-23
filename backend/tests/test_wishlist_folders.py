"""Tests for wishlist-folder CRUD + per-item folder assignment.

Skipped when Supabase env isn't configured (the `test_user` fixture seeds via
the Admin API). Run locally with `backend/.env` loaded.
"""
from __future__ import annotations

import time

import pytest

import main
from models import Listing, WishlistFolder, WishlistItem


@pytest.fixture
def test_listing(db_session, test_user):
    listing_id = f"wl-{int(time.time() * 1000) % 1_000_000_000}"
    listing = Listing(
        id=listing_id,
        user_id=test_user.id,
        brand="TestBrand",
        name="Test Item",
        price_cents=1234,
        posted_at=time.time(),
    )
    db_session.add(listing)
    db_session.commit()
    yield listing
    db_session.query(WishlistItem).filter(
        WishlistItem.listing_id == listing_id
    ).delete()
    db_session.query(Listing).filter(Listing.id == listing_id).delete()
    db_session.commit()


@pytest.fixture
def cleanup_folders(db_session, test_user):
    yield
    db_session.query(WishlistItem).filter(
        WishlistItem.user_id == test_user.id
    ).delete()
    db_session.query(WishlistFolder).filter(
        WishlistFolder.user_id == test_user.id
    ).delete()
    db_session.commit()


def test_create_list_rename_delete_folder(authed_client, cleanup_folders):
    # Empty list on a fresh user
    r = authed_client.get("/api/wishlist/folders")
    assert r.status_code == 200
    assert r.json() == []

    # Create
    r = authed_client.post("/api/wishlist/folders", json={"name": "Gifts"})
    assert r.status_code == 201
    folder = r.json()
    fid = folder["id"]
    assert folder["name"] == "Gifts"

    # Empty/whitespace-only name rejected
    r = authed_client.post("/api/wishlist/folders", json={"name": "   "})
    assert r.status_code == 400

    # List shows item_count=0
    r = authed_client.get("/api/wishlist/folders")
    listed = r.json()
    assert len(listed) == 1
    assert listed[0] == {"id": fid, "name": "Gifts", "item_count": 0}

    # Rename
    r = authed_client.patch(
        f"/api/wishlist/folders/{fid}", json={"name": "Wishlist"}
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Wishlist"

    # Rename non-existent → 404
    r = authed_client.patch(
        "/api/wishlist/folders/9999999", json={"name": "Nope"}
    )
    assert r.status_code == 404

    # Delete
    r = authed_client.delete(f"/api/wishlist/folders/{fid}")
    assert r.status_code == 204

    # Re-delete → 404
    r = authed_client.delete(f"/api/wishlist/folders/{fid}")
    assert r.status_code == 404


def test_assign_and_unassign_listing_to_folder(
    authed_client, db_session, test_user, test_listing, cleanup_folders
):
    # Wishlist the listing
    r = authed_client.post(f"/api/wishlist/{test_listing.id}")
    assert r.status_code == 200
    assert r.json() == {"wishlisted": True}

    # Create a folder
    r = authed_client.post("/api/wishlist/folders", json={"name": "Saved"})
    fid = r.json()["id"]

    # Assign
    r = authed_client.patch(
        f"/api/wishlist/{test_listing.id}/folder", json={"folder_id": fid}
    )
    assert r.status_code == 204

    # folder count should now be 1
    r = authed_client.get("/api/wishlist/folders")
    assert r.json()[0]["item_count"] == 1

    # /api/wishlist/listings should report folder_id on the item
    r = authed_client.get("/api/wishlist/listings")
    payload = r.json()
    assert len(payload) == 1
    assert payload[0]["folder_id"] == fid

    # Unassign
    r = authed_client.patch(
        f"/api/wishlist/{test_listing.id}/folder", json={"folder_id": None}
    )
    assert r.status_code == 204
    r = authed_client.get("/api/wishlist/listings")
    assert r.json()[0]["folder_id"] is None

    # Assigning a non-owned folder id → 400
    r = authed_client.patch(
        f"/api/wishlist/{test_listing.id}/folder", json={"folder_id": 9999999}
    )
    assert r.status_code == 400

    # Patching folder on a listing not in wishlist → 404
    r = authed_client.patch(
        "/api/wishlist/not-in-wishlist/folder", json={"folder_id": fid}
    )
    assert r.status_code == 404


def test_delete_folder_sets_item_folder_id_null(
    authed_client, db_session, test_user, test_listing, cleanup_folders
):
    authed_client.post(f"/api/wishlist/{test_listing.id}")
    fid = authed_client.post(
        "/api/wishlist/folders", json={"name": "Temp"}
    ).json()["id"]
    authed_client.patch(
        f"/api/wishlist/{test_listing.id}/folder", json={"folder_id": fid}
    )

    # Delete the folder
    r = authed_client.delete(f"/api/wishlist/folders/{fid}")
    assert r.status_code == 204

    # Item should still be in the wishlist with folder_id=NULL
    r = authed_client.get("/api/wishlist/listings")
    listings = r.json()
    assert len(listings) == 1
    assert listings[0]["folder_id"] is None
