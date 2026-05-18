from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session

from app import models as orm
from app import schemas


def get_models(db: Session, skip: int = 0, limit: int = 100) -> list[orm.MLModel]:
    return db.query(orm.MLModel).offset(skip).limit(limit).all()


def get_model(db: Session, model_id: UUID) -> Optional[orm.MLModel]:
    return db.query(orm.MLModel).filter(orm.MLModel.id == model_id).first()


def get_model_by_name(db: Session, name: str) -> Optional[orm.MLModel]:
    return db.query(orm.MLModel).filter(orm.MLModel.name == name).first()


def create_model(db: Session, payload: schemas.MLModelCreate) -> orm.MLModel:
    db_model = orm.MLModel(**payload.model_dump())
    db.add(db_model)
    db.commit()
    db.refresh(db_model)
    return db_model


def update_model(db: Session, model_id: UUID, payload: schemas.MLModelUpdate) -> Optional[orm.MLModel]:
    db_model = get_model(db, model_id)
    if not db_model:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_model, field, value)
    db.commit()
    db.refresh(db_model)
    return db_model


def delete_model(db: Session, model_id: UUID) -> bool:
    db_model = get_model(db, model_id)
    if not db_model:
        return False
    db.delete(db_model)
    db.commit()
    return True
