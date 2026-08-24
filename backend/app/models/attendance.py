from datetime import date

from sqlalchemy import ForeignKey, Integer, Date, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Attendance(Base):
    __tablename__ = "attendance"

    __table_args__ = (
        UniqueConstraint("member_id", "att_date", name="uq_attendance_member_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"))

    att_date: Mapped[date] = mapped_column(Date)

    present: Mapped[bool] = mapped_column(Boolean, default=True)

    member: Mapped["Member"] = relationship("Member", back_populates="attendances")  # noqa: F821
