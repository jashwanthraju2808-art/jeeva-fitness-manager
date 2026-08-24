from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user
from app.database.dependencies import get_db
from app.models.member import Member
from app.models.payment import Payment
from app.models.user import User
from app.schemas.member import MemberCreate, MemberUpdate, MemberResponse
from app.services.audit_service import log_action

router = APIRouter(prefix="/members", tags=["Members"])


def _calculate_age(dob: date) -> int:
    today = date.today()
    return today.year - dob.year - (
        1 if (today.month, today.day) < (dob.month, dob.day) else 0
    )


def _base_q(db: Session):
    """Active members with batch eager-loaded."""
    return (
        db.query(Member)
        .options(joinedload(Member.batch))
        .filter(Member.is_active == True)  # noqa: E712
    )


def _all_q(db: Session):
    """All members (any status) with batch eager-loaded."""
    return db.query(Member).options(joinedload(Member.batch))


# ── List active ────────────────────────────────────────────

@router.get("/", response_model=List[MemberResponse])
def get_members(
    batch_id:    Optional[int] = Query(default=None),
    trainer:     Optional[str] = Query(default=None),
    status:      Optional[str] = Query(default=None),  # active|frozen|expiring_soon|expired
    db: Session = Depends(get_db),
):
    q = _base_q(db)
    if batch_id:
        q = q.filter(Member.batch_id == batch_id)
    if trainer:
        q = q.filter(Member.trainer.ilike(f"%{trainer}%"))
    members = q.order_by(Member.first_name).all()

    # frontend-side status filter (computed, not stored)
    if status and status != "all":
        today = date.today()
        threshold = today + timedelta(days=7)
        def _ms(m):
            if m.freeze_start_date and m.freeze_end_date:
                if m.freeze_start_date <= today <= m.freeze_end_date:
                    return "frozen"
            if m.membership_expiry_date:
                if m.membership_expiry_date < today:
                    return "expired"
                if m.membership_expiry_date <= threshold:
                    return "expiring_soon"
            return "active"
        members = [m for m in members if _ms(m) == status]
    return members


# ── Expiring soon (within N days) ─────────────────────────

@router.get("/expiring", response_model=List[MemberResponse])
def get_expiring_members(
    days: int = Query(default=7, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """Active members whose membership expires within `days` days."""
    today     = date.today()
    threshold = today + timedelta(days=days)
    return (
        _base_q(db)
        .filter(
            Member.membership_expiry_date != None,        # noqa: E711
            Member.membership_expiry_date >= today,
            Member.membership_expiry_date <= threshold,
        )
        .order_by(Member.membership_expiry_date)
        .all()
    )


# ── Expired ────────────────────────────────────────────────

@router.get("/expired", response_model=List[MemberResponse])
def get_expired_members(db: Session = Depends(get_db)):
    """Active members whose membership expiry date has passed."""
    today = date.today()
    return (
        _base_q(db)
        .filter(
            Member.membership_expiry_date != None,        # noqa: E711
            Member.membership_expiry_date < today,
        )
        .order_by(Member.membership_expiry_date)
        .all()
    )


# ── List inactive / discontinued ──────────────────────────

@router.get("/inactive", response_model=List[MemberResponse])
def get_inactive_members(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return all discontinued (is_active=False) members."""
    return (
        _all_q(db)
        .filter(Member.is_active == False)  # noqa: E712
        .order_by(Member.first_name)
        .all()
    )


# ── Search ─────────────────────────────────────────────────

@router.get("/search", response_model=List[MemberResponse])
def search_members(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    return (
        _base_q(db)
        .filter(
            Member.first_name.ilike(f"%{q}%")
            | Member.last_name.ilike(f"%{q}%")
            | Member.phone_number.ilike(f"%{q}%")
        )
        .all()
    )


@router.get("/{member_id}", response_model=MemberResponse)
def get_member(member_id: int, db: Session = Depends(get_db)):
    # Allow fetching any member (active or not) for display purposes
    member = _all_q(db).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


# ── Create ─────────────────────────────────────────────────

@router.post("/", response_model=MemberResponse, status_code=201)
def add_member(
    payload: MemberCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if db.query(Member).filter(Member.phone_number == payload.phone_number).first():
        raise HTTPException(status_code=400, detail="Phone number already exists")

    data = payload.model_dump()
    if data.get("date_of_birth"):
        data["age"] = _calculate_age(data["date_of_birth"])

    new_member = Member(**data)
    db.add(new_member)
    db.flush()

    log_action(
        db,
        username=current_user.username,
        action="CREATE",
        module="Members",
        description=(
            f"Member '{new_member.first_name} {new_member.last_name or ''}' "
            f"(phone: {new_member.phone_number}) created by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(new_member)

    # ── Auto first-month payment (status = paid) ───────────
    if new_member.fee and new_member.fee > 0:
        current_month = date.today().strftime("%Y-%m")
        duplicate = db.query(Payment).filter(
            Payment.member_id == new_member.id,
            Payment.month     == current_month,
        ).first()
        if not duplicate:
            auto_pay = Payment(
                member_id    = new_member.id,
                amount       = new_member.fee,
                month        = current_month,
                payment_date = date.today(),
                note         = "Auto-recorded on member registration",
                status       = "paid",          # ← explicitly paid
            )
            db.add(auto_pay)
            log_action(
                db,
                username=current_user.username,
                action="CREATE",
                module="Payments",
                description=(
                    f"Auto-payment of ₹{new_member.fee} (paid) created for "
                    f"'{new_member.first_name} {new_member.last_name or ''}' "
                    f"(month: {current_month}) on member registration"
                ),
            )
            db.commit()

    return _base_q(db).filter(Member.id == new_member.id).first()


# ── Update ─────────────────────────────────────────────────

@router.put("/{member_id}", response_model=MemberResponse)
def update_member(
    member_id: int,
    payload: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = _base_q(db).filter(Member.id == member_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Member not found")

    phone_owner = db.query(Member).filter(
        Member.phone_number == payload.phone_number,
        Member.id != member_id,
    ).first()
    if phone_owner:
        raise HTTPException(status_code=400, detail="Phone number already exists")

    data = payload.model_dump()
    if data.get("date_of_birth"):
        data["age"] = _calculate_age(data["date_of_birth"])

    for field, value in data.items():
        setattr(existing, field, value)

    log_action(
        db,
        username=current_user.username,
        action="UPDATE",
        module="Members",
        description=(
            f"Member '{existing.first_name} {existing.last_name or ''}' "
            f"(id={member_id}) updated by '{current_user.username}'"
        ),
    )
    db.commit()
    return _base_q(db).filter(Member.id == member_id).first()


# ── Soft-delete (deactivate active member) ────────────────

@router.delete("/{member_id}")
def delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.is_active == True,  # noqa: E712
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member_name = f"{member.first_name} {member.last_name or ''}".strip()
    member.is_active = False

    log_action(
        db,
        username=current_user.username,
        action="DEACTIVATE",
        module="Members",
        description=(
            f"Member '{member_name}' (id={member_id}) "
            f"deactivated by '{current_user.username}'"
        ),
    )
    db.commit()
    return {"message": "Member marked as inactive"}


# ── Permanent hard-delete (discontinued members only) ──────

@router.delete("/{member_id}/permanent")
def permanently_delete_member(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently remove a discontinued member and all their records."""
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.is_active == False,  # noqa: E712
    ).first()
    if not member:
        raise HTTPException(
            status_code=404,
            detail="Member not found or is still active. Discontinue first.",
        )

    member_name = f"{member.first_name} {member.last_name or ''}".strip()

    log_action(
        db,
        username=current_user.username,
        action="DELETE",
        module="Members",
        description=(
            f"Member '{member_name}' (id={member_id}) permanently deleted "
            f"by '{current_user.username}'"
        ),
    )

    db.delete(member)
    db.commit()
    return {"message": f"Member '{member_name}' permanently deleted"}


# ── Toggle Continued / Discontinued ───────────────────────

@router.patch("/{member_id}/status")
def toggle_member_status(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    member.is_active = not member.is_active
    new_status = "continued" if member.is_active else "discontinued"

    log_action(
        db,
        username=current_user.username,
        action="STATUS_CHANGE",
        module="Members",
        description=(
            f"Member '{member.first_name} {member.last_name or ''}' "
            f"(id={member_id}) marked as {new_status} by '{current_user.username}'"
        ),
    )

    # When reactivating, create a not_paid placeholder for the current month
    # if one does not already exist. Never create a duplicate.
    if member.is_active and member.fee and member.fee > 0:
        current_month = date.today().strftime("%Y-%m")
        duplicate = db.query(Payment).filter(
            Payment.member_id == member.id,
            Payment.month     == current_month,
        ).first()
        if not duplicate:
            db.add(Payment(
                member_id    = member.id,
                amount       = member.fee,
                month        = current_month,
                payment_date = date.today(),
                note         = "Auto-recorded on member reactivation",
                status       = "not_paid",
            ))
            log_action(
                db,
                username=current_user.username,
                action="CREATE",
                module="Payments",
                description=(
                    f"Auto not_paid payment of ₹{member.fee} created for "
                    f"'{member.first_name} {member.last_name or ''}' "
                    f"(month: {current_month}) on reactivation"
                ),
            )

    db.commit()
    return {"message": f"Member marked as {new_status}", "is_active": member.is_active}
