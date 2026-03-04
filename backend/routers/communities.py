import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from database import get_db
from models import Community, CommunityMember, User, Notification
from models import JoinRequest as JoinRequestModel
from auth import get_current_user

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"

router = APIRouter(prefix="/api/communities", tags=["communities"])


# ---------- Response schemas ----------

class CommunityOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    neighborhood: Optional[str] = None
    image: Optional[str] = None
    is_public: bool
    invite_code: str
    created_by: int
    member_count: int = 0
    role: Optional[str] = None

    class Config:
        from_attributes = True


class JoinByCodeRequest(BaseModel):
    invite_code: str


class UserSearchOut(BaseModel):
    id: int
    display_name: Optional[str] = None
    neighborhood: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


class InviteRequest(BaseModel):
    community_id: int
    user_ids: list[int]


class UpdateCommunityRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    neighborhood: Optional[str] = None
    is_public: Optional[bool] = None


class JoinRequestBody(BaseModel):
    community_id: int


# ---------- Helpers ----------

def _generate_invite_code() -> str:
    return uuid.uuid4().hex[:8].upper()


def _community_to_out(community: Community, db: Session, user_id: int) -> dict:
    member_count = (
        db.query(sa_func.count(CommunityMember.id))
        .filter(CommunityMember.community_id == community.id)
        .scalar()
    )
    membership = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == community.id, CommunityMember.user_id == user_id)
        .first()
    )
    return {
        "id": community.id,
        "name": community.name,
        "description": community.description,
        "neighborhood": community.neighborhood,
        "image": community.image,
        "is_public": community.is_public,
        "invite_code": community.invite_code,
        "created_by": community.created_by,
        "member_count": member_count,
        "role": membership.role if membership else None,
    }


# ---------- Endpoints ----------


@router.get("/search")
async def search_communities(
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not q or len(q.strip()) < 1:
        return []
    query = q.strip().lower()

    # Find communities matching the search (both public and private)
    communities = (
        db.query(Community)
        .filter(Community.name.ilike(f"%{query}%"))
        .limit(10)
        .all()
    )

    # Check which ones the user is already a member of
    my_membership_ids = {
        m.community_id
        for m in db.query(CommunityMember)
        .filter(CommunityMember.user_id == current_user.id)
        .all()
    }

    # Check which ones the user has pending join requests for
    my_pending_request_ids = {
        r.community_id
        for r in db.query(JoinRequestModel)
        .filter(
            JoinRequestModel.user_id == current_user.id,
            JoinRequestModel.status == "pending",
        )
        .all()
    }

    results = []
    for c in communities:
        member_count = (
            db.query(sa_func.count(CommunityMember.id))
            .filter(CommunityMember.community_id == c.id)
            .scalar()
        )
        results.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "neighborhood": c.neighborhood,
            "image": c.image,
            "invite_code": c.invite_code,
            "member_count": member_count,
            "is_member": c.id in my_membership_ids,
            "is_public": c.is_public,
            "has_requested": c.id in my_pending_request_ids,
        })
    return results


@router.post("", response_model=CommunityOut)
async def create_community(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    neighborhood: Optional[str] = Form(None),
    is_public: bool = Form(True),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Save image if provided
    image_path = None
    if image and image.filename:
        content_type = image.content_type or ""
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image")
        ext = image.filename.rsplit(".", 1)[-1] if "." in image.filename else "jpg"
        filename = f"community_{uuid.uuid4().hex[:8]}.{ext}"
        filepath = UPLOADS_DIR / filename
        contents = await image.read()
        filepath.write_bytes(contents)
        image_path = f"/uploads/{filename}"

    community = Community(
        name=name,
        description=description,
        neighborhood=neighborhood,
        image=image_path,
        is_public=is_public,
        invite_code=_generate_invite_code(),
        created_by=current_user.id,
    )
    db.add(community)
    db.commit()
    db.refresh(community)

    # Add creator as owner
    membership = CommunityMember(
        community_id=community.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(membership)
    db.commit()

    return _community_to_out(community, db, current_user.id)


@router.get("/mine-with-neighborhood")
async def my_communities_with_neighborhood(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Virtual "My Neighborhood" community
    result = []
    if current_user.neighborhood:
        result.append({
            "id": "neighborhood",
            "name": "My Neighborhood",
            "neighborhood": current_user.neighborhood,
        })

    # Real communities
    memberships = (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == current_user.id)
        .all()
    )
    for m in memberships:
        community = db.query(Community).filter(Community.id == m.community_id).first()
        if community:
            result.append({
                "id": community.id,
                "name": community.name,
                "neighborhood": community.neighborhood,
                "is_public": community.is_public,
            })
    return result


@router.get("/mine", response_model=list[CommunityOut])
async def my_communities(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    memberships = (
        db.query(CommunityMember)
        .filter(CommunityMember.user_id == current_user.id)
        .all()
    )
    result = []
    for m in memberships:
        community = db.query(Community).filter(Community.id == m.community_id).first()
        if community:
            result.append(_community_to_out(community, db, current_user.id))
    return result


@router.post("/join", response_model=CommunityOut)
async def join_community(
    req: JoinByCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = (
        db.query(Community)
        .filter(Community.invite_code == req.invite_code.strip().upper())
        .first()
    )
    if not community:
        raise HTTPException(status_code=404, detail="Community not found with that invite code")

    existing = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community.id,
            CommunityMember.user_id == current_user.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="You are already a member of this community")

    membership = CommunityMember(
        community_id=community.id,
        user_id=current_user.id,
        role="member",
    )
    db.add(membership)
    db.commit()

    return _community_to_out(community, db, current_user.id)


@router.post("/request-join")
async def request_join_community(
    req: JoinRequestBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == req.community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.is_public:
        raise HTTPException(status_code=400, detail="Public communities can be joined directly")

    existing_member = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == community.id, CommunityMember.user_id == current_user.id)
        .first()
    )
    if existing_member:
        raise HTTPException(status_code=400, detail="You are already a member")

    existing_request = (
        db.query(JoinRequestModel)
        .filter(
            JoinRequestModel.community_id == community.id,
            JoinRequestModel.user_id == current_user.id,
            JoinRequestModel.status == "pending",
        )
        .first()
    )
    if existing_request:
        raise HTTPException(status_code=400, detail="You already have a pending request")

    join_request = JoinRequestModel(
        community_id=community.id,
        user_id=current_user.id,
        status="pending",
    )
    db.add(join_request)

    # Notify the community owner
    requester_name = current_user.display_name or "Someone"
    db.add(Notification(
        user_id=community.created_by,
        type="join_request",
        title="Join Request",
        message=f"{requester_name} wants to join {community.name}",
        community_id=community.id,
    ))
    db.commit()
    return {"requested": True}


@router.get("/{community_id}/requests")
async def get_join_requests(
    community_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can view join requests")

    requests = (
        db.query(JoinRequestModel)
        .filter(JoinRequestModel.community_id == community_id, JoinRequestModel.status == "pending")
        .all()
    )
    result = []
    for r in requests:
        user = db.query(User).filter(User.id == r.user_id).first()
        if user:
            result.append({
                "id": r.id,
                "user_id": user.id,
                "display_name": user.display_name,
                "neighborhood": user.neighborhood,
                "profile_picture": user.profile_picture,
                "created_at": r.created_at,
            })
    return result


@router.post("/{community_id}/requests/{request_id}/accept")
async def accept_join_request(
    community_id: int,
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can accept requests")

    join_request = (
        db.query(JoinRequestModel)
        .filter(JoinRequestModel.id == request_id, JoinRequestModel.community_id == community_id)
        .first()
    )
    if not join_request:
        raise HTTPException(status_code=404, detail="Request not found")

    join_request.status = "accepted"
    db.add(CommunityMember(community_id=community_id, user_id=join_request.user_id, role="member"))

    # Notify the requester that they were accepted
    db.add(Notification(
        user_id=join_request.user_id,
        type="request_accepted",
        title="Request Accepted",
        message=f"You've been accepted into {community.name}",
        community_id=community_id,
    ))
    db.commit()
    return {"accepted": True}


@router.post("/{community_id}/requests/{request_id}/reject")
async def reject_join_request(
    community_id: int,
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can reject requests")

    join_request = (
        db.query(JoinRequestModel)
        .filter(JoinRequestModel.id == request_id, JoinRequestModel.community_id == community_id)
        .first()
    )
    if not join_request:
        raise HTTPException(status_code=404, detail="Request not found")

    db.delete(join_request)
    db.commit()
    return {"rejected": True}


@router.get("/users/search", response_model=list[UserSearchOut])
async def search_users(
    q: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not q or len(q.strip()) < 1:
        return []
    query = q.strip().lower()
    users = (
        db.query(User)
        .filter(
            User.display_name.isnot(None),
            User.display_name != "",
            User.id != current_user.id,
            User.display_name.ilike(f"%{query}%"),
        )
        .limit(10)
        .all()
    )
    return users


@router.post("/invite")
async def invite_users(
    req: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == req.community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    added = 0
    for uid in req.user_ids:
        existing = (
            db.query(CommunityMember)
            .filter(CommunityMember.community_id == community.id, CommunityMember.user_id == uid)
            .first()
        )
        if not existing:
            db.add(CommunityMember(community_id=community.id, user_id=uid, role="member"))
            added += 1
    db.commit()
    return {"added": added}


@router.get("/{community_id}", response_model=CommunityOut)
async def get_community(
    community_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    return _community_to_out(community, db, current_user.id)


@router.get("/{community_id}/members")
async def get_community_members(
    community_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    memberships = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == community_id)
        .all()
    )
    members = []
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            members.append({
                "id": u.id,
                "display_name": u.display_name,
                "neighborhood": u.neighborhood,
                "profile_picture": u.profile_picture,
                "role": m.role,
            })
    return members


@router.put("/{community_id}", response_model=CommunityOut)
async def update_community(
    community_id: int,
    req: UpdateCommunityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can edit this community")

    if req.name is not None:
        community.name = req.name
    if req.description is not None:
        community.description = req.description
    if req.neighborhood is not None:
        community.neighborhood = req.neighborhood
    if req.is_public is not None:
        community.is_public = req.is_public

    db.commit()
    db.refresh(community)
    return _community_to_out(community, db, current_user.id)


@router.delete("/{community_id}")
async def delete_community(
    community_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can delete this community")

    # Delete all memberships first
    db.query(CommunityMember).filter(CommunityMember.community_id == community_id).delete()
    db.delete(community)
    db.commit()
    return {"deleted": True}


@router.delete("/{community_id}/members/{user_id}")
async def kick_member(
    community_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    if community.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator can remove members")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot kick yourself")

    membership = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == community_id, CommunityMember.user_id == user_id)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="User is not a member")

    db.delete(membership)
    db.commit()
    return {"kicked": True}


@router.delete("/{community_id}/leave")
async def leave_community(
    community_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(CommunityMember)
        .filter(
            CommunityMember.community_id == community_id,
            CommunityMember.user_id == current_user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Not a member of this community")

    db.delete(membership)
    db.commit()
    return {"left": True}
