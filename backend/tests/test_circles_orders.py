import sys
import time
import uuid
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from routers.orders import _listing_is_neighborhood
from models import Listing, User


def test_listing_is_neighborhood_uses_seller_neighborhood(db_session, make_user):
    seller = make_user(display_name="OSeller", neighborhood="Chelsea")
    listing = Listing(
        id=uuid.uuid4().hex[:12],
        user_id=seller.id, description="d", price_cents=9900,
        category="other", brand="Unknown", name="Bike",
        posted_at=time.time(),
    )
    db_session.add(listing); db_session.commit(); db_session.refresh(listing)
    assert _listing_is_neighborhood(db_session, listing) is True
    db_session.query(Listing).filter(Listing.id == listing.id).delete()
    db_session.commit()
