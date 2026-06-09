import json
import time

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=False), primary_key=True, index=True)
    display_name = Column(String(100), nullable=True)
    neighborhood = Column(String(100), nullable=True)
    profile_picture = Column(String(255), nullable=True)
    pickup_address = Column(String(255), nullable=True)
    zip_code = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Community(Base):
    __tablename__ = "communities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    neighborhood = Column(String(100), nullable=True)
    pickup_address = Column(String(255), nullable=True)
    zip_code = Column(String(10), nullable=True)
    image = Column(String(255), nullable=True)
    is_public = Column(Boolean, default=True)
    invite_code = Column(String(30), unique=True, index=True, nullable=False)
    created_by = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CommunityMember(Base):
    __tablename__ = "community_members"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="member")
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_community_user"),
    )


class JoinRequest(Base):
    __tablename__ = "join_requests"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_join_request"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # join_request, request_accepted
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=True)
    related_user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    listing_id = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(String(20), nullable=False)
    folder_id = Column(
        Integer,
        ForeignKey("wishlist_folders.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_wishlist_item"),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "listing_id": self.listing_id,
            "folder_id": self.folder_id,
        }


class WishlistFolder(Base):
    __tablename__ = "wishlist_folders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name}


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    friend_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="accepted")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "friend_id", name="uq_friendship"),
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(String(20), nullable=False, index=True)
    buyer_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    seller_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="pending")
    selected_pickup_slots = Column(String(2000), nullable=True)
    confirmed_time = Column(String(20), nullable=True)
    buyer_reviewed = Column(Boolean, default=False)
    seller_reviewed = Column(Boolean, default=False)
    pickup_address = Column(String(255), nullable=True)
    address_released = Column(Integer, default=0)
    pickup_notified = Column(Integer, default=0)
    list_cycle = Column(Integer, default=0, nullable=False)
    listing_price_cents = Column(Integer, nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    __tablename__ = "listings"

    id = Column(String(20), primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    brand = Column(String(200), nullable=True)
    name = Column(String(200), nullable=True)
    description = Column(String(2000), nullable=True)
    price_cents = Column(Integer, nullable=False)
    condition = Column(String(20), nullable=True)
    condition_score = Column(Integer, nullable=True)
    product_year = Column(Integer, nullable=True)
    identifier_confidence = Column(String(10), nullable=True)
    location = Column(String(100), nullable=True)
    tags = Column(String(1000), nullable=True)  # JSON array
    communities = Column(String(1000), nullable=True)  # JSON array of int|"neighborhood"
    visibility = Column(String(20), default="public")
    image_url = Column(String(500), nullable=True)
    image_urls = Column(String(2000), nullable=True)  # JSON array
    pickup_location = Column(String(255), nullable=True)
    status = Column(String(20), default="open")
    category = Column(String(30), default="other", index=True)
    category_attributes = Column(String(2000), nullable=True)  # JSON string
    posted_at = Column(Float, nullable=False, index=True)
    original_posted_at = Column(Float, nullable=True)
    relist_count = Column(Integer, default=0, nullable=False)

    @property
    def title_str(self) -> str:
        """Convenience accessor that joins brand + name in render order.

        `"Unknown"` (case-insensitive) on `brand` is treated as empty so we
        never produce ugly `"Unknown Foo"` titles. Mirrors `format_title` in
        main.py so router code (notifications, friends, orders) can produce a
        human-readable label without depending on the listing-gen helper.
        """
        b = (self.brand or "").strip()
        if b.lower() == "unknown":
            b = ""
        n = (self.name or "").strip()
        return f"{b} {n}".strip()

    def to_dict(self) -> dict:
        """Serialize to the dict format the API currently returns.

        `userId` is the seller's UUID (string) — the post-Supabase migration
        replaced integer surrogate ids with auth.users-backed UUIDs, and
        clients must round-trip the field as a string.
        """
        brand = (self.brand or "").strip()
        name = (self.name or "").strip()
        title = self.title_str
        price_cents = int(self.price_cents) if self.price_cents is not None else 0
        return {
            "id": self.id,
            "userId": self.user_id,
            "brand": brand,
            "name": name,
            "title": title,
            "description": self.description or "",
            "priceCents": price_cents,
            "price": str(price_cents // 100),
            "condition": self.condition or "Good",
            "conditionScore": self.condition_score,
            "productYear": self.product_year,
            "identifierConfidence": self.identifier_confidence,
            "location": self.location or "",
            "tags": json.loads(self.tags) if self.tags else [],
            "communities": json.loads(self.communities) if self.communities else [],
            "visibility": self.visibility or "public",
            "imageUrl": self.image_url or "",
            "imageUrls": json.loads(self.image_urls) if self.image_urls else [],
            "pickup_location": self.pickup_location or "",
            "status": self.status or "open",
            "category": self.category or "other",
            "categoryAttributes": json.loads(self.category_attributes) if self.category_attributes else {},
            "postedAt": self.posted_at,
            "originalPostedAt": self.original_posted_at,
            "relistCount": int(self.relist_count) if self.relist_count is not None else 0,
        }


class ZipCentroid(Base):
    __tablename__ = "zip_centroids"
    zip_code = Column(String(10), primary_key=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    borough = Column(String(40), nullable=True)


class ListingView(Base):
    __tablename__ = "listing_views"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(String(20), ForeignKey("listings.id"), nullable=False, index=True)
    source = Column(String(20), nullable=False)  # feed | search | profile | direct
    dwell_ms = Column(Integer, nullable=False, default=0)
    ts = Column(Float, nullable=False, default=lambda: time.time(), index=True)


class SearchQuery(Base):
    __tablename__ = "search_queries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    query_text = Column(String(500), nullable=False)
    filters_json = Column(Text, nullable=True)
    ts = Column(Float, nullable=False, default=lambda: time.time(), index=True)


class ListingInteraction(Base):
    __tablename__ = "listing_interactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(String(20), ForeignKey("listings.id"), nullable=False, index=True)
    action = Column(String(30), nullable=False)  # hide | block_seller | not_interested
    ts = Column(Float, nullable=False, default=lambda: time.time(), index=True)

    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", "action", name="uq_listing_interaction"),
    )


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    reviewer_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    reviewee_id = Column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=False)
    reviewer_role = Column(String(10), nullable=False)  # "buyer" or "seller"
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
