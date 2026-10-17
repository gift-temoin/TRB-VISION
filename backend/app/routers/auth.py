from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..countries import country_list
from ..database import get_db
from ..deps import get_current_user, get_current_user_for_me
from ..models import PasswordResetCode, User
from ..schemas import (
    CountryOut,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
)
from ..security import create_access_token, hash_code, hash_password, verify_code, verify_password
from ..services.rate_limit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/countries", response_model=list[CountryOut])
def get_countries() -> list[CountryOut]:
    return [CountryOut(**c) for c in country_list()]


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    existing = db.scalar(select(User).where(func.lower(User.email) == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    user = User(
        full_name=payload.full_name,
        email=email,
        country=payload.country.value,
        phone=payload.phone.strip() if payload.phone else None,
        password_hash=hash_password(payload.password),
        is_admin=False,
        is_verified=False,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email = payload.email.lower().strip()
    key = f"login:{email}"
    if not check_rate_limit(key, max_events=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait a minute.",
        )

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password."
        )

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user_for_me)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: User = Depends(get_current_user)) -> None:
    # Stateless JWT: the client discards the token. Kept for API completeness.
    return None


@router.post("/password-reset/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    key = f"reset:{email}"
    if not check_rate_limit(key, max_events=5, window_seconds=300):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many reset requests. Please wait a few minutes.",
        )

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    generic = {"message": "If that email is registered, a reset code has been sent."}
    if user is None:
        return generic

    code = f"{__import__('secrets').randrange(0, 1000000):06d}"
    db.add(
        PasswordResetCode(
            user_id=user.id,
            code_hash=hash_code(code),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
    )
    db.commit()

    # In production the code would be emailed/SMS'd. In demo mode it is returned
    # so local development does not require an email provider.
    if settings.demo_mode:
        generic["dev_code"] = code
    return generic


@router.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset request.")

    codes = db.scalars(
        select(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id, PasswordResetCode.used.is_(False))
        .order_by(PasswordResetCode.id.desc())
    ).all()

    match = None
    for c in codes:
        if c.expires_at and c.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            continue
        if verify_code(payload.code, c.code_hash):
            match = c
            break

    if match is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    match.used = True
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully."}
