from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.flag import Flag
from app.models.flag_version import FlagVersion


def flag_configuration(flag: Flag) -> dict[str, Any]:
    return {
        "key": flag.key,
        "type": flag.type,
        "default_value": flag.default_value,
        "environment_id": flag.environment_id,
        "enabled": flag.enabled,
        "rollout_percentage": flag.rollout_percentage,
        "description": flag.description,
    }


def record_flag_change(
    db: Session,
    flag: Flag,
    user_id: int | None,
    action: str,
    before_value: dict[str, Any] | None = None,
) -> None:
    configuration = flag_configuration(flag)
    if action != "flag.deleted":
        latest_version = db.scalar(
            select(func.max(FlagVersion.version_number)).where(
                FlagVersion.flag_id == flag.id
            )
        )
        db.add(
            FlagVersion(
                flag_id=flag.id,
                version_number=(latest_version or 0) + 1,
                configuration=configuration,
                created_by=user_id,
            )
        )
    db.add(
        AuditLog(
            user_id=user_id,
            flag_id=flag.id,
            action=action,
            before_value=before_value,
            after_value=None if action == "flag.deleted" else configuration,
        )
    )


def record_audit(
    db: Session,
    user_id: int | None,
    action: str,
    before_value: dict[str, Any] | None = None,
    after_value: dict[str, Any] | None = None,
    flag_id: int | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            flag_id=flag_id,
            action=action,
            before_value=before_value,
            after_value=after_value,
        )
    )
