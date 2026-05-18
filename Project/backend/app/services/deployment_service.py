from uuid import UUID
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session

from app import models as orm
from app import schemas


def get_deployments(db: Session, version_id: Optional[UUID] = None, skip: int = 0, limit: int = 100):
    q = db.query(orm.DeploymentState)
    if version_id:
        q = q.filter(orm.DeploymentState.version_id == version_id)
    return q.order_by(orm.DeploymentState.created_at.desc()).offset(skip).limit(limit).all()


def get_deployment(db: Session, deployment_id: UUID) -> Optional[orm.DeploymentState]:
    return db.query(orm.DeploymentState).filter(orm.DeploymentState.id == deployment_id).first()


def create_deployment(db: Session, payload: schemas.DeploymentStateCreate) -> orm.DeploymentState:
    db_deployment = orm.DeploymentState(**payload.model_dump())
    db.add(db_deployment)
    db.commit()
    db.refresh(db_deployment)
    return db_deployment


def update_deployment(db: Session, deployment_id: UUID, payload: schemas.DeploymentStateUpdate) -> Optional[orm.DeploymentState]:
    db_deployment = get_deployment(db, deployment_id)
    if not db_deployment:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_deployment, field, value)
    db.commit()
    db.refresh(db_deployment)
    return db_deployment


def stop_deployment(db: Session, deployment_id: UUID) -> Optional[orm.DeploymentState]:
    db_deployment = get_deployment(db, deployment_id)
    if not db_deployment:
        return None
    db_deployment.status = orm.DeploymentStatus.stopped
    db_deployment.stopped_at = datetime.utcnow()
    db.commit()
    db.refresh(db_deployment)
    return db_deployment


def delete_deployment(db: Session, deployment_id: UUID) -> bool:
    db_deployment = get_deployment(db, deployment_id)
    if not db_deployment:
        return False
    db.delete(db_deployment)
    db.commit()
    return True
