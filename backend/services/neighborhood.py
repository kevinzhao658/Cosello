"""Helpers for the neighborhood-as-community system.

The Cosello system user (SYSTEM_USER_ID) owns every auto-created
neighborhood community. The canonical list lives in
backend/constants/neighborhoods.py — this module never hardcodes
neighborhood names.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from constants.neighborhoods import NYC_NEIGHBORHOODS
from models import Community, CommunityMember, User

SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"


def get_neighborhood_community(db: Session, neighborhood_name: str | None) -> Community | None:
    """Return the system-owned Community row for the given neighborhood, or None.

    Filters by `created_by == SYSTEM_USER_ID` so a user-created Community that
    happens to share the same neighborhood name doesn't shadow the canonical one.
    """
    if not neighborhood_name:
        return None
    return (
        db.query(Community)
        .filter(
            Community.neighborhood == neighborhood_name,
            Community.is_public.is_(True),
            Community.created_by == SYSTEM_USER_ID,
        )
        .first()
    )


def set_user_neighborhood(
    db: Session,
    user: User,
    new_neighborhood: str | None,
) -> None:
    """Update user.neighborhood and swap the CommunityMember row transactionally.

    - Validates new_neighborhood is in NYC_NEIGHBORHOODS (or None).
    - Removes the old membership (if any).
    - Updates user.neighborhood.
    - Adds the new membership (if applicable).
    - Idempotent: if old == new, no-op.

    Raises ValueError if new_neighborhood is set but not in the curated list.
    """
    if new_neighborhood and new_neighborhood not in NYC_NEIGHBORHOODS:
        raise ValueError(
            f"Neighborhood '{new_neighborhood}' is not in the curated list. "
            f"Pick from {len(NYC_NEIGHBORHOODS)} canonical neighborhoods."
        )

    old_neighborhood = user.neighborhood
    if old_neighborhood == new_neighborhood:
        return  # no-op

    # 1. Remove old membership if applicable
    if old_neighborhood:
        old_community = get_neighborhood_community(db, old_neighborhood)
        if old_community:
            db.query(CommunityMember).filter(
                CommunityMember.user_id == user.id,
                CommunityMember.community_id == old_community.id,
            ).delete()

    # 2. Update the user's neighborhood string
    user.neighborhood = new_neighborhood

    # 3. Add new membership if applicable AND the user isn't already a member
    #    (defensive against manual rejoin races)
    if new_neighborhood:
        new_community = get_neighborhood_community(db, new_neighborhood)
        if new_community:
            already = (
                db.query(CommunityMember)
                .filter(
                    CommunityMember.user_id == user.id,
                    CommunityMember.community_id == new_community.id,
                )
                .first()
            )
            if not already:
                db.add(
                    CommunityMember(
                        user_id=user.id,
                        community_id=new_community.id,
                        role="member",
                    )
                )

    db.commit()
