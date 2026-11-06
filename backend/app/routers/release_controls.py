from math import isfinite
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth_dependencies import get_current_user, require_admin
from app.database.connection import get_db
from app.models.external_user_group_membership import ExternalUserGroupMembership
from app.models.flag import Flag
from app.models.targeting_rule import TargetingRule
from app.models.user_group import UserGroup
from app.models.user_group_membership import UserGroupMembership
from app.models.user import User
from app.schemas.release_controls import (
    AddGroupMemberRequest,
    EvaluationRequest,
    EvaluationResponse,
    GroupMemberResponse,
    TargetingRuleCreate,
    TargetingRuleResponse,
    TargetingRuleUpdate,
    UserGroupCreate,
    UserGroupResponse,
    UserGroupUpdate,
)
from app.services.evaluation_service import evaluate_flag
from app.services.history_service import record_audit


router = APIRouter(
    prefix="/api/v1",
    tags=["Release Controls"],
    dependencies=[Depends(require_admin)],
)
evaluation_router = APIRouter(
    prefix="/api/v1",
    tags=["Evaluations"],
    dependencies=[Depends(get_current_user)],
)


def _validate_rule_payload(values: dict[str, Any]) -> TargetingRuleCreate:
    try:
        return TargetingRuleCreate.model_validate(values)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_context=False)) from error


def _validate_rule_references(
    db: Session,
    flag_id: int,
    payload: TargetingRuleCreate,
) -> None:
    flag = db.get(Flag, flag_id)
    if flag is None:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    valid_result = {
        "boolean": isinstance(payload.result, bool),
        "string": isinstance(payload.result, str),
        "number": (
            isinstance(payload.result, (int, float))
            and not isinstance(payload.result, bool)
            and isfinite(payload.result)
        ),
        "json": True,
    }[flag.type]
    if not valid_result:
        raise HTTPException(
            status_code=422,
            detail=f"Rule result must match flag type '{flag.type}'",
        )
    if payload.rule_type == "user_group" and db.get(UserGroup, payload.value) is None:
        raise HTTPException(status_code=404, detail="User group not found")


def _group_response(group: UserGroup) -> UserGroupResponse:
    members = sorted(
        group.external_memberships,
        key=lambda membership: (membership.user_key.casefold(), membership.id),
    )
    return UserGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        created_at=group.created_at,
        member_count=len(members),
        members=[
            GroupMemberResponse(id=member.id, user_key=member.user_key)
            for member in members
        ],
    )


@router.get(
    "/flags/{flag_id}/targeting-rules",
    response_model=list[TargetingRuleResponse],
)
def list_targeting_rules(flag_id: int, db: Session = Depends(get_db)) -> list[TargetingRule]:
    if db.get(Flag, flag_id) is None:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    return list(
        db.scalars(
            select(TargetingRule)
            .where(TargetingRule.flag_id == flag_id)
            .order_by(TargetingRule.priority, TargetingRule.id)
        ).all()
    )


@router.post(
    "/flags/{flag_id}/targeting-rules",
    response_model=TargetingRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_targeting_rule(
    flag_id: int,
    payload: TargetingRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TargetingRule:
    if db.get(Flag, flag_id) is None:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    _validate_rule_references(db, flag_id, payload)
    rule = TargetingRule(flag_id=flag_id, **payload.model_dump())
    db.add(rule)
    db.flush()
    record_audit(
        db,
        current_user.id,
        "targeting_rule.created",
        after_value={
            "rule_id": rule.id,
            "rule_type": rule.rule_type,
            "priority": rule.priority,
        },
        flag_id=flag_id,
    )
    db.commit()
    db.refresh(rule)
    return rule


@router.put(
    "/targeting-rules/{rule_id}",
    response_model=TargetingRuleResponse,
)
def update_targeting_rule(
    rule_id: int,
    payload: TargetingRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TargetingRule:
    rule = db.get(TargetingRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Targeting rule not found")
    before_value = {
        "rule_id": rule.id,
        "rule_type": rule.rule_type,
        "operator": rule.operator,
        "attribute": rule.attribute,
        "value": rule.value,
        "result": rule.result,
        "priority": rule.priority,
        "is_active": rule.is_active,
    }
    values = {
        "rule_type": rule.rule_type,
        "operator": rule.operator,
        "attribute": rule.attribute,
        "value": rule.value,
        "result": rule.result,
        "priority": rule.priority,
        "is_active": rule.is_active,
    }
    values.update(payload.model_dump(exclude_unset=True))
    validated = _validate_rule_payload(values)
    _validate_rule_references(db, rule.flag_id, validated)
    for field, value in validated.model_dump().items():
        setattr(rule, field, value)
    record_audit(
        db,
        current_user.id,
        "targeting_rule.updated",
        before_value=before_value,
        after_value={
            "rule_id": rule.id,
            "rule_type": rule.rule_type,
            "operator": rule.operator,
            "attribute": rule.attribute,
            "value": rule.value,
            "result": rule.result,
            "priority": rule.priority,
            "is_active": rule.is_active,
        },
        flag_id=rule.flag_id,
    )
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/targeting-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_targeting_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    rule = db.get(TargetingRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Targeting rule not found")
    record_audit(
        db,
        current_user.id,
        "targeting_rule.deleted",
        before_value={
            "rule_id": rule.id,
            "rule_type": rule.rule_type,
            "priority": rule.priority,
        },
        flag_id=rule.flag_id,
    )
    db.execute(delete(TargetingRule).where(TargetingRule.id == rule_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/user-groups", response_model=list[UserGroupResponse])
def list_user_groups(db: Session = Depends(get_db)) -> list[UserGroupResponse]:
    groups = db.scalars(
        select(UserGroup)
        .options(selectinload(UserGroup.external_memberships))
        .order_by(UserGroup.name, UserGroup.id)
    ).all()
    return [_group_response(group) for group in groups]


@router.post(
    "/user-groups",
    response_model=UserGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user_group(
    payload: UserGroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserGroupResponse:
    group = UserGroup(**payload.model_dump())
    db.add(group)
    try:
        db.flush()
        record_audit(
            db,
            current_user.id,
            "user_group.created",
            after_value={
                "group_id": group.id,
                "name": group.name,
                "description": group.description,
            },
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="A group with this name already exists") from error
    group = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group.id)
        .options(selectinload(UserGroup.external_memberships))
    )
    if group is None:
        raise HTTPException(status_code=500, detail="Created user group could not be reloaded")
    return _group_response(group)


@router.put("/user-groups/{group_id}", response_model=UserGroupResponse)
def update_user_group(
    group_id: int,
    payload: UserGroupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserGroupResponse:
    group = db.get(UserGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    before_value = {
        "group_id": group.id,
        "name": group.name,
        "description": group.description,
    }
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, field, value)
    try:
        record_audit(
            db,
            current_user.id,
            "user_group.updated",
            before_value=before_value,
            after_value={
                "group_id": group.id,
                "name": group.name,
                "description": group.description,
            },
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="A group with this name already exists") from error
    group = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group_id)
        .options(selectinload(UserGroup.external_memberships))
    )
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    return _group_response(group)


@router.delete("/user-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_group(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    group = db.get(UserGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    if db.scalar(
        select(TargetingRule.id).where(
            TargetingRule.rule_type == "user_group",
            TargetingRule.value == group_id,
        )
    ) is not None:
        raise HTTPException(
            status_code=409,
            detail="Remove targeting rules that use this group before deleting it",
        )
    record_audit(
        db,
        current_user.id,
        "user_group.deleted",
        before_value={
            "group_id": group.id,
            "name": group.name,
            "description": group.description,
        },
    )
    db.execute(
        delete(UserGroupMembership).where(UserGroupMembership.group_id == group_id)
    )
    db.execute(
        delete(ExternalUserGroupMembership).where(
            ExternalUserGroupMembership.group_id == group_id
        )
    )
    db.delete(group)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/user-groups/{group_id}/members",
    response_model=UserGroupResponse,
)
def add_user_group_member(
    group_id: int,
    payload: AddGroupMemberRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserGroupResponse:
    group = db.get(UserGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    if db.scalar(
        select(ExternalUserGroupMembership.id).where(
            ExternalUserGroupMembership.group_id == group_id,
            ExternalUserGroupMembership.user_key == payload.user_key,
        )
    ) is not None:
        raise HTTPException(status_code=409, detail="External user is already in this group")
    membership = ExternalUserGroupMembership(
        group_id=group_id, user_key=payload.user_key
    )
    db.add(membership)
    try:
        db.flush()
        record_audit(
            db,
            current_user.id,
            "user_group.member_added",
            after_value={
                "group_id": group_id,
                "membership_id": membership.id,
                "user_key": membership.user_key,
            },
        )
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="External user is already in this group") from error
    updated = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group_id)
        .options(
            selectinload(UserGroup.external_memberships)
        )
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="User group not found")
    return _group_response(updated)


@router.delete(
    "/user-groups/{group_id}/members/{membership_id}",
    response_model=UserGroupResponse,
)
def remove_user_group_member(
    group_id: int,
    membership_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserGroupResponse:
    group = db.get(UserGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="User group not found")
    membership = db.scalar(
        select(ExternalUserGroupMembership).where(
            ExternalUserGroupMembership.group_id == group_id,
            ExternalUserGroupMembership.id == membership_id,
        )
    )
    if membership is None:
        raise HTTPException(status_code=404, detail="Group membership not found")
    record_audit(
        db,
        current_user.id,
        "user_group.member_removed",
        before_value={
            "group_id": group_id,
            "membership_id": membership.id,
            "user_key": membership.user_key,
        },
    )
    db.delete(membership)
    db.commit()
    updated = db.scalar(
        select(UserGroup)
        .where(UserGroup.id == group_id)
        .options(
            selectinload(UserGroup.external_memberships)
        )
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="User group not found")
    return _group_response(updated)


@evaluation_router.post("/evaluations", response_model=EvaluationResponse)
def evaluate_feature(
    payload: EvaluationRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    result = evaluate_flag(
        db,
        flag_key=payload.flag_key,
        environment_name=payload.environment,
        user_key=payload.user_key,
        attributes=payload.attributes,
    )
    db.commit()
    return result
