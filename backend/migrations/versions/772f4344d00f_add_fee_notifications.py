"""add fee_notifications table

Revision ID: 772f4344d00f
Revises: f8fcc5b78f35
Create Date: 2026-08-12

SAFETY CHECKLIST:
  ✅ Creates ONE new table: fee_notifications
  ✅ No existing tables modified
  ✅ No DROP TABLE
  ✅ No DROP COLUMN
  ✅ No ALTER on users / members / payments / attendance / batches / audit_logs
  ✅ Foreign key references members.id (existing table, existing column)
  ✅ Unique constraint prevents duplicate reminders per member+month+type
  ✅ downgrade() removes only the new table
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "772f4344d00f"
down_revision: Union[str, Sequence[str], None] = "f8fcc5b78f35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on:    Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fee_notifications",
        sa.Column("id",                sa.Integer(),               autoincrement=True, nullable=False),
        sa.Column("member_id",         sa.Integer(),               nullable=False),
        sa.Column("due_month",         sa.String(length=7),        nullable=False),
        sa.Column("notification_type", sa.String(length=30),       nullable=False, server_default="whatsapp_reminder"),
        sa.Column("status",            sa.String(length=20),       nullable=False, server_default="pending"),
        sa.Column("sent_at",           sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message",     sa.Text(),                  nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "member_id",
            "due_month",
            "notification_type",
            name="uq_fee_notification_member_month_type",
        ),
    )
    op.create_index("ix_fee_notifications_due_month", "fee_notifications", ["due_month"])
    op.create_index("ix_fee_notifications_status",    "fee_notifications", ["status"])


def downgrade() -> None:
    op.drop_index("ix_fee_notifications_status",    table_name="fee_notifications")
    op.drop_index("ix_fee_notifications_due_month", table_name="fee_notifications")
    op.drop_table("fee_notifications")
