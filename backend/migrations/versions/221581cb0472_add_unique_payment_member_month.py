"""add_unique_payment_member_month

Adds a unique constraint on payments(member_id, month) to prevent
duplicate payment records for the same member in the same month.

No existing duplicate records were found before this migration was created.

Revision ID: 221581cb0472
Revises: e98cb6ebc880
Create Date: 2026-08-17 11:13:25.234062

"""
from typing import Sequence, Union
from alembic import op

revision: str = '221581cb0472'
down_revision: Union[str, Sequence[str], None] = 'e98cb6ebc880'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_payment_member_month",
        "payments",
        ["member_id", "month"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_payment_member_month",
        "payments",
        type_="unique",
    )
