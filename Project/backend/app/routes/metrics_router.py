from uuid import UUID
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import metrics_service

router = APIRouter(prefix="/metrics", tags=["Metrics"])


@router.get(
    "/{model_id}",
    summary="Aggregated prediction metrics per version for a model",
    responses={
        404: {"description": "Model not found"},
    },
)
def get_metrics(
    model_id: UUID,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return metrics_service.get_model_metrics(db=db, model_id=model_id)
