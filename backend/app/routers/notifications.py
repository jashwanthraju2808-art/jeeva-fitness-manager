"""
Notifications router — WhatsApp reminders + payment confirmation emails.

WhatsApp: Meta WhatsApp Cloud API (FREE — 1000 conversations/month)
  Setup:
    1. developers.facebook.com → Create App → Business → Add WhatsApp product
    2. WhatsApp > Getting Started:
         - Copy "Temporary access token"  → META_WA_TOKEN in .env
         - Copy "Phone number ID"         → META_WA_PHONE_ID in .env
    3. To use your own number (+91 9916486812):
         WhatsApp > Phone Numbers → Add Phone Number → verify with OTP

Email: Gmail SMTP with App Password (free)
  Setup:
    1. myaccount.google.com → Security → 2-Step Verification (enable)
    2. Search "App Passwords" → Select app: Mail → Generate
    3. Paste the 16-char password into GMAIL_PASSWORD in .env
"""

import os
import smtplib
from datetime import date, datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.auth import get_current_user, require_admin
from app.database.dependencies import get_db
from app.models.fee_notification import FeeNotification
from app.models.member import Member
from app.models.payment import Payment
from app.models.user import User
from app.services.audit_service import log_action

router = APIRouter(prefix="/notifications", tags=["Notifications"])

STUDIO_NAME = os.getenv("STUDIO_NAME", "Jeeva Fitness")

# ── Meta WhatsApp Cloud API config ─────────────────────────────
META_WA_TOKEN    = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID = os.getenv("META_WA_PHONE_ID", "")
META_WA_API_URL  = "https://graph.facebook.com/v19.0/{phone_id}/messages"

# ── Gmail config ───────────────────────────────────────────────
GMAIL_USER = os.getenv("GMAIL_USER", "")
GMAIL_PASS = os.getenv("GMAIL_PASSWORD", "")


# ── Low-level helpers ──────────────────────────────────────────

def _normalize_number(number: str) -> str:
    """Ensure number has +91 country code, digits only for Meta API."""
    n = number.strip().replace(" ", "").replace("-", "")
    if not n.startswith("+"):
        n = "+91" + n
    return n.lstrip("+")


def _send_whatsapp(to_number: str, message: str) -> dict:
    """
    Send a WhatsApp text message via Meta Cloud API.
    Returns {"status": "sent"|"skipped"|"failed", ...}
    """
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        return {
            "status": "skipped",
            "reason": (
                "Meta WhatsApp credentials not configured. "
                "Add META_WA_TOKEN and META_WA_PHONE_ID to backend/.env"
            ),
        }
    try:
        url = META_WA_API_URL.format(phone_id=META_WA_PHONE_ID)
        headers = {
            "Authorization": f"Bearer {META_WA_TOKEN}",
            "Content-Type": "application/json",
        }
        payload = {
            "messaging_product": "whatsapp",
            "to": _normalize_number(to_number),
            "type": "text",
            "text": {"body": message},
        }
        resp = httpx.post(url, json=payload, headers=headers, timeout=10)
        data = resp.json()
        if resp.status_code == 200 and "messages" in data:
            return {"status": "sent", "message_id": data["messages"][0]["id"], "to": to_number}
        error_msg = data.get("error", {}).get("message", str(data))
        return {"status": "failed", "reason": error_msg}
    except Exception as e:
        return {"status": "failed", "reason": str(e)}


def _send_email(to_email: str, subject: str, html_body: str) -> dict:
    """Send an email via Gmail SMTP."""
    if not GMAIL_PASS:
        return {
            "status": "skipped",
            "reason": "Gmail App Password not set. Add GMAIL_PASSWORD to backend/.env",
        }
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = GMAIL_USER
        msg["To"]      = to_email
        msg.attach(MIMEText(html_body, "html"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASS)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
        return {"status": "sent", "to": to_email}
    except Exception as e:
        return {"status": "failed", "reason": str(e)}


def _build_reminder_message(member: Member, month_label: str) -> str:
    return (
        f"Hello {member.first_name} 🙏\n\n"
        f"This is a friendly reminder from *{STUDIO_NAME}* that your monthly fee "
        f"of *₹{member.fee}* for *{month_label}* is due.\n\n"
        f"Please make the payment at your earliest convenience.\n\n"
        f"Thank you 😊\n— {STUDIO_NAME}"
    )


# ── Response schemas ───────────────────────────────────────────

class ReminderResult(BaseModel):
    member_id: int
    member_name: str
    phone: str
    whatsapp: dict


class ReminderResponse(BaseModel):
    month: str
    total_unpaid: int
    results: List[ReminderResult]


class NotificationResponse(BaseModel):
    id: int
    member_id: int
    member_name: Optional[str] = None
    due_month: str
    notification_type: str
    status: str
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Bulk reminder endpoint ─────────────────────────────────────

@router.post("/whatsapp/reminders", response_model=ReminderResponse)
def send_fee_reminders(
    month: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send WhatsApp reminders to all unpaid members for the given month.
    Uses FeeNotification for deduplication — members who already received
    a reminder this month are skipped."""
    target_month = month or date.today().strftime("%Y-%m")
    month_label  = target_month  # e.g. "2026-08"

    paid_ids = (
        db.query(Payment.member_id)
        .filter(Payment.month == target_month)
        .subquery()
    )
    unpaid = (
        db.query(Member)
        .filter(Member.is_active == True, ~Member.id.in_(paid_ids))  # noqa: E712
        .all()
    )

    results = []
    for m in unpaid:
        # Deduplication: skip if already sent for this member+month
        existing = db.query(FeeNotification).filter(
            FeeNotification.member_id == m.id,
            FeeNotification.due_month == target_month,
            FeeNotification.notification_type == "whatsapp_reminder",
            FeeNotification.status == "sent",
        ).first()

        if existing:
            results.append(ReminderResult(
                member_id=m.id,
                member_name=f"{m.first_name} {m.last_name}",
                phone=m.phone_number,
                whatsapp={"status": "skipped", "reason": "Already sent this month"},
            ))
            continue

        message    = _build_reminder_message(m, month_label)
        wa_result  = _send_whatsapp(m.phone_number, message)

        # Record notification outcome
        notif_status = wa_result["status"]  # "sent" | "failed" | "skipped"
        notif = FeeNotification(
            member_id=m.id,
            due_month=target_month,
            notification_type="whatsapp_reminder",
            status=notif_status,
            sent_at=datetime.now(timezone.utc) if notif_status == "sent" else None,
            error_message=wa_result.get("reason") if notif_status in ("failed", "skipped") else None,
        )
        db.add(notif)

        # Audit log
        log_action(
            db,
            username=current_user.username,
            action="SEND_REMINDER",
            module="Notifications",
            description=(
                f"WhatsApp reminder for month {target_month} sent to "
                f"'{m.first_name} {m.last_name}' (phone: {m.phone_number}): "
                f"{notif_status}"
            ),
        )

        results.append(ReminderResult(
            member_id=m.id,
            member_name=f"{m.first_name} {m.last_name}",
            phone=m.phone_number,
            whatsapp=wa_result,
        ))

    db.commit()

    return ReminderResponse(
        month=target_month,
        total_unpaid=len(unpaid),
        results=results,
    )


# ── Single reminder endpoint ───────────────────────────────────

@router.post("/whatsapp/reminder/{member_id}")
def send_single_reminder(
    member_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a WhatsApp reminder to one specific member."""
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.is_active == True  # noqa: E712
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    target_month = date.today().strftime("%Y-%m")
    month_label  = target_month
    message      = _build_reminder_message(member, month_label)
    result       = _send_whatsapp(member.phone_number, message)
    notif_status = result["status"]

    # Upsert FeeNotification for this member+month (single reminder overwrites)
    existing = db.query(FeeNotification).filter(
        FeeNotification.member_id == member_id,
        FeeNotification.due_month == target_month,
        FeeNotification.notification_type == "whatsapp_reminder",
    ).first()

    if existing:
        existing.status        = notif_status
        existing.sent_at       = datetime.now(timezone.utc) if notif_status == "sent" else existing.sent_at
        existing.error_message = result.get("reason") if notif_status in ("failed", "skipped") else None
    else:
        db.add(FeeNotification(
            member_id=member_id,
            due_month=target_month,
            notification_type="whatsapp_reminder",
            status=notif_status,
            sent_at=datetime.now(timezone.utc) if notif_status == "sent" else None,
            error_message=result.get("reason") if notif_status in ("failed", "skipped") else None,
        ))

    log_action(
        db,
        username=current_user.username,
        action="SEND_REMINDER",
        module="Notifications",
        description=(
            f"Single WhatsApp reminder for {target_month} sent to "
            f"'{member.first_name} {member.last_name}' (phone: {member.phone_number}): "
            f"{notif_status}"
        ),
    )
    db.commit()

    return {"member": f"{member.first_name} {member.last_name}", "whatsapp": result}


# ── Custom message endpoint ────────────────────────────────────

class CustomMessageRequest(BaseModel):
    message: str


@router.post("/whatsapp/send/{member_id}")
def send_custom_message(
    member_id: int,
    body: CustomMessageRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a custom WhatsApp message to a specific member."""
    member = db.query(Member).filter(
        Member.id == member_id,
        Member.is_active == True  # noqa: E712
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    result = _send_whatsapp(member.phone_number, body.message.strip())

    log_action(
        db,
        username=current_user.username,
        action="SEND_MESSAGE",
        module="Notifications",
        description=(
            f"Custom WhatsApp message sent to '{member.first_name} {member.last_name}' "
            f"(phone: {member.phone_number}) by '{current_user.username}': "
            f"{result['status']}"
        ),
    )
    db.commit()

    return {
        "member": f"{member.first_name} {member.last_name}",
        "phone": member.phone_number,
        "whatsapp": result,
    }


# ── Email payment confirmation ─────────────────────────────────

@router.post("/email/payment-confirmation/{payment_id}")
def send_payment_confirmation(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a payment confirmation email to the member."""
    payment = (
        db.query(Payment)
        .options(joinedload(Payment.member))
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    member = payment.member
    if not member.email:
        return {"status": "skipped", "reason": f"{member.first_name} has no email on file"}

    subject = f"✅ Payment Confirmed — {STUDIO_NAME}"
    note_row = (
        f"<tr style='background:#f9fafb;'>"
        f"<td style='padding:10px;color:#666;font-size:14px;'>Note</td>"
        f"<td style='padding:10px;'>{payment.note}</td></tr>"
        if payment.note else ""
    )
    html_body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px;
                border:1px solid #e5e7eb;border-radius:10px;">
      <h2 style="color:#1e1b2e;margin-bottom:4px;">Payment Confirmation</h2>
      <p style="color:#888;font-size:13px;margin-bottom:20px;">{STUDIO_NAME}</p>
      <p style="color:#555;">Hi <strong>{member.first_name}</strong>,</p>
      <p style="color:#555;">Your payment has been successfully recorded.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px;color:#666;">Amount Paid</td>
          <td style="padding:10px;font-weight:700;color:#16a34a;">₹{payment.amount:,}</td>
        </tr>
        <tr>
          <td style="padding:10px;color:#666;">Month</td>
          <td style="padding:10px;font-weight:600;">{payment.month}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px;color:#666;">Payment Date</td>
          <td style="padding:10px;font-weight:600;">{payment.payment_date}</td>
        </tr>
        {note_row}
      </table>
      <p style="color:#888;font-size:13px;margin-top:20px;">
        Thank you for your continued practice 🙏<br>
        — {STUDIO_NAME} Team
      </p>
    </div>
    """
    result = _send_email(member.email, subject, html_body)

    log_action(
        db,
        username=current_user.username,
        action="SEND_EMAIL",
        module="Notifications",
        description=(
            f"Payment confirmation email for payment id={payment_id} sent to "
            f"'{member.first_name} {member.last_name}' ({member.email}): "
            f"{result['status']}"
        ),
    )
    db.commit()

    return {"member": f"{member.first_name} {member.last_name}", "email": result}


# ── List notifications ─────────────────────────────────────────

@router.get("/", response_model=List[NotificationResponse])
def list_notifications(
    status: Optional[str] = Query(default=None, description="sent | failed | skipped | pending"),
    due_month: Optional[str] = Query(default=None, description="YYYY-MM"),
    member_id: Optional[int] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List fee notifications. Admin sees all; staff sees all (operational data)."""
    q = db.query(FeeNotification).options(joinedload(FeeNotification.member))

    if status:
        q = q.filter(FeeNotification.status == status)
    if due_month:
        q = q.filter(FeeNotification.due_month == due_month)
    if member_id:
        q = q.filter(FeeNotification.member_id == member_id)

    notifications = (
        q.order_by(FeeNotification.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for n in notifications:
        member_name = (
            f"{n.member.first_name} {n.member.last_name}" if n.member else None
        )
        result.append(NotificationResponse(
            id=n.id,
            member_id=n.member_id,
            member_name=member_name,
            due_month=n.due_month,
            notification_type=n.notification_type,
            status=n.status,
            sent_at=n.sent_at,
            error_message=n.error_message,
            created_at=n.created_at,
        ))
    return result


# ── Delete notification log entry ─────────────────────────────

@router.delete("/{notification_id}", status_code=200)
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Permanently delete a notification log entry. Admin only."""
    notif = db.query(FeeNotification).filter(
        FeeNotification.id == notification_id
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    log_action(
        db,
        username=current_user.username,
        action="DELETE",
        module="Notifications",
        description=(
            f"Notification log (id={notification_id}, member_id={notif.member_id}, "
            f"month={notif.due_month}, status={notif.status}) deleted "
            f"by '{current_user.username}'"
        ),
    )
    db.delete(notif)
    db.commit()
    return {"message": "Notification deleted"}


# ── Retry failed notification ──────────────────────────────────

@router.post("/{notification_id}/retry")
def retry_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Retry a failed or skipped WhatsApp reminder. Admin only."""
    notif = (
        db.query(FeeNotification)
        .options(joinedload(FeeNotification.member))
        .filter(FeeNotification.id == notification_id)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    if notif.status == "sent":
        raise HTTPException(status_code=400, detail="Notification already sent successfully")

    member = notif.member
    if not member or not member.is_active:
        raise HTTPException(status_code=400, detail="Member not found or inactive")

    message = _build_reminder_message(member, notif.due_month)
    result  = _send_whatsapp(member.phone_number, message)

    notif.status        = result["status"]
    notif.sent_at       = datetime.now(timezone.utc) if result["status"] == "sent" else notif.sent_at
    notif.error_message = result.get("reason") if result["status"] in ("failed", "skipped") else None

    log_action(
        db,
        username=current_user.username,
        action="RETRY_REMINDER",
        module="Notifications",
        description=(
            f"Retried WhatsApp reminder (id={notification_id}) for "
            f"'{member.first_name} {member.last_name}' month={notif.due_month}: "
            f"{result['status']}"
        ),
    )
    db.commit()

    return {
        "notification_id": notification_id,
        "member": f"{member.first_name} {member.last_name}",
        "whatsapp": result,
    }
