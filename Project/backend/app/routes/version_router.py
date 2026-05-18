from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services import version_service

router = APIRouter(prefix="/versions", tags=["Versions"])


@router.get("/", response_model=list[schemas.ModelVersionResponse])
def list_versions(
    model_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return version_service.get_versions(db, model_id=model_id, skip=skip, limit=limit)


@router.get("/{version_id}", response_model=schemas.ModelVersionResponse)
def get_version(version_id: UUID, db: Session = Depends(get_db)):
    db_version = version_service.get_version(db, version_id)
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
    return db_version


@router.post("/", response_model=schemas.ModelVersionResponse, status_code=201)
def create_version(payload: schemas.ModelVersionCreate, db: Session = Depends(get_db)):
    return version_service.create_version(db, payload)


@router.patch("/{version_id}", response_model=schemas.ModelVersionResponse)
def update_version(version_id: UUID, payload: schemas.ModelVersionUpdate, db: Session = Depends(get_db)):
    db_version = version_service.update_version(db, version_id, payload)
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
    return db_version


@router.patch(
    "/{version_id}/activate",
    response_model=schemas.ModelVersionResponse,
    responses={404: {"description": "Version not found"}},
    summary="Activate a version (deactivates all others for the same model)",
)
def activate_version(version_id: UUID, db: Session = Depends(get_db)):
    db_version = version_service.activate_version(db, version_id)
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
    return db_version


@router.post(
    "/{version_id}/rollback",
    response_model=schemas.ModelVersionResponse,
    responses={404: {"description": "Version not found"}},
    summary="Rollback to a specific version (deactivates current active version)",
)
def rollback_version(version_id: UUID, db: Session = Depends(get_db)):
    db_version = version_service.rollback_version(db, version_id)
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
    return db_version


@router.delete("/{version_id}", status_code=204)
def delete_version(version_id: UUID, db: Session = Depends(get_db)):
    deleted = version_service.delete_version(db, version_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Version not found")
