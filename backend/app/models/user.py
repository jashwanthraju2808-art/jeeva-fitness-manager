from datetime import datetime
from typing import Optional

from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    username: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False,
    )

    # Human-readable display name; falls back to username in the UI when NULL
    display_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(20), default="staff", nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
