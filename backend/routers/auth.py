import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from models import User, OTPVerification
from auth import generate_otp, send_otp, create_access_token, get_current_user

UPLOADS_DIR = Path(__file__).parent.parent / "uploads"

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------- Request / Response schemas ----------

class SendOTPRequest(BaseModel):
    phone_number: str


class VerifyOTPRequest(BaseModel):
    phone_number: str
    otp_code: str = Field(..., min_length=6, max_length=6)


class RegisterRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    neighborhood: str = Field(..., min_length=1, max_length=100)


class UserOut(BaseModel):
    id: int
    phone_number: str
    display_name: Optional[str] = None
    neighborhood: Optional[str] = None
    profile_picture: Optional[str] = None

    class Config:
        from_attributes = True


# ---------- Endpoints ----------

@router.get("/check-phone")
async def check_phone(phone_number: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone_number == phone_number.strip()).first()
    return {"exists": user is not None}


@router.post("/send-otp")
async def send_otp_endpoint(req: SendOTPRequest, db: Session = Depends(get_db)):
    phone = req.phone_number.strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Phone number is required")

    otp_code = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    record = OTPVerification(
        phone_number=phone,
        otp_code=otp_code,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()

    send_otp(phone, otp_code)

    return {"message": "OTP sent", "phone_number": phone}


@router.post("/verify-otp")
async def verify_otp_endpoint(req: VerifyOTPRequest, db: Session = Depends(get_db)):
    phone = req.phone_number.strip()

    record = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.phone_number == phone,
            OTPVerification.is_verified == 0,
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )

    if not record:
        raise HTTPException(status_code=400, detail="No pending OTP for this number")

    if datetime.utcnow() > record.expires_at:
        record.is_verified = 2
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired — request a new one")

    if record.otp_code != req.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    record.is_verified = 1
    db.commit()

    user = db.query(User).filter(User.phone_number == phone).first()

    if user:
        token = create_access_token(user.id)
        return {
            "access_token": token,
            "user_exists": True,
            "user": UserOut.model_validate(user).model_dump(),
        }
    else:
        new_user = User(phone_number=phone)
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        token = create_access_token(new_user.id)
        return {
            "access_token": token,
            "user_exists": False,
            "user": UserOut.model_validate(new_user).model_dump(),
        }


@router.post("/register", response_model=UserOut)
async def register(
    req: RegisterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current_user.display_name = req.display_name
    current_user.neighborhood = req.neighborhood
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


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
    filename = f"pfp_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOADS_DIR / filename

    contents = await image.read()
    filepath.write_bytes(contents)

    current_user.profile_picture = f"/uploads/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/logout")
async def logout(current_user: User = Depends(get_current_user)):
    return {"message": "Logged out"}
