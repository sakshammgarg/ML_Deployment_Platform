from __future__ import annotations

import random
import time
from typing import Any
from uuid import UUID

import joblib
import numpy as np
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import models as orm

# ── In-process model cache: keyed by version UUID ───────────────────────────
_model_cache: dict[UUID, Any] = {}


def _weighted_random_choice(split: dict[str, float]) -> UUID:
    """
    Unbiased weighted random version selection.

    - Accepts arbitrary weight magnitudes (normalizes internally via random.choices).
    - Does not depend on dict ordering (snapshot via list(split.items())).
    - No manual cumulative logic. No threshold code.
    - Validates: non-empty, all weights > 0, total > 0.
    """
    if not split:
        raise ValueError("traffic_split is empty")

    items = list(split.items())            # stable snapshot, order-independent
    version_ids = [UUID(k) for k, _ in items]
    weights     = [float(w) for _, w in items]

    if any(w <= 0 for w in weights):
        bad = [k for k, w in items if float(w) <= 0]
        raise ValueError(f"All weights must be > 0; offending version IDs: {bad}")

    total = sum(weights)
    if total <= 0:
        raise ValueError(f"Sum of weights must be > 0, got {total}")

    # random.choices normalises weights internally — no manual math required
    return random.choices(version_ids, weights=weights, k=1)[0]


def resolve_version_id(model_id: UUID, db: Session) -> UUID:
    """
    Strict routing order:
      a) Active AB config  → validated weighted random (arbitrary weight scale)
      b) Deployment pointer → fallback when no AB config is active
    Raises HTTPException on every failure path. No silent fallbacks.
    """
    # ── a) Active AB config ───────────────────────────────────────────────────
    ab_config = (
        db.query(orm.ABConfig)
        .filter(
            orm.ABConfig.model_id == model_id,
            orm.ABConfig.is_active.is_(True),
        )
        .first()
    )

    if ab_config is not None:
        raw_split: dict = ab_config.traffic_split or {}

        if not raw_split:
            raise HTTPException(
                status_code=500,
                detail=f"AB config '{ab_config.id}' has an empty traffic_split.",
            )

        # Coerce all weights to float and validate positivity
        try:
            split = {k: float(v) for k, v in raw_split.items()}
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"AB config '{ab_config.id}' contains non-numeric weights: {exc}",
            )

        if any(w <= 0 for w in split.values()):
            bad = [k for k, w in split.items() if w <= 0]
            raise HTTPException(
                status_code=500,
                detail=(
                    f"AB config '{ab_config.id}' has non-positive weights for "
                    f"version IDs: {bad}. All weights must be > 0."
                ),
            )

        # Validate each version exists and belongs to this model
        version_id_strs = list(split.keys())
        db_versions = (
            db.query(orm.ModelVersion)
            .filter(
                orm.ModelVersion.id.in_(version_id_strs),
                orm.ModelVersion.model_id == model_id,
            )
            .all()
        )
        found_ids = {str(v.id) for v in db_versions}
        missing = set(version_id_strs) - found_ids
        if missing:
            raise HTTPException(
                status_code=500,
                detail=(
                    f"AB config '{ab_config.id}' references unknown or unowned "
                    f"version IDs: {sorted(missing)}."
                ),
            )

        try:
            return _weighted_random_choice(split)
        except ValueError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"AB config '{ab_config.id}' routing error: {exc}",
            )

    # ── b) Fallback: deployment pointer ──────────────────────────────────────
    pointer = (
        db.query(orm.ModelDeploymentPointer)
        .filter(orm.ModelDeploymentPointer.model_id == model_id)
        .first()
    )
    if not pointer:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No active deployment found for model '{model_id}'. "
                "Activate a version first via PATCH /versions/{version_id}/activate."
            ),
        )
    return pointer.active_version_id


def predict_for_model(
    db: Session,
    model_id: UUID,
    request_payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Full inference pipeline for POST /predict/{model_id}.

    1. Resolve version_id (A/B config → deployment pointer)
    2. Fetch artifact_path from versions table
    3. Load model via joblib (cached in _model_cache, loaded once per process)
    4. Run prediction, measure latency
    5. Log to predictions table — always executes regardless of inference outcome
    6. Return { prediction, version_id, latency_ms }
    """
    # ── 1. Resolve version ────────────────────────────────────────────────────
    version_id: UUID = resolve_version_id(model_id, db)

    # ── 2. Fetch version for artifact_path ───────────────────────────────────
    db_version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.id == version_id)
        .first()
    )
    if not db_version:
        raise HTTPException(
            status_code=500,
            detail=f"Resolved version {version_id} no longer exists in the database.",
        )

    # ── 3. Load model (cached per version_id) ─────────────────────────────────
    if version_id not in _model_cache:
        try:
            _model_cache[version_id] = joblib.load(db_version.artifact_path)
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail=f"Artifact file not found: {db_version.artifact_path}",
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to load model artifact: {exc}",
            )

    artifact = _model_cache[version_id]

    # ── 4. Run prediction ─────────────────────────────────────────────────────
    # Extract optional ground-truth label before building feature matrix.
    # We read it with .get() — never pop — so request_payload is stored intact.
    actual_label: int | None = None
    try:
        raw_label = request_payload.get("actual_label")
        if raw_label is not None:
            actual_label = int(raw_label)
    except (TypeError, ValueError):
        actual_label = None  # malformed label is silently ignored

    response_payload: dict | None = None
    error_message: str | None = None
    status_code: int = 200
    latency_ms: float = 0.0

    try:
        if isinstance(artifact, dict):
            for key in ("model", "scaler", "feature_names"):
                if key not in artifact:
                    raise ValueError(f"Artifact missing required key: '{key}'")

            feature_names: list[str] = artifact["feature_names"]
            # Exclude actual_label from feature set regardless of whether it
            # appears in feature_names — it is metadata, not an input feature.
            features_only = {
                k: v for k, v in request_payload.items() if k != "actual_label"
            }
            missing_features = set(feature_names) - set(features_only.keys())
            if missing_features:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Request payload missing features: {sorted(missing_features)}. "
                        f"Expected: {feature_names}"
                    ),
                )
            X = np.array(
                [float(features_only[f]) for f in feature_names], dtype=float
            ).reshape(1, -1)
            # FIX #14: t0 before scaler transform to capture full pipeline latency
            t0 = time.perf_counter()
            X_scaled = artifact["scaler"].transform(X)
            raw = artifact["model"].predict(X_scaled)
        else:
            # Plain model: exclude actual_label key from feature values
            feature_vals = [
                v for k, v in request_payload.items() if k != "actual_label"
            ]
            X = np.array(feature_vals, dtype=float).reshape(1, -1)
            t0 = time.perf_counter()
            raw = artifact.predict(X)

        latency_ms = round((time.perf_counter() - t0) * 1000, 4)
        # Normalize prediction shape:
        #   shape (1,)    → tolist() = [v]     → [0] = v  (scalar)
        #   shape (1, n)  → tolist() = [[...]] → [0] = [...] (list)
        # raw_list[0] handles both correctly since input is always 1 sample.
        raw_list = raw.tolist()
        response_payload = {"prediction": raw_list[0]}

        # FIX #1: Extract confidence via predict_proba when available
        confidence: float | None = None
        try:
            if isinstance(artifact, dict) and hasattr(artifact.get("model"), "predict_proba"):
                proba = artifact["model"].predict_proba(X_scaled)
                confidence = float(max(proba[0]))
            elif not isinstance(artifact, dict) and hasattr(artifact, "predict_proba"):
                proba = artifact.predict_proba(X)
                confidence = float(max(proba[0]))
        except Exception:
            confidence = None  # silently ignore proba failures
        response_payload["confidence"] = confidence

    except HTTPException:
        raise  # 422 for bad input — skip prediction logging
    except Exception as exc:
        status_code = 500
        error_message = str(exc)

    # ── 5. Log to predictions table (always) ──────────────────────────────────
    db_prediction = orm.Prediction(
        version_id=version_id,
        request_payload=request_payload,
        response_payload=response_payload,
        latency_ms=latency_ms,
        status_code=status_code,
        error_message=error_message,
        actual_label=actual_label,
    )
    db.add(db_prediction)
    db.commit()

    # ── 6. Return ─────────────────────────────────────────────────────────────
    return {
        "prediction": response_payload["prediction"] if response_payload else None,
        "version_id": str(version_id),
        "latency_ms": latency_ms,
        "confidence": response_payload.get("confidence") if response_payload else None,  # FIX #1
    }
