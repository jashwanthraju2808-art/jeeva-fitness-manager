import os
from dotenv import load_dotenv

load_dotenv()
import sys
from logging.config import fileConfig
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool
from alembic import context

# ── Load .env so DATABASE_URL is available ─────────────────
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

# ── Put backend/ on sys.path so app.* imports work ─────────
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# ── Alembic config object ───────────────────────────────────
config = context.config

# Override sqlalchemy.url from environment (set in .env)
BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")
database_url = os.getenv("DATABASE_URL")

if not database_url:
    raise RuntimeError("DATABASE_URL is not set")

config.set_main_option("sqlalchemy.url", database_url)

# Set up logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Import all models so autogenerate can detect them ───────
from app.database.base import Base
from app.models.batch import Batch              # noqa: E402, F401
from app.models.member import Member            # noqa: E402, F401
from app.models.payment import Payment          # noqa: E402, F401
from app.models.attendance import Attendance    # noqa: E402, F401
from app.models.user import User                # noqa: E402, F401
from app.models.audit_log import AuditLog      # noqa: E402, F401

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
