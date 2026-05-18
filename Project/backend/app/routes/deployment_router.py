from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services import deployment_service

router = APIRouter(prefix="/deployments", tags=["Deployments"])


@router.get("/", response_model=list[schemas.DeploymentStateResponse])
def list_deployments(
    version_id: Optional[UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return deployment_service.get_deployments(db, version_id=version_id, skip=skip, limit=limit)


@router.get("/{deployment_id}", response_model=schemas.DeploymentStateResponse)
def get_deployment(deployment_id: UUID, db: Session = Depends(get_db)):
    db_deployment = deployment_service.get_deployment(db, deployment_id)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return db_deployment


@router.post("/", response_model=schemas.DeploymentStateResponse, status_code=201)
def create_deployment(payload: schemas.DeploymentStateCreate, db: Session = Depends(get_db)):
    return deployment_service.create_deployment(db, payload)


@router.patch("/{deployment_id}", response_model=schemas.DeploymentStateResponse)
def update_deployment(deployment_id: UUID, payload: schemas.DeploymentStateUpdate, db: Session = Depends(get_db)):
    db_deployment = deployment_service.update_deployment(db, deployment_id, payload)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return db_deployment


@router.post("/{deployment_id}/stop", response_model=schemas.DeploymentStateResponse)
def stop_deployment(deployment_id: UUID, db: Session = Depends(get_db)):
    db_deployment = deployment_service.stop_deployment(db, deployment_id)
    if not db_deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return db_deployment


@router.delete("/{deployment_id}", status_code=204)
def delete_deployment(deployment_id: UUID, db: Session = Depends(get_db)):
    deleted = deployment_service.delete_deployment(db, deployment_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Deployment not found")
