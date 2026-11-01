from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.environment import Environment
from app.models.flag import Flag
from app.schemas.environments import EnvironmentCreate, EnvironmentUpdate


def create_environment(db: Session, payload: EnvironmentCreate) -> Environment:
    environment = Environment(**payload.model_dump())
    db.add(environment)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Environment name already exists") from error
    db.refresh(environment)
    return environment


def list_environments(db: Session) -> list[Environment]:
    return list(db.scalars(select(Environment).order_by(Environment.id)).all())


def get_environment(db: Session, environment_id: int) -> Environment:
    environment = db.get(Environment, environment_id)
    if environment is None:
        raise HTTPException(status_code=404, detail="Environment not found")
    return environment


def update_environment(
    db: Session, environment_id: int, payload: EnvironmentUpdate
) -> Environment:
    environment = get_environment(db, environment_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(environment, field, value)
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(status_code=409, detail="Environment name already exists") from error
    db.refresh(environment)
    return environment


def delete_environment(db: Session, environment_id: int) -> None:
    environment = get_environment(db, environment_id)
    if db.scalar(select(Flag.id).where(Flag.environment_id == environment_id)) is not None:
        raise HTTPException(
            status_code=409,
            detail="Environment cannot be deleted while feature flags reference it",
        )
    try:
        db.execute(delete(Environment).where(Environment.id == environment.id))
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Environment cannot be deleted while referenced"
        ) from error
