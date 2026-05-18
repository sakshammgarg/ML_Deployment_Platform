from uuid import UUID
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import inference_service

router = APIRouter(prefix="/predict", tags=["Inference"])


@router.post(
    "/{model_id}",
    summary="Run inference on the currently deployed version of a model",
    responses={
        400: {"description": "No active deployment found for this model"},
        422: {"description": "Request payload missing required features"},
        500: {"description": "Model load or inference error"},
    },
)
def predict(
    model_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return inference_service.predict_for_model(
        db=db,
        model_id=model_id,
        request_payload=payload,
    )
