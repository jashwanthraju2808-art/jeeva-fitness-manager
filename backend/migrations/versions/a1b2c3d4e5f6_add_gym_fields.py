"""add_gym_fields

Adds gym-specific fields to the members table and payment_method to payments.
All new columns are nullable for full backward compatibility with existing data.

Revision ID: a1b2c3d4e5f6
Revises: 221581cb0472
Create Date: 2026-08-18 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '221581cb0472'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Members — gym-specific fields ─────────────────────
    op.add_column('members', sa.Column('gender',               sa.String(10),  nullable=True))
    op.add_column('members', sa.Column('emergency_contact',    sa.String(100), nullable=True))
    op.add_column('members', sa.Column('trainer',              sa.String(100), nullable=True))
    op.add_column('members', sa.Column('membership_type',      sa.String(20),  nullable=True))
    op.add_column('members', sa.Column('membership_start_date',sa.Date(),      nullable=True))
    op.add_column('members', sa.Column('membership_expiry_date',sa.Date(),     nullable=True))
    op.add_column('members', sa.Column('fitness_goal',         sa.String(50),  nullable=True))
    op.add_column('members', sa.Column('freeze_start_date',    sa.Date(),      nullable=True))
    op.add_column('members', sa.Column('freeze_end_date',      sa.Date(),      nullable=True))
    op.add_column('members', sa.Column('freeze_reason',        sa.Text(),      nullable=True))

    # ── Payments — payment method ──────────────────────────
    op.add_column('payments', sa.Column('payment_method', sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column('payments', 'payment_method')
    op.drop_column('members', 'freeze_reason')
    op.drop_column('members', 'freeze_end_date')
    op.drop_column('members', 'freeze_start_date')
    op.drop_column('members', 'fitness_goal')
    op.drop_column('members', 'membership_expiry_date')
    op.drop_column('members', 'membership_start_date')
    op.drop_column('members', 'membership_type')
    op.drop_column('members', 'trainer')
    op.drop_column('members', 'emergency_contact')
    op.drop_column('members', 'gender')
