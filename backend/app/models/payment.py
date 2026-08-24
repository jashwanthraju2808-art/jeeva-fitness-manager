from datetime import date, datetime

from sqlalchemy import ForeignKey, Integer, Date, String, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("member_id", "month", name="uq_payment_member_month"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"))

    amount: Mapped[int] = mapped_column(Integer)

    # ISO month string e.g. "2026-08"
    month: Mapped[str] = mapped_column(String(7))

    payment_date: Mapped[date] = mapped_column(Date)

    note:           Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # "paid" | "not_paid"  — default "paid" matches DB server_default
    status: Mapped[str] = mapped_column(String(10), default="paid", server_default="paid")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    member: Mapped["Member"] = relationship("Member", back_populates="payments")  # noqa: F821
