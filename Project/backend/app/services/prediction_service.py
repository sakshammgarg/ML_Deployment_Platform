from uuid import UUID
from typing import Optional
from sqlalchemy.orm import Session

from app import models as orm
from app import schemas

import pickle
import numpy as np
import time
from fastapi import HTTPException


def get_predictions(
    db: Session,
    version_id: Optional[UUID] = None,
    skip: int = 0,
    limit: int = 100,
):
    q = db.query(orm.Prediction)
    if version_id:
        q = q.filter(orm.Prediction.version_id == version_id)
    return q.order_by(orm.Prediction.created_at.desc()).offset(skip).limit(limit).all()


def get_prediction(db: Session, prediction_id: UUID) -> Optional[orm.Prediction]:
    return db.query(orm.Prediction).filter(orm.Prediction.id == prediction_id).first()


def create_prediction(db: Session, payload: schemas.PredictionCreate) -> orm.Prediction:
    # ── 1. Resolve version ──────────────────────────────────────────────────────
    db_version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.id == payload.version_id)
        .first()
    )
    if not db_version:
        raise HTTPException(status_code=404, detail="Version not found")
    if not db_version.is_active:
        raise HTTPException(
            status_code=400,
            detail=f"Version '{db_version.version_tag}' is not active. "
                   "Activate it before running inference.",
        )

    # ── 2. Load artifact from disk ──────────────────────────────────────────────
    try:
        with open(db_version.artifact_path, "rb") as f:
            artifact = pickle.load(f)
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"Model artifact not found at path: {db_version.artifact_path}",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load model artifact: {exc}",
        )

    # ── 3. Validate artifact structure ──────────────────────────────────────────
    if not isinstance(artifact, dict):
        raise HTTPException(
            status_code=500,
            detail=(
                "Artifact format invalid: expected a dict with keys "
                "'model', 'scaler', 'feature_names'."
            ),
        )
    missing_keys = {"model", "scaler", "feature_names"} - artifact.keys()
    if missing_keys:
        raise HTTPException(
            status_code=500,
            detail=f"Artifact missing required keys: {sorted(missing_keys)}",
        )

    model = artifact["model"]
    scaler = artifact["scaler"]
    feature_names: list[str] = artifact["feature_names"]

    # ── 4. Validate input features ──────────────────────────────────────────────
    missing_features = set(feature_names) - set(payload.request_payload.keys())
    if missing_features:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Request payload missing required features: {sorted(missing_features)}. "
                f"Expected: {feature_names}"
            ),
        )

    # ── 5. Run inference ────────────────────────────────────────────────────────
    response_payload: Optional[dict] = None
    error_message: Optional[str] = None
    status_code: int = 200
    latency_ms: float = 0.0

    try:
        # Order values by feature_names to guarantee column alignment with the model
        feature_values = [float(payload.request_payload[f]) for f in feature_names]
        X_raw = np.array(feature_values, dtype=float).reshape(1, -1)

        t0 = time.perf_counter()
        X_scaled = scaler.transform(X_raw)
        raw_result = model.predict(X_scaled)
        latency_ms = round((time.perf_counter() - t0) * 1000, 4)

        # Coerce numpy types so JSON serialiser is happy
        response_payload = {"prediction": raw_result.tolist()}
    except Exception as exc:
        status_code = 500
        error_message = str(exc)

    # ── 6. Persist and return ───────────────────────────────────────────────────
    db_prediction = orm.Prediction(
        version_id=payload.version_id,
        request_payload=payload.request_payload,
        client_id=payload.client_id,
        response_payload=response_payload,
        latency_ms=latency_ms,
        status_code=status_code,
        error_message=error_message,
    )
    db.add(db_prediction)
    db.commit()
    db.refresh(db_prediction)
    return db_prediction


def delete_prediction(db: Session, prediction_id: UUID) -> bool:
    db_prediction = get_prediction(db, prediction_id)
    if not db_prediction:
        return False
    db.delete(db_prediction)
    db.commit()
    return True
