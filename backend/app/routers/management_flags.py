from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.auth_dependencies import require_admin
from app.database.connection import get_db
from app.models.flag import Flag
from app.models.user import User
from app.schemas.flags import FlagCreate, FlagResponse, FlagUpdate
from app.services import flag_service


router = APIRouter(prefix="/api/v1/flags", tags=["Feature Flag Management"])


@router.post("", response_model=FlagResponse, status_code=status.HTTP_201_CREATED)
def create_flag(
    payload: FlagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Flag:
    return flag_service.create_flag(db, payload, current_user.id)


@router.get("", response_model=list[FlagResponse])
def list_flags(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[Flag]:
    return flag_service.list_flags(db)


@router.get("/{flag_id}", response_model=FlagResponse)
def get_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Flag:
    return flag_service.get_flag(db, flag_id)


@router.put("/{flag_id}", response_model=FlagResponse)
def update_flag(
    flag_id: int,
    payload: FlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Flag:
    return flag_service.update_flag(db, flag_id, payload)


@router.delete("/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Response:
    flag_service.delete_flag(db, flag_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
