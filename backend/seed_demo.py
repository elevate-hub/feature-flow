import argparse
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database.connection import SessionLocal
from app.models.environment import Environment
from app.models.evaluation_stat import EvaluationStat
from app.models.external_user_group_membership import ExternalUserGroupMembership
from app.models.flag import Flag
from app.models.targeting_rule import TargetingRule
from app.models.user_group import UserGroup
from app.services.history_service import record_audit, record_flag_change


ENVIRONMENTS = (
    ("Development", "Local development releases"),
    ("Staging", "Pre-production validation"),
    ("Production", "Customer-facing releases"),
    ("Testing", "Automated and manual test runs"),
)
GROUP_NAMES = (
    ("Internal Team", "FeatureFlow demonstration staff"),
    ("Beta Testers", "External users opted into previews"),
    ("Premium Users", "Demonstration premium cohort"),
    ("New Users", "Demonstration recently registered cohort"),
    ("QA Team", "Demonstration quality assurance cohort"),
)
FLAGS = (
    ("dark_mode", True, 100),
    ("new_checkout", False, 5),
    ("new_dashboard", True, 100),
    ("payment_gateway_v2", False, 20),
    ("search_optimization", True, 50),
    ("signup_button_redesign", False, 0),
    ("new_user_onboarding", True, 25),
    ("recommendation_engine", False, 10),
    ("advanced_analytics", True, 35),
    ("beta_notifications", False, 40),
)
GROUP_MEMBERS = {
    "Internal Team": ("demo-user-internal-001", "demo-user-internal-002"),
    "Beta Testers": ("demo-user-beta-001", "demo-user-beta-002"),
    "Premium Users": ("demo-user-premium-001", "demo-user-premium-002"),
    "New Users": ("demo-user-new-001", "demo-user-new-002"),
    "QA Team": ("demo-user-qa-001", "demo-user-qa-002"),
}


def _environment(
    db: Session, name: str, description: str
) -> tuple[Environment, bool]:
    existing = db.scalar(
        select(Environment).where(func.lower(Environment.name) == name.casefold())
    )
    if existing is not None:
        return existing, False
    environment = Environment(name=name, description=description)
    db.add(environment)
    db.flush()
    record_audit(
        db,
        None,
        "demo.environment_created",
        after_value={"id": environment.id, "name": name},
    )
    return environment, True


def _group(db: Session, name: str, description: str) -> UserGroup:
    group = db.scalar(
        select(UserGroup).where(func.lower(UserGroup.name) == name.casefold())
    )
    if group is not None:
        return group
    group = UserGroup(name=name, description=description)
    db.add(group)
    db.flush()
    record_audit(
        db,
        None,
        "demo.user_group_created",
        after_value={"group_id": group.id, "name": name},
    )
    return group


def _seed_flag(
    db: Session,
    environment: Environment,
    key: str,
    default_value: bool,
    rollout_percentage: int,
) -> tuple[Flag, bool]:
    existing = db.scalar(
        select(Flag).where(
            Flag.environment_id == environment.id,
            Flag.key == key,
        )
    )
    if existing is not None:
        return existing, False
    enabled = key not in {"signup_button_redesign", "recommendation_engine"}
    flag = Flag(
        environment_id=environment.id,
        key=key,
        type="boolean",
        default_value=default_value,
        enabled=enabled,
        rollout_percentage=rollout_percentage,
        description=f"Development demo flag for {key.replace('_', ' ')}.",
    )
    db.add(flag)
    db.flush()
    record_flag_change(db, flag, None, "demo.flag_created")
    return flag, True


def _seed_rules(db: Session, flags: dict[tuple[int, str], Flag], groups: dict[str, UserGroup]) -> None:
    onboarding = next(
        (
            flag
            for (_, key), flag in flags.items()
            if key == "new_user_onboarding"
        ),
        None,
    )
    notifications = next(
        (
            flag
            for (_, key), flag in flags.items()
            if key == "beta_notifications"
        ),
        None,
    )
    rules = [
        (
            onboarding,
            "user",
            "equals",
            None,
            "demo-user-new-001",
            True,
            1,
        ),
        (
            notifications,
            "user_group",
            "in_group",
            None,
            groups["Beta Testers"].id,
            True,
            2,
        ),
    ]
    for flag, rule_type, operator, attribute, value, result, priority in rules:
        if flag is None:
            continue
        exists = db.scalar(
            select(TargetingRule.id).where(
                TargetingRule.flag_id == flag.id,
                TargetingRule.rule_type == rule_type,
                TargetingRule.priority == priority,
            )
        )
        if exists is not None:
            continue
        rule = TargetingRule(
            flag_id=flag.id,
            rule_type=rule_type,
            operator=operator,
            attribute=attribute,
            value=value,
            result=result,
            priority=priority,
            is_active=True,
        )
        db.add(rule)
        db.flush()
        record_audit(
            db,
            None,
            "demo.targeting_rule_created",
            after_value={"rule_id": rule.id, "rule_type": rule.rule_type},
            flag_id=flag.id,
        )


def _seed_statistics(db: Session, flags: dict[tuple[int, str], Flag]) -> None:
    for index, flag in enumerate(flags.values()):
        for days_ago in range(6, -1, -1):
            stat_date = date.today() - timedelta(days=days_ago)
            exists = db.scalar(
                select(EvaluationStat.id).where(
                    EvaluationStat.flag_id == flag.id,
                    EvaluationStat.environment_id == flag.environment_id,
                    EvaluationStat.date == stat_date,
                    EvaluationStat.hour == 12,
                )
            )
            if exists is not None:
                continue
            true_count = (index + days_ago) % 17
            false_count = (index * 2 + days_ago) % 23
            db.add(
                EvaluationStat(
                    flag_id=flag.id,
                    environment_id=flag.environment_id,
                    date=stat_date,
                    hour=12,
                    evaluation_count=true_count + false_count,
                    true_count=true_count,
                    false_count=false_count,
                )
            )


def seed_demo_data(db: Session) -> None:
    environments = {
        name: _environment(db, name, description)[0]
        for name, description in ENVIRONMENTS
    }
    groups = {
        name: _group(db, name, description)
        for name, description in GROUP_NAMES
    }

    for name, group in groups.items():
        for user_key in GROUP_MEMBERS[name]:
            membership = db.scalar(
                select(ExternalUserGroupMembership.id).where(
                    ExternalUserGroupMembership.group_id == group.id,
                    ExternalUserGroupMembership.user_key == user_key,
                )
            )
            if membership is not None:
                continue
            db.add(
                ExternalUserGroupMembership(
                    group_id=group.id,
                    user_key=user_key,
                )
            )
            record_audit(
                db,
                None,
                "demo.group_member_added",
                after_value={"group_id": group.id, "user_key": user_key},
            )

    flags: dict[tuple[int, str], Flag] = {}
    for environment in environments.values():
        for key, default_value, rollout_percentage in FLAGS:
            flag, _ = _seed_flag(
                db,
                environment,
                key,
                default_value,
                rollout_percentage,
            )
            flags[(environment.id, key)] = flag

    _seed_rules(db, flags, groups)
    _seed_statistics(db, flags)
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed repeatable development-only FeatureFlow demonstration data."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="confirm intentional insertion of missing demo records",
    )
    args = parser.parse_args()
    if settings.APP_ENV not in {"development", "demo"}:
        parser.error("APP_ENV must be development or demo; production seeding is disabled")
    if not args.apply:
        parser.error("pass --apply to insert missing demo records")

    with SessionLocal() as db:
        seed_demo_data(db)
    print("Demo data seeded. Existing environments, flags, groups, and users were preserved.")


if __name__ == "__main__":
    main()
