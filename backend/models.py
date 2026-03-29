import json

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), unique=True, index=True, nullable=False)
    display_name = Column(String(100), nullable=True)
    neighborhood = Column(String(100), nullable=True)
    profile_picture = Column(String(255), nullable=True)
    pickup_address = Column(String(255), nullable=True)
    zip_code = Column(String(10), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OTPVerification(Base):
    __tablename__ = "otp_verifications"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(20), index=True, nullable=False)
    otp_code = Column(String(6), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    is_verified = Column(Integer, default=0)  # 0=pending, 1=verified, 2=expired


class Community(Base):
    __tablename__ = "communities"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    neighborhood = Column(String(100), nullable=True)
    image = Column(String(255), nullable=True)
    is_public = Column(Boolean, default=True)
    invite_code = Column(String(20), unique=True, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CommunityMember(Base):
    __tablename__ = "community_members"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(20), default="member")
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_community_user"),
    )


class JoinRequest(Base):
    __tablename__ = "join_requests"

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_join_request"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(50), nullable=False)  # join_request, request_accepted
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=True)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    listing_id = Column(String(20), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    listing_id = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "listing_id", name="uq_wishlist_item"),
    )


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="accepted")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "friend_id", name="uq_friendship"),
    )


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(String(20), nullable=False, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="pending")
    selected_pickup_slots = Column(String(2000), nullable=True)
    confirmed_time = Column(String(20), nullable=True)
    buyer_reviewed = Column(Boolean, default=False)
    seller_reviewed = Column(Boolean, default=False)
    pickup_address = Column(String(255), nullable=True)
    address_released = Column(Integer, default=0)
    pickup_notified = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Listing(Base):
    __tablename__ = "listings"

    id = Column(String(20), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(2000), nullable=True)
    price = Column(String(20), nullable=False)
    condition = Column(String(20), nullable=True)
    location = Column(String(100), nullable=True)
    tags = Column(String(1000), nullable=True)  # JSON array
    communities = Column(String(1000), nullable=True)  # JSON array of int|"neighborhood"
    visibility = Column(String(20), default="public")
    image_url = Column(String(500), nullable=True)
    image_urls = Column(String(2000), nullable=True)  # JSON array
    pickup_location = Column(String(255), nullable=True)
    status = Column(String(20), default="open")
    posted_at = Column(Float, nullable=False)

    def to_dict(self) -> dict:
        """Serialize to the dict format the API currently returns."""
        return {
            "id": self.id,
            "userId": self.user_id,
            "title": self.title,
            "description": self.description or "",
            "price": self.price,
            "condition": self.condition or "Good",
            "location": self.location or "",
            "tags": json.loads(self.tags) if self.tags else [],
            "communities": json.loads(self.communities) if self.communities else [],
            "visibility": self.visibility or "public",
            "imageUrl": self.image_url or "",
            "imageUrls": json.loads(self.image_urls) if self.image_urls else [],
            "pickup_location": self.pickup_location or "",
            "status": self.status or "open",
            "postedAt": self.posted_at,
        }


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reviewee_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reviewer_role = Column(String(10), nullable=False)  # "buyer" or "seller"
    rating = Column(Integer, nullable=False)  # 1-5
    comment = Column(String(1000), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
