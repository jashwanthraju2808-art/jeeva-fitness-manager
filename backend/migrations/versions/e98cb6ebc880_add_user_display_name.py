"""add user display_name column

Revision ID: e98cb6ebc880
Revises: e32c04f06dd4
Create Date: 2026-08-14

SAFETY CHECKLIST:
  ✅ Adds ONE nullable column to users table — no destructive ops
  ✅ Existing users get display_name = NULL (UI falls back to username)
  ✅ No DROP TABLE, no DROP COLUMN
  ✅ No changes to any other table
  ✅ downgrade() reverses only this addition
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "e98cb6ebc880"
down_revision: Union[str, Sequence[str], None] = "e32c04f06dd4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("display_name", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "display_name")
