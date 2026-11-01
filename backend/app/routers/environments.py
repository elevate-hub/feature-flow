from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth_dependencies import require_admin
from app.database.connection import get_db
from app.models.environment import Environment
from app.models.flag import Flag
from app.models.user import User
from app.schemas.environments import (
    EnvironmentCreate,
    EnvironmentResponse,
    EnvironmentUpdate,
)
from app.schemas.flags import FlagResponse
from app.services import environment_service, flag_service


router = APIRouter(prefix="/api/v1/environments", tags=["Environments"])


@router.post(
    "", response_model=EnvironmentResponse, status_code=status.HTTP_201_CREATED
)
def create_environment(
    payload: EnvironmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Environment:
    return environment_service.create_environment(db, payload)


@router.get("", response_model=list[EnvironmentResponse])
def list_environments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[Environment]:
    return environment_service.list_environments(db)


@router.get("/{environment_id}", response_model=EnvironmentResponse)
def get_environment(
    environment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Environment:
    return environment_service.get_environment(db, environment_id)


@router.put("/{environment_id}", response_model=EnvironmentResponse)
def update_environment(
    environment_id: int,
    payload: EnvironmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Environment:
    return environment_service.update_environment(db, environment_id, payload)


@router.delete("/{environment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_environment(
    environment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    environment_service.delete_environment(db, environment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{environment_id}/flags", response_model=list[FlagResponse])
def list_environment_flags(
    environment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[Flag]:
    return flag_service.list_environment_flags(db, environment_id)
