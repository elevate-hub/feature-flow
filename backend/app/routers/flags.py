from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.services.evaluation_service import evaluate_flag

router = APIRouter(
    prefix="/flags",
    tags=["Feature Flags"],
)


@router.get("/{flag_key}")
def get_flag_value(
    flag_key: str,
    environment: str = "development",
    db: Session = Depends(get_db),
):
    result = evaluate_flag(
        db=db,
        flag_key=flag_key,
        environment_name=environment,
    )

    if result["reason"] == "FLAG_NOT_FOUND":
        raise HTTPException(
            status_code=404,
            detail=result,
        )

    return result