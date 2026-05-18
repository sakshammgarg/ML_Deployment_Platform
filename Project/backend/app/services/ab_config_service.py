from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session

from app import models as orm
from app import schemas


def get_ab_configs(db: Session, model_id: Optional[UUID] = None, skip: int = 0, limit: int = 100):
    q = db.query(orm.ABConfig)
    if model_id:
        q = q.filter(orm.ABConfig.model_id == model_id)
    return q.offset(skip).limit(limit).all()


def get_ab_config(db: Session, config_id: UUID) -> Optional[orm.ABConfig]:
    return db.query(orm.ABConfig).filter(orm.ABConfig.id == config_id).first()


def create_ab_config(db: Session, payload: schemas.ABConfigCreate) -> orm.ABConfig:
    db_config = orm.ABConfig(**payload.model_dump())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config


def update_ab_config(db: Session, config_id: UUID, payload: schemas.ABConfigUpdate) -> Optional[orm.ABConfig]:
    db_config = get_ab_config(db, config_id)
    if not db_config:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_config, field, value)
    db.commit()
    db.refresh(db_config)
    return db_config


def delete_ab_config(db: Session, config_id: UUID) -> bool:
    db_config = get_ab_config(db, config_id)
    if not db_config:
        return False
    db.delete(db_config)
    db.commit()
    return True
