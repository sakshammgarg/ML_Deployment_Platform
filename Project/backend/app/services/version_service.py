import os
import shutil
from datetime import datetime
from pathlib import Path
from uuid import UUID
from typing import Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app import models as orm
from app import schemas


STORAGE_DIR = Path(__file__).resolve().parents[2] / "models_storage"
ALLOWED_EXTENSION = ".pkl"


def get_versions(db: Session, model_id: Optional[UUID] = None, skip: int = 0, limit: int = 100):
    q = db.query(orm.ModelVersion)
    if model_id:
        q = q.filter(orm.ModelVersion.model_id == model_id)
    return q.offset(skip).limit(limit).all()


def get_version(db: Session, version_id: UUID) -> Optional[orm.ModelVersion]:
    return db.query(orm.ModelVersion).filter(orm.ModelVersion.id == version_id).first()


def create_version(db: Session, payload: schemas.ModelVersionCreate) -> orm.ModelVersion:
    db_version = orm.ModelVersion(**payload.model_dump())
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version


def update_version(db: Session, version_id: UUID, payload: schemas.ModelVersionUpdate) -> Optional[orm.ModelVersion]:
    db_version = get_version(db, version_id)
    if not db_version:
        return None
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_version, field, value)
    db.commit()
    db.refresh(db_version)
    return db_version


def delete_version(db: Session, version_id: UUID) -> bool:
    db_version = get_version(db, version_id)
    if not db_version:
        return False
    db.delete(db_version)
    db.commit()
    return True


def activate_version(db: Session, version_id: UUID) -> Optional[orm.ModelVersion]:
    """
    Atomically activate a version.
    - Deactivates all other versions of the same model.
    - Activates the selected version.
    - Upserts model_deployment_pointer so there is always exactly one
      active-version pointer row per model.
    """
    db_version = get_version(db, version_id)
    if not db_version:
        return None
    try:
        # 1. Deactivate every version of this model
        db.query(orm.ModelVersion).filter(
            orm.ModelVersion.model_id == db_version.model_id
        ).update({"is_active": False}, synchronize_session="fetch")

        # 2. Activate the target version
        db_version.is_active = True

        # 3. Upsert model_deployment_pointer
        pointer = (
            db.query(orm.ModelDeploymentPointer)
            .filter(orm.ModelDeploymentPointer.model_id == db_version.model_id)
            .first()
        )
        if pointer:
            pointer.active_version_id = db_version.id
            pointer.updated_at = datetime.utcnow()
        else:
            pointer = orm.ModelDeploymentPointer(
                model_id=db_version.model_id,
                active_version_id=db_version.id,
                updated_at=datetime.utcnow(),
            )
            db.add(pointer)

        db.commit()
        db.refresh(db_version)
    except Exception:
        db.rollback()
        raise
    return db_version


def rollback_version(db: Session, version_id: UUID) -> Optional[orm.ModelVersion]:
    """
    Rollback to a specific version.
    - Finds the currently active version for the same model and deactivates it.
    - Activates the requested version.
    - Only one active version per model at any time.
    - Atomic: rolls back DB changes on any error.
    """
    target = get_version(db, version_id)
    if not target:
        return None
    try:
        # Find the currently active version (may be None or same as target)
        current_active = (
            db.query(orm.ModelVersion)
            .filter(
                orm.ModelVersion.model_id == target.model_id,
                orm.ModelVersion.is_active.is_(True),
            )
            .first()
        )
        if current_active and current_active.id != target.id:
            print(
                f"[rollback] Deactivating version {current_active.id} "
                f"(tag={current_active.version_tag}) "
                f"→ activating version {target.id} (tag={target.version_tag})"
            )
        else:
            print(
                f"[rollback] Activating version {target.id} (tag={target.version_tag})"
            )
        # Deactivate all, then activate target — same atomicity guarantee as activate_version
        db.query(orm.ModelVersion).filter(
            orm.ModelVersion.model_id == target.model_id
        ).update({"is_active": False}, synchronize_session="fetch")
        target.is_active = True

        # FIX #13: Update ModelDeploymentPointer so inference routing reflects the rollback
        pointer = (
            db.query(orm.ModelDeploymentPointer)
            .filter(orm.ModelDeploymentPointer.model_id == target.model_id)
            .first()
        )
        if pointer:
            pointer.active_version_id = target.id
            pointer.updated_at = datetime.utcnow()
        else:
            pointer = orm.ModelDeploymentPointer(
                model_id=target.model_id,
                active_version_id=target.id,
                updated_at=datetime.utcnow(),
            )
            db.add(pointer)

        db.commit()
        db.refresh(target)
    except Exception:
        db.rollback()
        raise
    return target


def _next_version_number(db: Session, model_id: UUID) -> int:
    """Return the next sequential version number for a model (1-indexed)."""
    count = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == model_id)
        .count()
    )
    return count + 1


def version_tag_exists(db: Session, model_id: UUID, version_tag: str) -> bool:
    return (
        db.query(orm.ModelVersion)
        .filter(
            orm.ModelVersion.model_id == model_id,
            orm.ModelVersion.version_tag == version_tag,
        )
        .first()
        is not None
    )


def upload_version(
    db: Session,
    model_id: UUID,
    version_tag: str,
    file: UploadFile,
    metrics: Optional[dict] = None,
    hyperparameters: Optional[dict] = None,
) -> orm.ModelVersion:
    """
    Validate file, persist it under models_storage/, and create a DB row.
    Raises ValueError for validation failures (caught by the route layer).
    """
    # 1. Validate model exists
    db_model = db.query(orm.MLModel).filter(orm.MLModel.id == model_id).first()
    if not db_model:
        raise ValueError("model_not_found")

    # 2. Validate file extension
    filename = file.filename or ""
    ext = Path(filename).suffix.lower()
    if ext != ALLOWED_EXTENSION:
        raise ValueError(f"invalid_extension:{ext}")

    # 3. Prevent duplicate version tags for same model
    if version_tag_exists(db, model_id, version_tag):
        raise ValueError(f"duplicate_version_tag:{version_tag}")

    # 4. Build storage filename and path
    version_number = _next_version_number(db, model_id)
    storage_filename = f"{model_id}_v{version_number}{ALLOWED_EXTENSION}"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest_path = STORAGE_DIR / storage_filename

    # 5. Save file to disk
    try:
        with dest_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
    finally:
        file.file.close()

    # FIX #11: Validate the pkl can be loaded — catch corrupt files at upload time
    try:
        import joblib as _joblib
        test_artifact = _joblib.load(dest_path)
    except Exception as exc:
        dest_path.unlink(missing_ok=True)
        raise ValueError(f"invalid_pkl_file:{exc}")

    # FIX #2: Compute accuracy on upload using iris benchmark dataset
    computed_accuracy = None
    try:
        import numpy as _np
        from sklearn.datasets import load_iris as _load_iris
        from sklearn.metrics import accuracy_score as _accuracy_score
        iris = _load_iris()
        X_test, y_test = iris.data, iris.target
        if isinstance(test_artifact, dict) and "model" in test_artifact and "scaler" in test_artifact:
            X_scaled = test_artifact["scaler"].transform(X_test)
            preds = test_artifact["model"].predict(X_scaled)
        else:
            preds = test_artifact.predict(X_test)
        computed_accuracy = float(_accuracy_score(y_test, preds))
    except Exception:
        computed_accuracy = None  # not an iris model or incompatible shape — skip

    # Merge computed accuracy into metrics
    final_metrics = dict(metrics) if metrics else {}
    if computed_accuracy is not None:
        final_metrics["accuracy"] = computed_accuracy

    # 6. Create DB record
    db_version = orm.ModelVersion(
        model_id=model_id,
        version_tag=version_tag,
        artifact_path=str(dest_path),
        metrics=final_metrics,
        hyperparameters=hyperparameters or {},
        input_schema={},
        output_schema={},
        is_active=False,
    )
    db.add(db_version)
    db.commit()
    db.refresh(db_version)
    return db_version
