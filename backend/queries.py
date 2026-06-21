"""Shared query helpers — reusable DB look-ups and authorization guards.

Keep this module free of endpoint-level logic (no FastAPI router imports).
All helpers raise ``HTTPException`` directly so call sites stay one-liners.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Community, Listing


# ---------------------------------------------------------------------------
# Listing helpers
# ---------------------------------------------------------------------------

def get_listing_or_404(listing_id: str, db: Session) -> Listing:
    """Fetch a Listing by id or raise HTTP 404.

    Use this at the top of any endpoint that operates on a single listing
    and should return 404 (not 403) when the listing is absent — regardless
    of who is making the request.

    Endpoints that intentionally collapse "not found" and "not owner" into a
    single 404 (e.g. relist, update_listing) should keep their current
    combined ``filter(Listing.id == …, Listing.user_id == …)`` queries
    rather than switching to this helper, because splitting them would change
    the 404-vs-403 semantics those endpoints deliberately expose.
    """
    listing = db.query(Listing).filter(Listing.id == listing_id).first()
    if not listing:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def assert_listing_owner(listing: Listing, current_user_id: str) -> None:
    """Raise HTTP 403 if *current_user_id* does not own *listing*.

    Call this after ``get_listing_or_404`` for endpoints that want a
    distinct 403 (not a 404) when the requester is authenticated but does
    not own the listing.
    """
    if listing.user_id != current_user_id:
        raise HTTPException(status_code=403, detail="Not your listing")


# ---------------------------------------------------------------------------
# Community helpers
# ---------------------------------------------------------------------------

def require_community_owner(
    community: Community,
    current_user_id: str,
    detail: str = "Only the owner can perform this action",
) -> None:
    """Raise HTTP 403 if *current_user_id* is not the community creator.

    Pass ``detail`` to preserve each endpoint's original client-facing error
    message.  The default message is used when the endpoint did not specify
    one (i.e. only the generic guard is needed).
    """
    if community.created_by != current_user_id:
        raise HTTPException(status_code=403, detail=detail)
