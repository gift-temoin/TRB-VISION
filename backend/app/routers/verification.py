from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import client_ip, get_current_user
from ..models import Passcode, User, VerificationAttempt
from ..schemas import VerificationStatusOut, VerifyRequest, VerifyResult
from ..security import verify_code
from ..services.rate_limit import check_rate_limit

router = APIRouter(prefix="/verification", tags=["verification"])


def _remaining(user: User) -> int:
    return max(0, settings.verification_max_attempts - user.failed_verification_attempts)


def _is_locked(user: User) -> bool:
    if user.verification_locked_until is None:
        return False
    return user.verification_locked_until.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc)


@router.get("/status", response_model=VerificationStatusOut)
def verification_status(user: User = Depends(get_current_user)) -> VerificationStatusOut:
    return VerificationStatusOut(
        is_verified=user.is_verified,
        attempts_remaining=_remaining(user),
        locked_until=user.verification_locked_until if _is_locked(user) else None,
    )


@router.post("/verify", response_model=VerifyResult)
def verify(
    payload: VerifyRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> VerifyResult:
    if user.is_verified:
        return VerifyResult(verified=True, message="Account already verified.")

    ip = client_ip(request)
    if not check_rate_limit(f"verify:{user.id}", max_events=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification attempts. Please wait a minute.",
        )

    if _is_locked(user):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Verification is temporarily locked.",
        )

    code = payload.code.strip()
    now = datetime.now(timezone.utc)

    active = db.scalars(select(Passcode).where(Passcode.revoked.is_(False))).all()
    match: Passcode | None = None
    for p in active:
        if p.expires_at is not None and p.expires_at.replace(tzinfo=timezone.utc) < now:
            continue
        if p.uses >= p.max_uses:
            continue
        if verify_code(code, p.code_hash):
            match = p
            break

    if match is None:
        user.failed_verification_attempts += 1
        if user.failed_verification_attempts >= settings.verification_max_attempts:
            user.verification_locked_until = now + timedelta(minutes=settings.verification_lock_minutes)
        db.add(VerificationAttempt(user_id=user.id, success=False, ip=ip))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect or expired verification code.",
        )

    match.uses += 1
    user.is_verified = True
    user.failed_verification_attempts = 0
    user.verification_locked_until = None
    db.add(VerificationAttempt(user_id=user.id, success=True, ip=ip))
    db.commit()

    return VerifyResult(verified=True, message="Account verified successfully.")
