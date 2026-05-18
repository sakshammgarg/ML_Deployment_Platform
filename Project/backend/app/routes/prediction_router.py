from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services import prediction_service

router = APIRouter(prefix="/predictions", tags=["Predictions"])


@router.get("/", response_model=list[schemas.PredictionResponse])
def list_predictions(
    version_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return prediction_service.get_predictions(db, version_id=version_id, skip=skip, limit=limit)


@router.get("/{prediction_id}", response_model=schemas.PredictionResponse)
def get_prediction(prediction_id: UUID, db: Session = Depends(get_db)):
    db_prediction = prediction_service.get_prediction(db, prediction_id)
    if not db_prediction:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return db_prediction


@router.post("/", response_model=schemas.PredictionResponse, status_code=201)
def create_prediction(payload: schemas.PredictionCreate, db: Session = Depends(get_db)):
    return prediction_service.create_prediction(db, payload)


@router.delete("/{prediction_id}", status_code=204)
def delete_prediction(prediction_id: UUID, db: Session = Depends(get_db)):
    deleted = prediction_service.delete_prediction(db, prediction_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Prediction not found")
