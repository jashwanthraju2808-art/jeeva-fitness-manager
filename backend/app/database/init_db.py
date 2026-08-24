import os
from app.database.connection import engine, SessionLocal
from app.database.base import Base

# Import all models so they register with Base.metadata before create_all
from app.models.batch import Batch              # noqa: F401
from app.models.member import Member            # noqa: F401
from app.models.payment import Payment          # noqa: F401
from app.models.attendance import Attendance    # noqa: F401
from app.models.user import User                        # noqa: F401
from app.models.audit_log import AuditLog              # noqa: F401
from app.models.fee_notification import FeeNotification # noqa: F401

BATCHES = [
    {"name": "5:30 AM – 6:30 AM", "start_time": "05:30", "end_time": "06:30"},
    {"name": "6:30 AM – 7:30 AM", "start_time": "06:30", "end_time": "07:30"},
    {"name": "8:00 AM – 9:00 AM", "start_time": "08:00", "end_time": "09:00"},
    {"name": "8:30 AM – 9:30 AM", "start_time": "08:30", "end_time": "09:30"},
    {"name": "5:00 PM – 6:00 PM", "start_time": "17:00", "end_time": "18:00"},
    {"name": "6:00 PM – 7:00 PM", "start_time": "18:00", "end_time": "19:00"},
    {"name": "7:00 PM – 8:00 PM", "start_time": "19:00", "end_time": "20:00"},
]

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Tables ready.")

db = SessionLocal()
try:
    # Seed batches if table is empty
    if db.query(Batch).count() == 0:
        for b in BATCHES:
            db.add(Batch(**b))
        db.commit()
        print(f"Seeded {len(BATCHES)} batches.")
    else:
        # Ensure any batches added after initial seed are present (idempotent upsert by name)
        for b in BATCHES:
            if not db.query(Batch).filter(Batch.name == b["name"]).first():
                db.add(Batch(**b))
                print(f"Added missing batch: {b['name']}")
        db.commit()

    # Seed default admin user
    if db.query(User).count() == 0:
        from app.core.auth import hash_password
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        admin_password = os.getenv("ADMIN_PASSWORD", "antar@2026")
        db.add(User(
            username=admin_username,
            hashed_password=hash_password(admin_password),
            is_active=True,
        ))
        db.commit()
        print(f"Created admin user: '{admin_username}' / '{admin_password}'")
    else:
        print("Admin user already exists.")
finally:
    db.close()
