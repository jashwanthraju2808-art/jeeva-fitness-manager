"""add payment status column

Revision ID: e32c04f06dd4
Revises: 42642ffd1a0c
Create Date: 2026-08-14

SAFETY CHECKLIST:
  ✅ Adds ONE column to payments table — no destructive ops
  ✅ Default value 'paid' — all existing payments treated as paid (correct)
  ✅ No DROP TABLE, no DROP COLUMN
  ✅ No changes to any other table
  ✅ downgrade() reverses only this addition
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e32c04f06dd4"
down_revision: Union[str, Sequence[str], None] = "42642ffd1a0c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add status column: 'paid' | 'not_paid'
    # Default 'paid' so all existing payment records remain as paid
    op.add_column(
        "payments",
        sa.Column(
            "status",
            sa.String(length=10),
            nullable=False,
            server_default="paid",
        ),
    )


def downgrade() -> None:
    op.drop_column("payments", "status")
