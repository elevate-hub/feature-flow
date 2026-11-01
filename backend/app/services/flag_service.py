from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.environment import Environment
from app.models.flag import Flag
from app.schemas.flags import FlagCreate, FlagUpdate


def create_flag(db: Session, payload: FlagCreate, created_by: int) -> Flag:
    if db.get(Environment, payload.environment_id) is None:
        raise HTTPException(status_code=404, detail="Environment not found")
    if db.scalar(
        select(Flag.id).where(
            Flag.environment_id == payload.environment_id, Flag.key == payload.key
        )
    ) is not None:
        raise HTTPException(
            status_code=409, detail="A flag with this key already exists in the environment"
        )

    flag = Flag(**payload.model_dump(), created_by=created_by)
    db.add(flag)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Flag conflicts with existing data"
        ) from error
    db.refresh(flag)
    return flag


def list_flags(db: Session) -> list[Flag]:
    return list(db.scalars(select(Flag).order_by(Flag.id)).all())


def get_flag(db: Session, flag_id: int) -> Flag:
    flag = db.get(Flag, flag_id)
    if flag is None:
        raise HTTPException(status_code=404, detail="Flag not found")
    return flag


def update_flag(db: Session, flag_id: int, payload: FlagUpdate) -> Flag:
    flag = get_flag(db, flag_id)
    updates = payload.model_dump(exclude_unset=True)
    values: dict[str, Any] = {
        "key": flag.key,
        "type": flag.type,
        "default_value": flag.default_value,
        "environment_id": flag.environment_id,
        "enabled": flag.enabled,
        "description": flag.description,
    }
    values.update(updates)
    validated = FlagCreate.model_validate(values)

    if db.get(Environment, validated.environment_id) is None:
        raise HTTPException(status_code=404, detail="Environment not found")
    duplicate = db.scalar(
        select(Flag.id).where(
            Flag.environment_id == validated.environment_id,
            Flag.key == validated.key,
            Flag.id != flag.id,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409, detail="A flag with this key already exists in the environment"
        )

    for field, value in validated.model_dump().items():
        setattr(flag, field, value)
    flag.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Flag conflicts with existing data"
        ) from error
    db.refresh(flag)
    return flag


def delete_flag(db: Session, flag_id: int) -> None:
    get_flag(db, flag_id)
    try:
        db.execute(delete(Flag).where(Flag.id == flag_id))
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Flag cannot be deleted while referenced"
        ) from error


def list_environment_flags(db: Session, environment_id: int) -> list[Flag]:
    if db.get(Environment, environment_id) is None:
        raise HTTPException(status_code=404, detail="Environment not found")
    return list(
        db.scalars(
            select(Flag)
            .where(Flag.environment_id == environment_id)
            .order_by(Flag.id)
        ).all()
    )
