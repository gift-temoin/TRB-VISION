from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user_for_me
from ..models import Conversation, Message, User
from ..schemas import ConversationOut, MessageCreate, MessageOut, UnreadCountOut
from ..services.rate_limit import check_rate_limit

router = APIRouter(prefix="/messages", tags=["messages"])


def get_or_create_conversation(db: Session, user: User) -> Conversation:
    convo = db.scalar(select(Conversation).where(Conversation.user_id == user.id))
    if convo is None:
        convo = Conversation(user_id=user.id)
        db.add(convo)
        db.commit()
        db.refresh(convo)
    return convo


@router.get("/conversation", response_model=ConversationOut)
def my_conversation(
    user: User = Depends(get_current_user_for_me), db: Session = Depends(get_db)
) -> ConversationOut:
    convo = get_or_create_conversation(db, user)
    last = convo.messages[-1] if convo.messages else None
    return ConversationOut(
        id=convo.id,
        user_id=user.id,
        user_name=user.full_name,
        last_message=last.body if last else None,
        last_at=last.created_at if last else None,
        unread_for_user=convo.unread_for_user,
        unread_for_admin=convo.unread_for_admin,
    )


@router.get("", response_model=list[MessageOut])
def my_messages(
    user: User = Depends(get_current_user_for_me), db: Session = Depends(get_db)
) -> list[MessageOut]:
    convo = get_or_create_conversation(db, user)
    msgs = db.scalars(
        select(Message).where(Message.conversation_id == convo.id).order_by(Message.id)
    ).all()
    return [MessageOut.model_validate(m) for m in msgs]


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def send_message(
    payload: MessageCreate,
    user: User = Depends(get_current_user_for_me),
    db: Session = Depends(get_db),
) -> MessageOut:
    if not check_rate_limit(
        f"msg:{user.id}", max_events=settings.message_rate_limit_per_minute, window_seconds=60
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You are sending messages too quickly. Please slow down.",
        )

    convo = get_or_create_conversation(db, user)
    msg = Message(conversation_id=convo.id, sender="user", body=payload.body, status="sent")
    convo.unread_for_admin += 1
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return MessageOut.model_validate(msg)


@router.post("/read")
def mark_read(
    user: User = Depends(get_current_user_for_me), db: Session = Depends(get_db)
) -> dict:
    convo = get_or_create_conversation(db, user)
    now = datetime.now(timezone.utc)
    for m in convo.messages:
        if m.sender == "admin" and m.read_at is None:
            m.read_at = now
            m.status = "read"
    convo.unread_for_user = 0
    db.commit()
    return {"ok": True}


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(
    user: User = Depends(get_current_user_for_me), db: Session = Depends(get_db)
) -> UnreadCountOut:
    convo = get_or_create_conversation(db, user)
    admin_unread = db.scalar(
        select(func.coalesce(func.sum(Conversation.unread_for_admin), 0))
    )
    return UnreadCountOut(user=convo.unread_for_user, admin=int(admin_unread or 0))
