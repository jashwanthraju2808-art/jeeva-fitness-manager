"""
FeeNotification model — tracks every WhatsApp reminder sent to a member.

The unique constraint on (member_id, due_month, notification_type) ensures
the scheduled cron job is idempotent: running it twice for the same month
will not create duplicate records or send duplicate messages.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class FeeNotification(Base):
    __tablename__ = "fee_notifications"

    __table_args__ = (
        UniqueConstraint(
            "member_id",
            "due_month",
            "notification_type",
            name="uq_fee_notification_member_month_type",
        ),
        Index("ix_fee_notifications_due_month", "due_month"),
        Index("ix_fee_notifications_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False
    )

    # ISO month string, e.g. "2026-08"
    due_month: Mapped[str] = mapped_column(String(7), nullable=False)

    # e.g. "whatsapp_reminder"
    notification_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="whatsapp_reminder"
    )

    # "pending" | "sent" | "failed"
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationship (lazy load is fine — rarely needed in bulk queries)
    member: Mapped["Member"] = relationship("Member")  # noqa: F821
