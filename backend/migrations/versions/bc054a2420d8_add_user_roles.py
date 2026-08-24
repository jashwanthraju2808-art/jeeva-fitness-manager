from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "bc054a2420d8"
down_revision: Union[str, Sequence[str], None] = "3e86cef2291e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "role",
            sa.String(length=20),
            nullable=False,
            server_default="staff",
        ),
    )

    # Make the existing admin account an admin.
    op.execute(
        "UPDATE users SET role = 'admin' WHERE username = 'admin'"
    )


def downgrade() -> None:
    op.drop_column("users", "role")