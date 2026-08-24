"""
Audit service — reusable log_action() helper.

Rules:
- Never log passwords, hashed passwords, JWTs, API tokens,
  database URLs, or any secrets.
- Always call from within an active SQLAlchemy session.
- Safe to call even if db is None (logs a warning and returns).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    *,
    username: Optional[str],
    action: str,
    module: str,
    description: str,
) -> None:
    """
    Insert one AuditLog row into the database.

    Parameters
    ----------
    db          : Active SQLAlchemy session (will commit the log entry).
    username    : Username of the actor (None for system/anonymous actions).
    action      : Short verb, e.g. "LOGIN", "CREATE", "UPDATE", "DELETE",
                  "EXPORT", "IMPORT", "SEND_REMINDER", "PASSWORD_CHANGE".
    module      : The module/domain, e.g. "Auth", "Members", "Payments",
                  "Attendance", "Batches", "Users", "Notifications",
                  "Export", "Import".
    description : Human-readable summary — must NOT contain secrets.
    """
    if db is None:
        logger.warning("log_action called with db=None; skipping audit entry.")
        return

    # Truncate to fit column constraints (action=50, module=50)
    action      = str(action)[:50]
    module      = str(module)[:50]
    description = str(description)[:2000]   # Text column; 2000 chars is generous

    try:
        entry = AuditLog(
            username=username,
            action=action,
            module=module,
            description=description,
        )
        db.add(entry)
        db.flush()   # Write within current transaction but don't commit yet;
                     # callers commit their own transaction so both the primary
                     # operation and the audit row succeed or fail together.
    except Exception:
        logger.exception(
            "Failed to write audit log [%s / %s] for user '%s'",
            module,
            action,
            username,
        )
        # Never let an audit failure crash a real operation
        db.rollback()
