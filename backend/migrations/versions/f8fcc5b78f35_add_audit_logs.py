"""add audit logs

Revision ID: f8fcc5b78f35
Revises: bc054a2420d8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f8fcc5b78f35"
down_revision: Union[str, Sequence[str], None] = "bc054a2420d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=100), nullable=True),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("module", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("audit_logs")