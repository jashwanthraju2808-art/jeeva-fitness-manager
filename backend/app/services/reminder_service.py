"""
Reminder service — idempotent daily fee reminder logic.

Called by:
  - POST /cron/send-reminders   (Render Cron Job)
  - POST /notifications/whatsapp/reminders  (manual trigger from UI)

Idempotency guarantee:
  The fee_notifications table has a UNIQUE constraint on
  (member_id, due_month, notification_type).
  Before sending, we check for an existing "sent" record.
  If one exists, that member is skipped unconditionally.
  Running this function 10 times for the same month will still
  send at most 1 reminder per member.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.models.fee_notification import FeeNotification
from app.models.member import Member
from app.models.payment import Payment
from app.services.audit_service import log_action

logger = logging.getLogger(__name__)

STUDIO_NAME      = os.getenv("STUDIO_NAME", "Jeeva Fitness")
META_WA_TOKEN    = os.getenv("META_WA_TOKEN", "")
META_WA_PHONE_ID = os.getenv("META_WA_PHONE_ID", "")
META_WA_API_URL  = "https://graph.facebook.com/v19.0/{phone_id}/messages"


def _normalize_number(number: str) -> str:
    n = number.strip().replace(" ", "").replace("-", "")
    if not n.startswith("+"):
        n = "+91" + n
    return n.lstrip("+")


def _send_whatsapp(to_number: str, message: str) -> dict:
    if not META_WA_TOKEN or not META_WA_PHONE_ID:
        return {
            "status": "skipped",
            "reason": "META_WA_TOKEN or META_WA_PHONE_ID not configured",
        }
    try:
        url     = META_WA_API_URL.format(phone_id=META_WA_PHONE_ID)
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
            return {"status": "sent", "message_id": data["messages"][0]["id"]}
        error_msg = data.get("error", {}).get("message", str(data))
        return {"status": "failed", "reason": error_msg}
    except Exception as exc:
        return {"status": "failed", "reason": str(exc)}


def send_due_reminders(
    db: Session,
    *,
    target_month: Optional[str] = None,
    triggered_by: str = "cron",
) -> dict:
    """
    Find members who have NOT paid for target_month and have NOT already
    received a reminder, then send WhatsApp reminders.

    Returns a summary dict: {sent, skipped, failed, total_unpaid, month}
    """
    if target_month is None:
        target_month = date.today().strftime("%Y-%m")

    logger.info("send_due_reminders: target_month=%s triggered_by=%s", target_month, triggered_by)

    # Members who paid this month
    paid_ids = (
        db.query(Payment.member_id)
        .filter(Payment.month == target_month)
        .subquery()
    )

    # Active members who haven't paid
    unpaid_members = (
        db.query(Member)
        .filter(Member.is_active == True, ~Member.id.in_(paid_ids))  # noqa: E712
        .all()
    )

    sent_count    = 0
    skipped_count = 0
    failed_count  = 0

    for member in unpaid_members:
        # Idempotency check — skip if already sent
        already_sent = db.query(FeeNotification).filter(
            FeeNotification.member_id        == member.id,
            FeeNotification.due_month        == target_month,
            FeeNotification.notification_type == "whatsapp_reminder",
            FeeNotification.status           == "sent",
        ).first()

        if already_sent:
            skipped_count += 1
            logger.debug("Skipping %s — already sent for %s", member.id, target_month)
            continue

        message = (
            f"Hello {member.first_name} 🙏\n\n"
            f"This is a friendly reminder from *{STUDIO_NAME}* that your monthly fee "
            f"of *₹{member.fee}* for *{target_month}* is due.\n\n"
            f"Please make the payment at your earliest convenience.\n\n"
            f"Thank you 😊\n— {STUDIO_NAME}"
        )

        result       = _send_whatsapp(member.phone_number, message)
        notif_status = result["status"]

        # Upsert FeeNotification (may already exist as "failed" from a previous run)
        existing_notif = db.query(FeeNotification).filter(
            FeeNotification.member_id         == member.id,
            FeeNotification.due_month         == target_month,
            FeeNotification.notification_type == "whatsapp_reminder",
        ).first()

        if existing_notif:
            existing_notif.status        = notif_status
            existing_notif.sent_at       = datetime.now(timezone.utc) if notif_status == "sent" else existing_notif.sent_at
            existing_notif.error_message = result.get("reason") if notif_status in ("failed", "skipped") else None
        else:
            db.add(FeeNotification(
                member_id=member.id,
                due_month=target_month,
                notification_type="whatsapp_reminder",
                status=notif_status,
                sent_at=datetime.now(timezone.utc) if notif_status == "sent" else None,
                error_message=result.get("reason") if notif_status in ("failed", "skipped") else None,
            ))

        log_action(
            db,
            username=triggered_by,
            action="SEND_REMINDER",
            module="Notifications",
            description=(
                f"[{triggered_by}] WhatsApp reminder for {target_month} → "
                f"'{member.first_name} {member.last_name}' "
                f"(phone: {member.phone_number}): {notif_status}"
            ),
        )

        if notif_status == "sent":
            sent_count += 1
        elif notif_status == "failed":
            failed_count += 1
        else:
            skipped_count += 1

    db.commit()

    summary = {
        "month":        target_month,
        "total_unpaid": len(unpaid_members),
        "sent":         sent_count,
        "skipped":      skipped_count,
        "failed":       failed_count,
    }
    logger.info("send_due_reminders complete: %s", summary)
    return summary
