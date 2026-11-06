from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.auth_dependencies import require_admin
from app.database.connection import get_db
from app.models.audit_log import AuditLog
from app.models.environment import Environment
from app.models.evaluation_stat import EvaluationStat
from app.models.flag import Flag
from app.models.flag_version import FlagVersion


router = APIRouter(
    prefix="/api/v1",
    tags=["Workspace"],
    dependencies=[Depends(require_admin)],
)


@router.get("/analytics")
def get_analytics(
    environment_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    if environment_id is not None and db.get(Environment, environment_id) is None:
        raise HTTPException(status_code=404, detail="Environment not found")

    flags_query = select(
        func.count(Flag.id),
        func.sum(case((Flag.enabled.is_(True), 1), else_=0)),
    )
    if environment_id is not None:
        flags_query = flags_query.where(Flag.environment_id == environment_id)
    total_flags, enabled_flags = db.execute(flags_query).one()

    start_date = date.today() - timedelta(days=6)
    stats_query = select(
        EvaluationStat.date,
        func.sum(EvaluationStat.evaluation_count),
        func.sum(EvaluationStat.true_count),
        func.sum(EvaluationStat.false_count),
    ).where(EvaluationStat.date >= start_date)
    if environment_id is not None:
        stats_query = stats_query.where(
            EvaluationStat.environment_id == environment_id
        )
    daily_stats = db.execute(
        stats_query.group_by(EvaluationStat.date).order_by(EvaluationStat.date)
    ).all()
    series = [
        {
            "date": day.isoformat(),
            "evaluations": int(evaluations or 0),
            "true": int(true_count or 0),
            "false": int(false_count or 0),
        }
        for day, evaluations, true_count, false_count in daily_stats
    ]
    evaluations = sum(item["evaluations"] for item in series)
    true_count = sum(item["true"] for item in series)
    false_count = sum(item["false"] for item in series)
    boolean_evaluations = true_count + false_count

    return {
        "total_flags": int(total_flags or 0),
        "enabled_flags": int(enabled_flags or 0),
        "evaluations": evaluations,
        "true_rate": (
            true_count / boolean_evaluations * 100
            if boolean_evaluations
            else None
        ),
        "series": series,
        "range_start": start_date.isoformat(),
        "range_end": date.today().isoformat(),
    }


@router.get("/activity")
def list_activity(
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    entries = db.scalars(
        select(AuditLog)
        .options(selectinload(AuditLog.user), selectinload(AuditLog.flag))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": entry.id,
            "action": entry.action,
            "actor": entry.user.name if entry.user is not None else "System",
            "flag_key": (
                entry.flag.key
                if entry.flag is not None
                else entry.before_value.get("key")
                if isinstance(entry.before_value, dict)
                else None
            ),
            "before_value": entry.before_value,
            "after_value": entry.after_value,
            "created_at": entry.created_at,
        }
        for entry in entries
    ]


@router.get("/flags/{flag_id}/versions")
def list_flag_versions(
    flag_id: int,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    if db.get(Flag, flag_id) is None:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    versions = db.scalars(
        select(FlagVersion)
        .where(FlagVersion.flag_id == flag_id)
        .order_by(FlagVersion.version_number.desc())
    ).all()
    return [
        {
            "id": version.id,
            "version_number": version.version_number,
            "configuration": version.configuration,
            "created_at": version.created_at,
        }
        for version in versions
    ]
