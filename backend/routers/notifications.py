from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from database import get_db
from models import Notification, User, JoinRequest, Community, CommunityMember
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(10)
        .all()
    )

    # Delete notifications beyond the 10 most recent
    if notifications:
        oldest_kept_id = notifications[-1].id
        db.query(Notification).filter(
            Notification.user_id == current_user.id,
            Notification.id < oldest_kept_id,
        ).delete(synchronize_session=False)
        db.commit()
    result = []
    for n in notifications:
        entry: dict = {
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "is_read": n.is_read,
            "community_id": n.community_id,
            "related_user_id": n.related_user_id,
            "listing_id": n.listing_id,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        if n.related_user_id:
            related_user = db.query(User).filter(User.id == n.related_user_id).first()
            if related_user:
                entry["related_user_name"] = related_user.display_name
                entry["related_user_picture"] = related_user.profile_picture
        if n.type == "join_request" and n.community_id and n.related_user_id:
            jr = db.query(JoinRequest).filter(
                JoinRequest.community_id == n.community_id,
                JoinRequest.user_id == n.related_user_id,
            ).first()
            entry["join_request_status"] = jr.status if jr else None
        result.append(entry)
    return result


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = (
        db.query(sa_func.count(Notification.id))
        .filter(Notification.user_id == current_user.id, Notification.is_read == False)
        .scalar()
    )
    return {"count": count}


@router.post("/mark-read")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"marked": True}


@router.post("/{notification_id}/read")
async def mark_one_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"read": True}


@router.post("/{notification_id}/accept")
async def accept_from_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.type == "join_request",
    ).first()
    if not n or not n.community_id or not n.related_user_id:
        raise HTTPException(status_code=404, detail="Notification not found")

    community = db.query(Community).filter(Community.id == n.community_id).first()
    if not community or community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can accept requests")

    jr = db.query(JoinRequest).filter(
        JoinRequest.community_id == n.community_id,
        JoinRequest.user_id == n.related_user_id,
        JoinRequest.status == "pending",
    ).first()
    if not jr:
        raise HTTPException(status_code=404, detail="Join request not found or already handled")

    jr.status = "accepted"
    db.add(CommunityMember(community_id=n.community_id, user_id=n.related_user_id, role="member"))
    db.add(Notification(
        user_id=n.related_user_id,
        type="request_accepted",
        title="Request Accepted",
        message=f"You've been accepted into {community.name}",
        community_id=n.community_id,
    ))
    db.commit()
    return {"accepted": True}


@router.post("/{notification_id}/reject")
async def reject_from_notification(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.type == "join_request",
    ).first()
    if not n or not n.community_id or not n.related_user_id:
        raise HTTPException(status_code=404, detail="Notification not found")

    community = db.query(Community).filter(Community.id == n.community_id).first()
    if not community or community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can reject requests")

    jr = db.query(JoinRequest).filter(
        JoinRequest.community_id == n.community_id,
        JoinRequest.user_id == n.related_user_id,
        JoinRequest.status == "pending",
    ).first()
    if not jr:
        raise HTTPException(status_code=404, detail="Join request not found or already handled")

    jr.status = "rejected"
    db.commit()
    return {"rejected": True}
