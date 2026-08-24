from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.database.dependencies import get_db
from app.models.audit_log import AuditLog
from app.models.fee_notification import FeeNotification
from app.models.member import Member
from app.models.payment import Payment
from app.models.user import User


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class UnpaidMember(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    phone_number: str
    fee: int


class RecentPayment(BaseModel):
    id: int
    member_id: int
    member_name: str
    amount: int
    month: str
    payment_date: date


class MonthSummary(BaseModel):
    month: str
    collected: int


class NotificationStats(BaseModel):
    sent: int
    failed: int
    skipped: int


class RecentAuditLog(BaseModel):
    id: int
    username: Optional[str]
    action: str
    module: str
    description: str
    created_at: str


class DashboardResponse(BaseModel):
    total_active_members: int
    current_month: str
    total_collected_this_month: int
    total_expected_this_month: int
    pending_this_month: int
    expiring_soon_count: int
    expired_count: int
    new_members_this_month: int
    unpaid_members: List[UnpaidMember]
    recent_payments: List[RecentPayment]
    monthly_summary: List[MonthSummary]
    notification_stats: NotificationStats
    recent_audit_logs: Optional[List[RecentAuditLog]] = None
    expiring_members: List[UnpaidMember] = []


@router.get("/", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    current_month = today.strftime("%Y-%m")

    # ---------------------------------------------------------
    # ACTIVE MEMBERS
    # ---------------------------------------------------------

    total_active = (
        db.query(func.count(Member.id))
        .filter(Member.is_active == True)  # noqa: E712
        .scalar()
        or 0
    )

    # ---------------------------------------------------------
    # TOTAL COLLECTED THIS MONTH
    # Only sum payments with status = 'paid'.
    # 'not_paid' payments must never inflate the collected figure.
    # ---------------------------------------------------------

    total_collected = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(
            Payment.month  == current_month,
            Payment.status == "paid",          # C2 fix
        )
        .scalar()
        or 0
    )

    # ---------------------------------------------------------
    # TOTAL EXPECTED THIS MONTH
    # ---------------------------------------------------------

    total_expected = (
        db.query(func.coalesce(func.sum(Member.fee), 0))
        .filter(Member.is_active == True)  # noqa: E712
        .scalar()
        or 0
    )

    # ---------------------------------------------------------
    # TOTAL PENDING THIS MONTH
    # ---------------------------------------------------------

    pending = max(total_expected - total_collected, 0)

    # ---------------------------------------------------------
    # UNPAID / PARTIALLY PAID MEMBERS
    #
    # Example:
    # Monthly fee = 1500
    # Paid         = 1000
    # Balance      = 500
    #
    # The member MUST appear in unpaid_members.
    # ---------------------------------------------------------

    active_members = (
        db.query(Member)
        .filter(Member.is_active == True)  # noqa: E712
        .order_by(Member.first_name)
        .all()
    )

    unpaid_members = []

    for member in active_members:
        paid_amount = (
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(
                Payment.member_id == member.id,
                Payment.month     == current_month,
                Payment.status    == "paid",    # H2 fix: only 'paid' reduces the balance
            )
            .scalar()
            or 0
        )

        balance = int(member.fee) - int(paid_amount)

        if balance > 0:
            unpaid_members.append(
                UnpaidMember(
                    id=member.id,
                    first_name=member.first_name,
                    last_name=member.last_name,
                    phone_number=member.phone_number,
                    fee=balance,
                )
            )

    # ---------------------------------------------------------
    # RECENT 10 PAYMENTS
    # ---------------------------------------------------------

    recent_rows = (
        db.query(Payment)
        .join(Member, Payment.member_id == Member.id)
        .order_by(
            Payment.payment_date.desc(),
            Payment.id.desc(),
        )
        .limit(10)
        .all()
    )

    recent_payments = [
        RecentPayment(
            id=payment.id,
            member_id=payment.member_id,
            member_name=(
                f"{payment.member.first_name} "
                f"{payment.member.last_name}"
            ),
            amount=payment.amount,
            month=payment.month,
            payment_date=payment.payment_date,
        )
        for payment in recent_rows
    ]

    # ---------------------------------------------------------
    # 6-MONTH ROLLING COLLECTION SUMMARY
    # ---------------------------------------------------------

    monthly_summary = []

    for i in range(5, -1, -1):
        first_of_month = today.replace(day=1)

        target = date(
            first_of_month.year
            + (first_of_month.month - i - 1) // 12,
            ((first_of_month.month - i - 1) % 12) + 1,
            1,
        )

        label = target.strftime("%Y-%m")

        collected = (
            db.query(func.coalesce(func.sum(Payment.amount), 0))
            .filter(Payment.month == label)
            .scalar()
            or 0
        )

        monthly_summary.append(
            MonthSummary(
                month=label,
                collected=collected,
            )
        )

    # ---------------------------------------------------------
    # NOTIFICATION STATISTICS
    # Filter by active member IDs only — prevents stale skipped/failed
    # records from discontinued members inflating the counts.
    # ---------------------------------------------------------

    active_member_ids = [m.id for m in active_members]

    def _notif_count(status_val: str) -> int:
        if not active_member_ids:
            return 0
        return (
            db.query(func.count(FeeNotification.id))
            .filter(
                FeeNotification.due_month == current_month,
                FeeNotification.status    == status_val,
                FeeNotification.member_id.in_(active_member_ids),
            )
            .scalar()
            or 0
        )

    notification_stats = NotificationStats(
        sent=_notif_count("sent"),
        failed=_notif_count("failed"),
        skipped=_notif_count("skipped"),
    )

    # ---------------------------------------------------------
    # RECENT AUDIT LOGS - ADMIN ONLY
    # ---------------------------------------------------------

    recent_audit_logs: Optional[List[RecentAuditLog]] = None

    if current_user.role == "admin":
        audit_rows = (
            db.query(AuditLog)
            .order_by(AuditLog.created_at.desc())
            .limit(5)
            .all()
        )

        recent_audit_logs = [
            RecentAuditLog(
                id=audit.id,
                username=audit.username,
                action=audit.action,
                module=audit.module,
                description=audit.description,
                created_at=(
                    audit.created_at.isoformat()
                    if audit.created_at
                    else ""
                ),
            )
            for audit in audit_rows
        ]

    # ---------------------------------------------------------
    # GYM STATS: expiring soon, expired, new this month
    # ---------------------------------------------------------
    threshold = today + timedelta(days=7)

    expiring_soon_count = (
        db.query(func.count(Member.id))
        .filter(
            Member.is_active == True,                    # noqa: E712
            Member.membership_expiry_date != None,       # noqa: E711
            Member.membership_expiry_date >= today,
            Member.membership_expiry_date <= threshold,
        )
        .scalar() or 0
    )

    expired_count = (
        db.query(func.count(Member.id))
        .filter(
            Member.is_active == True,                    # noqa: E712
            Member.membership_expiry_date != None,       # noqa: E711
            Member.membership_expiry_date < today,
        )
        .scalar() or 0
    )

    month_start = today.replace(day=1)
    new_members_this_month = (
        db.query(func.count(Member.id))
        .filter(
            Member.is_active == True,                    # noqa: E712
            Member.join_date >= month_start,
        )
        .scalar() or 0
    )

    # Expiring members list for dashboard section
    expiring_rows = (
        db.query(Member)
        .filter(
            Member.is_active == True,                    # noqa: E712
            Member.membership_expiry_date != None,       # noqa: E711
            Member.membership_expiry_date >= today,
            Member.membership_expiry_date <= threshold,
        )
        .order_by(Member.membership_expiry_date)
        .all()
    )
    expiring_members = [
        UnpaidMember(
            id=m.id,
            first_name=m.first_name,
            last_name=m.last_name,
            phone_number=m.phone_number,
            fee=m.fee,
        )
        for m in expiring_rows
    ]

    # ---------------------------------------------------------
    # FINAL RESPONSE
    # ---------------------------------------------------------

    return DashboardResponse(
        total_active_members=total_active,
        current_month=current_month,
        total_collected_this_month=total_collected,
        total_expected_this_month=total_expected,
        pending_this_month=pending,
        expiring_soon_count=expiring_soon_count,
        expired_count=expired_count,
        new_members_this_month=new_members_this_month,
        unpaid_members=unpaid_members,
        recent_payments=recent_payments,
        monthly_summary=monthly_summary,
        notification_stats=notification_stats,
        recent_audit_logs=recent_audit_logs,
        expiring_members=expiring_members,
    )