from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth_dependencies import get_current_user, require_admin
from app.database.connection import get_db
from app.models.flag import Flag
from app.models.user import User
from app.schemas.flags import FlagCreate, FlagResponse, FlagUpdate
from app.services import flag_service


router = APIRouter(
    prefix="/api/v1/flags",
    tags=["Feature Flag Management"],
    dependencies=[Depends(require_admin)],
)


@router.post("", response_model=FlagResponse, status_code=status.HTTP_201_CREATED)
def create_flag(
    payload: FlagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Flag:
    return flag_service.create_flag(db, payload, current_user.id)


@router.get("", response_model=list[FlagResponse])
def list_flags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Flag]:
    return flag_service.list_flags(db)


@router.get("/{flag_id}", response_model=FlagResponse)
def get_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Flag:
    return flag_service.get_flag(db, flag_id)


@router.put("/{flag_id}", response_model=FlagResponse)
def update_flag(
    flag_id: int,
    payload: FlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Flag:
    return flag_service.update_flag(db, flag_id, payload, current_user.id)


@router.delete("/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    flag_service.delete_flag(db, flag_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
