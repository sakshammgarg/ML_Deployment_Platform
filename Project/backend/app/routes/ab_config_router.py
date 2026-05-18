from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services import ab_config_service

router = APIRouter(prefix="/ab-configs", tags=["A/B Configs"])


@router.get("/", response_model=list[schemas.ABConfigResponse])
def list_ab_configs(
    model_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return ab_config_service.get_ab_configs(db, model_id=model_id, skip=skip, limit=limit)


@router.get("/{config_id}", response_model=schemas.ABConfigResponse)
def get_ab_config(config_id: UUID, db: Session = Depends(get_db)):
    db_config = ab_config_service.get_ab_config(db, config_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="A/B config not found")
    return db_config


@router.post("/", response_model=schemas.ABConfigResponse, status_code=201)
def create_ab_config(payload: schemas.ABConfigCreate, db: Session = Depends(get_db)):
    return ab_config_service.create_ab_config(db, payload)


@router.patch("/{config_id}", response_model=schemas.ABConfigResponse)
def update_ab_config(config_id: UUID, payload: schemas.ABConfigUpdate, db: Session = Depends(get_db)):
    db_config = ab_config_service.update_ab_config(db, config_id, payload)
    if not db_config:
        raise HTTPException(status_code=404, detail="A/B config not found")
    return db_config


@router.delete("/{config_id}", status_code=204)
def delete_ab_config(config_id: UUID, db: Session = Depends(get_db)):
    deleted = ab_config_service.delete_ab_config(db, config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="A/B config not found")
