"""
Cron router — endpoints called by Render Cron Jobs.

Security: every request must include the header
    X-Cron-Secret: <CRON_SECRET from .env>

This is NOT a public endpoint and NOT a JWT-protected endpoint.
It uses a shared secret so the Render Cron service can call it
without needing a user login session.

Do NOT hard-code the secret — always read from CRON_SECRET env var.

Render Cron Job configuration (set in Render dashboard):
    Command : curl -X POST https://<your-api>.onrender.com/cron/send-reminders \
                   -H "X-Cron-Secret: $CRON_SECRET"
    Schedule: 0 8 * * *   (every day at 08:00 UTC)
"""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.database.dependencies import get_db
from app.services.reminder_service import send_due_reminders

router = APIRouter(prefix="/cron", tags=["Cron"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _verify_cron_secret(x_cron_secret: Optional[str] = Header(default=None)) -> None:
    """Dependency that rejects requests without the correct CRON_SECRET header."""
    if not CRON_SECRET:
        # If CRON_SECRET is not configured, reject all cron calls
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET is not configured on the server. Set it in the environment.",
        )
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Cron-Secret header.",
        )


@router.post("/send-reminders")
def cron_send_reminders(
    month: Optional[str] = None,
    db: Session = Depends(get_db),
    _: None = Depends(_verify_cron_secret),
):
    """
    Idempotent daily reminder job.

    Called by Render Cron:
        curl -X POST https://<api>/cron/send-reminders \\
             -H "X-Cron-Secret: <CRON_SECRET>"

    Optional query param:
        ?month=2026-08   (defaults to current month if omitted)

    Running this endpoint multiple times for the same month is safe —
    members who already received a "sent" reminder will be skipped.
    """
    summary = send_due_reminders(db, target_month=month, triggered_by="cron")
    return {"status": "ok", "summary": summary}
