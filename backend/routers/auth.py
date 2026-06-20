from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import User
from auth import get_current_user
from services import storage
from services.neighborhood import set_user_neighborhood, get_neighborhood_community
from services.circles import set_user_building, add_user_school, set_circle_consent, TooManySchools

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------- Helpers ----------

def _validate_and_set_zip(db: Session, user: "User", zip_code: str) -> None:
    """Validate zip_code against zip_centroids and set it on user.

    Raises HTTP 400 if the ZIP is absent or not seeded. Sets user.zip_code and
    user.zip_confirmed = True on success.

    Uses db.merge() so the write is tracked by `db` regardless of which session
    originally loaded the User object (test overrides inject a fixture-session
    object; production always has the same session, but merge is safe either way).
    """
    from models import ZipCentroid
    z = (zip_code or "").strip()
    if not z or db.get(ZipCentroid, z) is None:
        raise HTTPException(status_code=400, detail="Enter a valid NYC ZIP code")
    merged = db.merge(user)
    merged.zip_code = z
    merged.zip_confirmed = True
    # Propagate back so callers holding the original reference see the update.
    user.zip_code = z
    user.zip_confirmed = True


# ---------- Request / Response schemas ----------

class RegisterRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    neighborhood: str = Field(..., min_length=1, max_length=100)
    pickup_address: Optional[str] = Field(None, max_length=255)
    zip_code: Optional[str] = Field(None, max_length=10)
    pronouns: Optional[str] = Field(None, max_length=40)
    school_seed_ids: list[int] = []


class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=100)
    neighborhood: Optional[str] = Field(None, min_length=1, max_length=100)
    pickup_address: Optional[str] = Field(None, max_length=255)
    zip_code: Optional[str] = Field(None, max_length=10)


class UserOut(BaseModel):
    id: str
    phone_number: str
    display_name: Optional[str] = None
    neighborhood: Optional[str] = None
    profile_picture: Optional[str] = None
    pickup_address: Optional[str] = None
    zip_code: Optional[str] = None
    zip_confirmed: bool = False


def _phone_for_user(db: Session, user_id: str) -> str:
    """Look up phone from auth.users — service_role can read it directly."""
    row = db.execute(
        text("SELECT phone FROM auth.users WHERE id = :uid LIMIT 1"),
        {"uid": user_id},
    ).first()
    return (row[0] or "") if row else ""


def _user_to_out(db: Session, user: User) -> UserOut:
    return UserOut(
        id=user.id,
        phone_number=_phone_for_user(db, user.id),
        display_name=user.display_name,
        neighborhood=user.neighborhood,
        profile_picture=user.profile_picture,
        pickup_address=user.pickup_address,
        zip_code=user.zip_code,
        zip_confirmed=bool(user.zip_confirmed),
    )


# ---------- Endpoints ----------

@router.get("/check-phone")
def check_phone(phone_number: str, db: Session = Depends(get_db)):
    """Check whether a phone is already registered in Supabase Auth."""
    row = db.execute(
        text("SELECT 1 FROM auth.users WHERE phone = :phone LIMIT 1"),
        {"phone": phone_number.strip()},
    ).first()
    return {"exists": row is not None}


@router.post("/register", response_model=UserOut)
def register(
    req: RegisterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """UPSERT public.users for the authenticated Supabase user.

    `current_user` is resolved from the bearer token's `sub` UUID. If the row
    already exists (returning user updating profile), we patch the supplied
    fields; otherwise we insert with the UUID from the token.
    """
    existing = db.query(User).filter(User.id == current_user.id).first()
    if existing is None:
        existing = User(id=current_user.id)
        db.add(existing)

    existing.display_name = req.display_name
    if req.pickup_address is not None:
        existing.pickup_address = req.pickup_address
    if req.zip_code is not None:
        _validate_and_set_zip(db, existing, req.zip_code)
    db.commit()  # flush profile fields first

    # Then handle neighborhood + auto-join membership in one tx
    try:
        set_user_neighborhood(db, existing, req.neighborhood)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    existing.pronouns = req.pronouns
    existing.share_mutual_friends = True  # default-on (see spec section 3)

    # Set neighborhood consent default-on (neighborhood replaces building as
    # the displayed local-trust circle per spec revision 2026-06-19).
    neighborhood_community = get_neighborhood_community(db, req.neighborhood)
    if neighborhood_community is not None:
        set_circle_consent(db, existing.id, neighborhood_community.id, True)

    # Building data is still derived and stored (for future use) but its consent
    # is no longer set — building is not a displayed circle (spec rev 2026-06-19).
    if req.pickup_address:
        set_user_building(db, existing, req.pickup_address)
    for seed_id in (req.school_seed_ids or [])[:2]:
        try:
            school = add_user_school(db, existing, seed_id)
        except (TooManySchools, ValueError):
            continue
        set_circle_consent(db, existing.id, school.id, True)
    db.commit()

    db.refresh(existing)
    return _user_to_out(db, existing)


@router.put("/profile", response_model=UserOut)
def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.display_name is not None:
        current_user.display_name = req.display_name
    if req.pickup_address is not None:
        current_user.pickup_address = req.pickup_address
    if req.zip_code is not None:
        _validate_and_set_zip(db, current_user, req.zip_code)
    db.commit()  # flush non-neighborhood fields first

    if req.neighborhood is not None:
        try:
            set_user_neighborhood(db, current_user, req.neighborhood)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    # Re-fetch rather than refresh so the returned object is bound to this
    # session (current_user may come from a different session in test contexts).
    refreshed = db.query(User).filter(User.id == current_user.id).first()
    return _user_to_out(db, refreshed)


@router.get("/me", response_model=UserOut)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _user_to_out(db, current_user)


@router.put("/profile-picture", response_model=UserOut)
async def upload_profile_picture(
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content_type = image.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = image.filename.rsplit(".", 1)[-1] if image.filename and "." in image.filename else "jpg"
    contents = await image.read()
    url = storage.upload_image("profiles", current_user.id, contents, ext)

    current_user.profile_picture = url
    db.commit()
    db.refresh(current_user)
    return _user_to_out(db, current_user)


@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out"}
