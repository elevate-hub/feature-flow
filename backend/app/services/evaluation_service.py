
import hashlib
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.environment import Environment
from app.models.evaluation_stat import EvaluationStat
from app.models.external_user_group_membership import ExternalUserGroupMembership
from app.models.flag import Flag
from app.models.targeting_rule import TargetingRule


def evaluate_flag(
    db: Session,
    flag_key: str,
    environment_name: str,
    user_key: str | None = None,
    attributes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve one environment-specific flag and record its observed outcome."""
    flag = db.scalar(
        select(Flag)
        .join(Environment, Flag.environment_id == Environment.id)
        .where(Flag.key == flag_key, Environment.name == environment_name)
    )
    if flag is None:
        return {
            "flag_key": flag_key,
            "environment": environment_name,
            "value": None,
            "reason": "FLAG_NOT_FOUND",
        }

    if not flag.enabled:
        result = {
            "flag_key": flag_key,
            "environment": environment_name,
            "value": False,
            "reason": "FLAG_DISABLED",
        }
    else:
        context = attributes or {}
        rules = db.scalars(
            select(TargetingRule)
            .where(
                TargetingRule.flag_id == flag.id,
                TargetingRule.is_active.is_(True),
            )
            .order_by(TargetingRule.priority, TargetingRule.id)
        ).all()

        result = None
        for rule in rules:
            if rule.rule_type == "user" and _matches_rule(
                db, rule, context, user_key
            ):
                result = {
                    "flag_key": flag_key,
                    "environment": environment_name,
                    "value": rule.result,
                    "reason": "USER_RULE_MATCH",
                    "rule_id": rule.id,
                }
                break

        if result is None:
            for rule in rules:
                if rule.rule_type == "attribute" and _matches_rule(
                    db, rule, context, user_key
                ):
                    result = {
                        "flag_key": flag_key,
                        "environment": environment_name,
                        "value": rule.result,
                        "reason": "USER_RULE_MATCH",
                        "rule_id": rule.id,
                    }
                    break

        if result is None:
            for rule in rules:
                if rule.rule_type == "user_group" and _matches_rule(
                    db, rule, context, user_key
                ):
                    result = {
                        "flag_key": flag_key,
                        "environment": environment_name,
                        "value": rule.result,
                        "reason": "GROUP_RULE_MATCH",
                        "rule_id": rule.id,
                    }
                    break

        if result is None:
            rollout_percentage = flag.rollout_percentage
            rollout_bucket: int | None = None
            if 0 < rollout_percentage < 100 and user_key is None:
                result = {
                    "flag_key": flag_key,
                    "environment": environment_name,
                    "value": None,
                    "reason": "MISSING_CONTEXT",
                }
            elif rollout_percentage < 100:
                if user_key is not None:
                    digest = hashlib.sha256(
                        f"{flag.key}:{user_key}".encode()
                    ).digest()
                    rollout_bucket = int.from_bytes(digest[:8], "big") % 100
                    value = (
                        flag.default_value
                        if rollout_bucket < rollout_percentage
                        else False if flag.type == "boolean" else None
                    )
                else:
                    value = False if flag.type == "boolean" else None
                result = {
                    "flag_key": flag_key,
                    "environment": environment_name,
                    "value": value,
                    "reason": "PERCENTAGE_ROLLOUT",
                    **(
                        {"rollout_bucket": rollout_bucket}
                        if rollout_bucket is not None
                        else {}
                    ),
                }
            else:
                result = {
                    "flag_key": flag_key,
                    "environment": environment_name,
                    "value": flag.default_value,
                    "reason": "DEFAULT_VALUE",
                }

    _record_evaluation(db, flag, result["value"])
    return result


def _record_evaluation(db: Session, flag: Flag, value: Any) -> None:
    now = datetime.now(timezone.utc)
    counts = {
        "evaluation_count": 1,
        "true_count": int(value is True),
        "false_count": int(value is False),
    }
    values = {
        "flag_id": flag.id,
        "environment_id": flag.environment_id,
        "date": now.date(),
        "hour": now.hour,
        **counts,
    }
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        insert_statement = postgresql_insert(EvaluationStat).values(**values)
    elif dialect == "sqlite":
        insert_statement = sqlite_insert(EvaluationStat).values(**values)
    else:
        stat = db.scalar(
            select(EvaluationStat).where(
                EvaluationStat.flag_id == flag.id,
                EvaluationStat.environment_id == flag.environment_id,
                EvaluationStat.date == now.date(),
                EvaluationStat.hour == now.hour,
            )
        )
        if stat is None:
            db.add(EvaluationStat(**values))
            return
        stat.evaluation_count += 1
        stat.true_count += counts["true_count"]
        stat.false_count += counts["false_count"]
        return

    statement = insert_statement.on_conflict_do_update(
        index_elements=[
            EvaluationStat.flag_id,
            EvaluationStat.environment_id,
            EvaluationStat.date,
            EvaluationStat.hour,
        ],
        set_={
            column: getattr(EvaluationStat, column) + increment
            for column, increment in counts.items()
        },
    )
    db.execute(statement)


def _matches_rule(
    db: Session,
    rule: TargetingRule,
    attributes: dict[str, Any],
    user_key: str | None,
) -> bool:
    if rule.rule_type == "user":
        return user_key is not None and user_key == rule.value
    if rule.rule_type == "user_group":
        if user_key is None:
            return False
        return db.scalar(
            select(ExternalUserGroupMembership.id).where(
                ExternalUserGroupMembership.user_key == user_key,
                ExternalUserGroupMembership.group_id == rule.value,
            )
        ) is not None

    actual = attributes.get(rule.attribute or "")
    expected = rule.value
    if rule.operator == "equals":
        return actual == expected
    if rule.operator == "not_equals":
        return actual != expected
    if rule.operator == "contains":
        if isinstance(actual, str):
            return isinstance(expected, str) and expected in actual
        if isinstance(actual, (list, tuple, set)):
            return expected in actual
        if isinstance(actual, dict):
            return isinstance(expected, (str, int, float, bool, type(None))) and expected in actual
        return False
    if rule.operator == "in":
        return isinstance(expected, (list, tuple, set)) and actual in expected
    if rule.operator == "greater_than":
        return (
            isinstance(actual, (int, float))
            and not isinstance(actual, bool)
            and isinstance(expected, (int, float))
            and not isinstance(expected, bool)
            and actual > expected
        )
    if rule.operator == "less_than":
        return (
            isinstance(actual, (int, float))
            and not isinstance(actual, bool)
            and isinstance(expected, (int, float))
            and not isinstance(expected, bool)
            and actual < expected
        )
    if rule.operator == "is_set":
        return actual is not None
    if rule.operator == "is_not_set":
        return actual is None
    return False
