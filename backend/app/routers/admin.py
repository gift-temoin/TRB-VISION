from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import require_admin
from ..models import Conversation, Message, Passcode, User, VerificationAttempt
from ..schemas import (
    AdminStatsOut,
    ConversationOut,
    MessageCreate,
    MessageOut,
    ModelHealthOut,
    PasscodeCreate,
    PasscodeOut,
    UserOut,
    UserStatusUpdate,
    VerificationHistoryOut,
)
from ..security import hash_code
from ..services.market_data import market_data
from ..services.prediction import MODEL_NAME, MODEL_STATUS, metrics

router = APIRouter(prefix="/admin", tags=["admin"])


def _passcode_active(p: Passcode) -> bool:
    if p.revoked or p.uses >= p.max_uses:
        return False
    if p.expires_at is not None and p.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return False
    return True


def _passcode_out(p: Passcode) -> PasscodeOut:
    return PasscodeOut(
        id=p.id,
        label=p.label,
        created_at=p.created_at,
        expires_at=p.expires_at,
        revoked=p.revoked,
        max_uses=p.max_uses,
        uses=p.uses,
        active=_passcode_active(p),
    )


@router.get("/stats", response_model=AdminStatsOut)
def stats(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> AdminStatsOut:
    total = db.scalar(select(func.count(User.id))) or 0
    verified = db.scalar(select(func.count(User.id)).where(User.is_verified.is_(True))) or 0
    active = db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    total_messages = db.scalar(select(func.count(Message.id))) or 0
    unread = db.scalar(select(func.coalesce(func.sum(Conversation.unread_for_admin), 0))) or 0

    # Compute online users (last_seen within last 5 minutes), handling naive/aware datetimes.
    now = datetime.now(timezone.utc)
    online_cut = now - timedelta(minutes=5)
    online_rows = db.execute(select(User.last_seen).where(User.last_seen.isnot(None))).all()
    online_count = 0
    for (ls,) in online_rows:
        if ls is None:
            continue
        if ls.tzinfo is None:
            ls_aware = ls.replace(tzinfo=timezone.utc)
        else:
            ls_aware = ls
        if ls_aware >= online_cut:
            online_count += 1

    return AdminStatsOut(
        total_users=int(total),
        verified_users=int(verified),
        pending_users=int(total - verified),
        active_users=int(active),
        online_users=online_count,
        total_messages=int(total_messages),
        unread_messages=int(unread),
        provider_configured=market_data.configured,
        model_status=MODEL_STATUS if market_data.configured else "OFFLINE",
        model_name=MODEL_NAME,
        provider_name=market_data.provider_name,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.scalars(select(User).order_by(User.created_at.desc())).all()
    return [UserOut.model_validate(u) for u in users]


@router.patch("/users/{user_id}/status", response_model=UserOut)
def set_user_status(
    user_id: int,
    payload: UserStatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own status.")
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/approve", response_model=UserOut)
def approve_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.is_verified = True
    user.is_active = True
    user.failed_verification_attempts = 0
    user.verification_locked_until = None
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}/verification", response_model=UserOut)
def reset_verification(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user.is_verified = False
    user.failed_verification_attempts = 0
    user.verification_locked_until = None
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/passcodes", response_model=list[PasscodeOut])
def list_passcodes(
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[PasscodeOut]:
    codes = db.scalars(select(Passcode).order_by(Passcode.created_at.desc())).all()
    return [_passcode_out(p) for p in codes]


@router.post("/passcodes", response_model=PasscodeOut, status_code=status.HTTP_201_CREATED)
def create_passcode(
    payload: PasscodeCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PasscodeOut:
    expires_at = None
    if payload.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)
    code = Passcode(
        label=payload.label,
        code_hash=hash_code(payload.code),
        max_uses=payload.max_uses,
        expires_at=expires_at,
        created_by_id=admin.id,
    )
    db.add(code)
    db.commit()
    db.refresh(code)
    return _passcode_out(code)


@router.post("/passcodes/{passcode_id}/revoke", response_model=PasscodeOut)
def revoke_passcode(
    passcode_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PasscodeOut:
    code = db.get(Passcode, passcode_id)
    if code is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passcode not found.")
    code.revoked = True
    db.commit()
    db.refresh(code)
    return _passcode_out(code)


@router.get("/conversations", response_model=list[ConversationOut])
def conversations(
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[ConversationOut]:
    convos = db.scalars(select(Conversation).order_by(Conversation.id.desc())).all()
    out: list[ConversationOut] = []
    for c in convos:
        if c.user is None or c.user.is_admin:
            continue
        last = c.messages[-1] if c.messages else None
        out.append(
            ConversationOut(
                id=c.id,
                user_id=c.user_id,
                user_name=c.user.full_name if c.user else None,
                last_message=last.body if last else None,
                last_at=last.created_at if last else None,
                unread_for_user=c.unread_for_user,
                unread_for_admin=c.unread_for_admin,
                is_verified=c.user.is_verified if c.user else False,
                is_active=c.user.is_active if c.user else True,
            )
        )
    out.sort(key=lambda c: c.last_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return out


def _conversation_for(db: Session, user_id: int) -> Conversation:
    convo = db.scalar(select(Conversation).where(Conversation.user_id == user_id))
    if convo is None:
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        convo = Conversation(user_id=user_id)
        db.add(convo)
        db.commit()
        db.refresh(convo)
    return convo


@router.get("/conversations/{user_id}/messages", response_model=list[MessageOut])
def conversation_messages(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[MessageOut]:
    convo = _conversation_for(db, user_id)
    msgs = db.scalars(
        select(Message).where(Message.conversation_id == convo.id).order_by(Message.id)
    ).all()
    return [MessageOut.model_validate(m) for m in msgs]


@router.post("/conversations/{user_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def admin_reply(
    user_id: int,
    payload: MessageCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> MessageOut:
    convo = _conversation_for(db, user_id)
    msg = Message(conversation_id=convo.id, sender="admin", body=payload.body, status="delivered")
    convo.unread_for_user += 1
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return MessageOut.model_validate(msg)


@router.post("/conversations/{user_id}/read")
def admin_mark_read(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    convo = _conversation_for(db, user_id)
    now = datetime.now(timezone.utc)
    for m in convo.messages:
        if m.sender == "user" and m.read_at is None:
            m.read_at = now
            m.status = "read"
    convo.unread_for_admin = 0
    db.commit()
    return {"ok": True}


@router.get("/verification-history", response_model=list[VerificationHistoryOut])
def verification_history(
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[VerificationHistoryOut]:
    attempts = db.scalars(
        select(VerificationAttempt).order_by(VerificationAttempt.created_at.desc()).limit(200)
    ).all()
    out: list[VerificationHistoryOut] = []
    for a in attempts:
        out.append(
            VerificationHistoryOut(
                id=a.id,
                user_id=a.user_id,
                user_name=a.user.full_name if a.user else f"User #{a.user_id}",
                success=a.success,
                created_at=a.created_at,
                ip=a.ip,
            )
        )
    return out


@router.get("/model-health", response_model=ModelHealthOut)
def model_health(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> ModelHealthOut:
    from ..models import PredictionRecord

    count = db.scalar(select(func.count(PredictionRecord.id))) or 0
    return ModelHealthOut(
        provider_configured=market_data.configured,
        provider_name=market_data.provider_name,
        model_name=MODEL_NAME,
        model_status=MODEL_STATUS if market_data.configured else "OFFLINE",
        last_success=metrics.last_success,
        recent_errors=metrics.recent_errors,
        prediction_count=int(count),
    )
