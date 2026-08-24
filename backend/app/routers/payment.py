from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Literal

from app.core.auth import get_current_user
from app.database.dependencies import get_db
from app.models.member import Member
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import PaymentCreate, PaymentResponse
from app.services.audit_service import log_action

router = APIRouter(prefix="/payments", tags=["Payments"])


# ── List ───────────────────────────────────────────────────

@router.get("/", response_model=List[PaymentResponse])
def get_payments(db: Session = Depends(get_db)):
    return db.query(Payment).order_by(Payment.payment_date.desc()).all()


@router.get("/member/{member_id}", response_model=List[PaymentResponse])
def get_payments_by_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return (
        db.query(Payment)
        .filter(Payment.member_id == member_id)
        .order_by(Payment.payment_date.desc())
        .all()
    )


@router.get("/month/{month}", response_model=List[PaymentResponse])
def get_payments_by_month(month: str, db: Session = Depends(get_db)):
    return (
        db.query(Payment)
        .filter(Payment.month == month)
        .order_by(Payment.payment_date.desc())
        .all()
    )


# ── Create ─────────────────────────────────────────────────

@router.post("/", response_model=PaymentResponse, status_code=201)
def add_payment(
    payment: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = db.query(Member).filter(Member.id == payment.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # ── Duplicate guard — must happen BEFORE any insert ────
    existing = db.query(Payment).filter(
        Payment.member_id == payment.member_id,
        Payment.month     == payment.month,
    ).first()
    if existing:
        from datetime import datetime
        try:
            [yr, mo] = payment.month.split("-")
            month_label = datetime(int(yr), int(mo), 1).strftime("%B %Y")
        except Exception:
            month_label = payment.month
        raise HTTPException(
            status_code=409,
            detail=f"Payment already exists for {member.first_name} {member.last_name or ''} for {month_label}. Use Edit to update it.",
        )

    new_payment = Payment(
        member_id      = payment.member_id,
        amount         = payment.amount,
        month          = payment.month,
        payment_date   = payment.payment_date,
        note           = payment.note,
        status         = payment.status,
        payment_method = payment.payment_method,
    )
    db.add(new_payment)
    db.flush()

    log_action(
        db,
        username=current_user.username,
        action="CREATE",
        module="Payments",
        description=(
            f"Payment of ₹{payment.amount} ({payment.status}) recorded for "
            f"'{member.first_name} {member.last_name or ''}' "
            f"(month: {payment.month}) by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(new_payment)
    return new_payment


# ── Update ─────────────────────────────────────────────────

@router.put("/{payment_id}", response_model=PaymentResponse)
def update_payment(
    payment_id: int,
    payment: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Payment).filter(Payment.id == payment_id).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Payment not found")

    member = db.query(Member).filter(Member.id == payment.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    existing.member_id     = payment.member_id
    existing.amount        = payment.amount
    existing.month         = payment.month
    existing.payment_date  = payment.payment_date
    existing.note          = payment.note
    existing.status        = payment.status
    existing.payment_method = payment.payment_method

    log_action(
        db,
        username=current_user.username,
        action="UPDATE",
        module="Payments",
        description=(
            f"Payment (id={payment_id}) updated to ₹{payment.amount} ({payment.status}) "
            f"for '{member.first_name} {member.last_name or ''}' "
            f"(month: {payment.month}) by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(existing)
    return existing


# ── Toggle status (Paid ↔ Not Paid) ───────────────────────

class StatusUpdate(BaseModel):
    status: Literal["paid", "not_paid"]


@router.patch("/{payment_id}/status", response_model=PaymentResponse)
def update_payment_status(
    payment_id: int,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle a payment between paid and not_paid. Persisted to DB."""
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    old_status     = payment.status
    payment.status = body.status

    member = db.query(Member).filter(Member.id == payment.member_id).first()
    member_name = f"{member.first_name} {member.last_name or ''}".strip() if member else f"id={payment.member_id}"

    log_action(
        db,
        username=current_user.username,
        action="STATUS_CHANGE",
        module="Payments",
        description=(
            f"Payment (id={payment_id}) for '{member_name}' (month: {payment.month}) "
            f"status changed from '{old_status}' to '{body.status}' "
            f"by '{current_user.username}'"
        ),
    )
    db.commit()
    db.refresh(payment)
    return payment


# ── Delete ─────────────────────────────────────────────────

@router.delete("/{payment_id}", status_code=200)
def delete_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    member = db.query(Member).filter(Member.id == payment.member_id).first()
    member_name = (
        f"{member.first_name} {member.last_name or ''}".strip()
        if member else f"id={payment.member_id}"
    )

    log_action(
        db,
        username=current_user.username,
        action="DELETE",
        module="Payments",
        description=(
            f"Payment (id={payment_id}) of ₹{payment.amount} for '{member_name}' "
            f"(month: {payment.month}) deleted by '{current_user.username}'"
        ),
    )
    db.delete(payment)
    db.commit()
    return {"message": "Payment deleted"}
