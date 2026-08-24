from sqlalchemy import String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Batch(Base):
    __tablename__ = "batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)   # e.g. "5:30 AM – 6:30 AM"
    start_time: Mapped[str] = mapped_column(String(10))            # "05:30"
    end_time: Mapped[str] = mapped_column(String(10))              # "06:30"

    members: Mapped[list["Member"]] = relationship(                 # noqa: F821
        "Member", back_populates="batch"
    )
