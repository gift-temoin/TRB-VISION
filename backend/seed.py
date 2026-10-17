"""Create the initial administrator account and a demo verification passcode.

Usage (from the backend directory):
    python seed.py

Reads ADMIN_* values from the environment / .env file.
"""
from sqlalchemy import func, select

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import Passcode, User
from app.security import hash_code, hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        email = settings.admin_email.lower()
        admin = db.scalar(select(User).where(func.lower(User.email) == email))
        if admin is None:
            admin = User(
                full_name=settings.admin_full_name,
                email=email,
                country=settings.admin_country.upper(),
                password_hash=hash_password(settings.admin_password),
                is_admin=True,
                is_verified=True,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            print(f"Created admin account: {email}")
        else:
            print(f"Admin account already exists: {email}")

        demo_code = "TRB-DEMO-2026"
        existing = db.scalar(select(Passcode).where(Passcode.label == "Demo passcode"))
        if existing is None:
            db.add(
                Passcode(
                    label="Demo passcode",
                    code_hash=hash_code(demo_code),
                    max_uses=1000,
                    created_by_id=admin.id,
                )
            )
            db.commit()
            print(f"Created demo verification passcode: {demo_code}")
        else:
            print("Demo passcode already exists.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
