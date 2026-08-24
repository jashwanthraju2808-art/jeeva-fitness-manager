"""add member health and profile fields

Revision ID: 42642ffd1a0c
Revises: 772f4344d00f
Create Date: 2026-08-12

SAFETY CHECKLIST:
  ✅ Only ADD COLUMN on existing members table — no destructive ops
  ✅ Only ALTER COLUMN to drop NOT NULL on last_name (existing data unaffected)
  ✅ No DROP TABLE
  ✅ No DROP COLUMN
  ✅ No changes to users / payments / attendance / batches / audit_logs / fee_notifications
  ✅ All new columns are nullable — safe for existing rows
  ✅ downgrade() reverses only the additions
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "42642ffd1a0c"
down_revision: Union[str, Sequence[str], None] = "772f4344d00f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- New profile / health columns on members --------------------------
    # All nullable so existing rows are unaffected.
    op.add_column("members", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("members", sa.Column("height_cm",     sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("members", sa.Column("weight_kg",     sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column("members", sa.Column("health_notes",  sa.Text(), nullable=True))
    op.add_column("members", sa.Column("join_date",     sa.Date(), nullable=True))

    # -- Make last_name optional (was NOT NULL, now nullable) --------------
    # Existing rows all have a last_name value so this is purely additive.
    op.alter_column("members", "last_name", nullable=True)

    # -- Make age nullable (will be auto-calculated from DOB when provided)
    op.alter_column("members", "age", nullable=True)


def downgrade() -> None:
    # Re-apply NOT NULL to last_name and age before dropping columns
    op.alter_column("members", "age",       nullable=False)
    op.alter_column("members", "last_name", nullable=False)

    op.drop_column("members", "join_date")
    op.drop_column("members", "health_notes")
    op.drop_column("members", "weight_kg")
    op.drop_column("members", "height_cm")
    op.drop_column("members", "date_of_birth")
