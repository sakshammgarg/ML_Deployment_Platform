"""
bridge_router.py
================
Adapter layer that bridges the frontend's API contract to the existing backend
services — without touching any existing routes or schemas.

All endpoints are registered BEFORE the existing routers in main.py so that
more-specific paths (e.g. /metrics/summary) take priority over the existing
catch-all /metrics/{model_id}.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models as orm
from app import schemas
from app.services import (
    ab_config_service,
    deployment_service,
    metrics_service,
    model_service,
    version_service,
    inference_service,
)

router = APIRouter(tags=["Bridge"])


# ─────────────────────────────────────────────────────────────────────────────
# Helper utilities
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_deployment(dep: orm.DeploymentState, db: Session) -> dict[str, Any]:
    """Convert a DeploymentState ORM object to the frontend Deployment shape."""
    version = db.query(orm.ModelVersion).filter(orm.ModelVersion.id == dep.version_id).first()
    model_id = str(version.model_id) if version else None
    model = db.query(orm.MLModel).filter(orm.MLModel.id == version.model_id).first() if version else None

    # Derive a sensible traffic_percentage from AB config if present
    traffic_pct = 100
    if model_id:
        ab = (
            db.query(orm.ABConfig)
            .filter(orm.ABConfig.model_id == version.model_id, orm.ABConfig.is_active.is_(True))
            .first()
        )
        if ab and ab.traffic_split:
            weight = ab.traffic_split.get(str(dep.version_id))
            if weight is not None:
                total = sum(float(v) for v in ab.traffic_split.values()) or 1
                traffic_pct = round(float(weight) / total * 100)

    return {
        "id": str(dep.id),
        "model_id": model_id,
        "model_version": version.version_tag if version else None,
        "name": model.name if model else f"deployment-{str(dep.id)[:8]}",
        "status": dep.status.value if dep.status else "stopped",
        "traffic_percentage": traffic_pct,
        "endpoint_url": dep.endpoint_url or "",
        "created_at": dep.created_at.isoformat() if dep.created_at else None,
        "updated_at": dep.updated_at.isoformat() if dep.updated_at else None,
        "last_request_at": None,
        # pass through raw fields too so they're accessible
        "version_id": str(dep.version_id),
        "replicas": dep.replicas,
        "cpu_limit": dep.cpu_limit,
        "memory_limit": dep.memory_limit,
    }


def _ab_config_to_ab_test(cfg: orm.ABConfig, db: Session) -> dict[str, Any]:
    """Map an ABConfig ORM object to the frontend ABTest shape."""
    split = cfg.traffic_split or {}
    version_ids = list(split.keys())
    model_a_id = version_ids[0] if len(version_ids) >= 1 else None
    model_b_id = version_ids[1] if len(version_ids) >= 2 else None

    # Compute traffic percentages
    total = sum(float(v) for v in split.values()) or 100
    model_a_traffic = round(float(split.get(model_a_id, 50)) / total * 100) if model_a_id else 50
    model_b_traffic = 100 - model_a_traffic

    # Map is_active to status
    if cfg.is_active:
        status = "running"
    elif cfg.end_date and cfg.end_date < datetime.utcnow():
        status = "completed"
    else:
        status = "stopped"

    return {
        "id": str(cfg.id),
        "name": cfg.name,
        "description": cfg.description,
        "model_a_id": model_a_id,
        "model_b_id": model_b_id,
        "model_a_traffic": model_a_traffic,
        "model_b_traffic": model_b_traffic,
        "status": status,
        "start_date": cfg.start_date.isoformat() if cfg.start_date else cfg.created_at.isoformat(),
        "end_date": cfg.end_date.isoformat() if cfg.end_date else None,
        "winner_model_id": None,
        "created_at": cfg.created_at.isoformat() if cfg.created_at else None,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
        "is_active": cfg.is_active,
        "model_id": str(cfg.model_id),
    }


def _version_metrics_to_snapshot(
    version_metrics: dict[str, Any],
    model_id: str,
    hours: int = 24,
    db_version=None,
) -> dict[str, Any]:
    """Convert the per-version metrics dict from metrics_service to a MetricsSnapshot.
    FIX #3: Falls back to stored model metrics accuracy when no labeled predictions exist.
    FIX #5: Computes throughput from request count / time window.
    """
    avg_lat = version_metrics.get("avg_latency_ms") or 0.0

    # FIX #3: Accuracy fallback — prediction-based first, then stored metrics
    accuracy = version_metrics.get("accuracy")
    if accuracy is None and db_version is not None and db_version.metrics:
        accuracy = db_version.metrics.get("accuracy")
    if accuracy is None:
        accuracy = 0.0

    # FIX #5: Throughput = requests / window_seconds
    total_requests = version_metrics.get("total_requests", 0)
    window_seconds = hours * 3600
    throughput = round(total_requests / window_seconds, 6) if window_seconds > 0 else 0.0

    return {
        "model_id": model_id,
        "model_version": version_metrics.get("version_tag", ""),
        "version_id": version_metrics.get("version_id", ""),
        "timestamp": version_metrics.get("last_request_time") or datetime.utcnow().isoformat(),
        "accuracy": accuracy,
        "latency_p50": avg_lat,
        "latency_p95": version_metrics.get("max_latency_ms") or avg_lat,
        "latency_p99": version_metrics.get("max_latency_ms") or avg_lat,
        "request_count": total_requests,
        "error_rate": version_metrics.get("error_rate") or 0.0,
        "throughput": throughput,
        # Raw extras
        "avg_latency_ms": avg_lat,
        "min_latency_ms": version_metrics.get("min_latency_ms"),
        "max_latency_ms": version_metrics.get("max_latency_ms"),
        "error_count": version_metrics.get("error_count", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Deployments  (bridge over /deployments with frontend-compatible shape)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/deployments/", summary="List deployments (bridge)")
def bridge_list_deployments(db: Session = Depends(get_db)) -> list[dict]:
    deps = deployment_service.get_deployments(db)
    return [_enrich_deployment(d, db) for d in deps]


@router.get("/deployments/{deployment_id}", summary="Get deployment (bridge)")
def bridge_get_deployment(deployment_id: UUID, db: Session = Depends(get_db)) -> dict:
    dep = deployment_service.get_deployment(db, deployment_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return _enrich_deployment(dep, db)


@router.post("/deployments/", status_code=201, summary="Create deployment (bridge)")
def bridge_create_deployment(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict:
    """
    Accepts { model_id, name, traffic_percentage } from frontend.
    Resolves to version_id by finding the latest active (or newest) version of the model.
    """
    model_id_str: str = payload.get("model_id", "")
    if not model_id_str:
        raise HTTPException(status_code=422, detail="model_id is required")

    try:
        model_uuid = UUID(model_id_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid model_id UUID")

    # Find latest active version, else the newest version
    version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == model_uuid, orm.ModelVersion.is_active.is_(True))
        .order_by(orm.ModelVersion.created_at.desc())
        .first()
    )
    if not version:
        version = (
            db.query(orm.ModelVersion)
            .filter(orm.ModelVersion.model_id == model_uuid)
            .order_by(orm.ModelVersion.created_at.desc())
            .first()
        )
    if not version:
        raise HTTPException(
            status_code=404,
            detail="No versions found for model. Upload a version first.",
        )

    create_payload = schemas.DeploymentStateCreate(version_id=version.id)
    dep = deployment_service.create_deployment(db, create_payload)

    # Immediately set to running so frontend sees it live
    update_payload = schemas.DeploymentStateUpdate(
        status=orm.DeploymentStatus.running,
        deployed_at=datetime.utcnow(),
    )
    deployment_service.update_deployment(db, dep.id, update_payload)
    dep = deployment_service.get_deployment(db, dep.id)
    return _enrich_deployment(dep, db)


@router.put("/deployments/{deployment_id}", summary="Update deployment (bridge)")
def bridge_update_deployment(
    deployment_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict:
    """Maps frontend's PUT to backend PATCH."""
    # Map frontend fields to backend schema
    update_data: dict[str, Any] = {}
    if "status" in payload:
        update_data["status"] = payload["status"]
    if "endpoint_url" in payload:
        update_data["endpoint_url"] = payload["endpoint_url"]
    if "replicas" in payload:
        update_data["replicas"] = payload["replicas"]

    if update_data:
        update_payload = schemas.DeploymentStateUpdate(**update_data)
        dep = deployment_service.update_deployment(db, deployment_id, update_payload)
    else:
        dep = deployment_service.get_deployment(db, deployment_id)

    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return _enrich_deployment(dep, db)


@router.post("/deployments/{deployment_id}/activate", summary="Activate deployment (bridge)")
def bridge_activate_deployment(deployment_id: UUID, db: Session = Depends(get_db)) -> dict:
    update_payload = schemas.DeploymentStateUpdate(
        status=orm.DeploymentStatus.running,
        deployed_at=datetime.utcnow(),
    )
    dep = deployment_service.update_deployment(db, deployment_id, update_payload)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return _enrich_deployment(dep, db)


@router.post("/deployments/{deployment_id}/deactivate", summary="Deactivate deployment (bridge)")
def bridge_deactivate_deployment(deployment_id: UUID, db: Session = Depends(get_db)) -> dict:
    update_payload = schemas.DeploymentStateUpdate(
        status=orm.DeploymentStatus.stopped,
        stopped_at=datetime.utcnow(),
    )
    dep = deployment_service.update_deployment(db, deployment_id, update_payload)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")
    return _enrich_deployment(dep, db)


@router.post("/deployments/{deployment_id}/rollback", summary="Rollback deployment (bridge)")
def bridge_rollback_deployment(
    deployment_id: UUID,
    payload: dict[str, Any] = {},
    db: Session = Depends(get_db),
) -> dict:
    """Stop current deployment, create new one from the target version."""
    dep = deployment_service.get_deployment(db, deployment_id)
    if not dep:
        raise HTTPException(status_code=404, detail="Deployment not found")

    # Stop the current deployment
    stop_payload = schemas.DeploymentStateUpdate(
        status=orm.DeploymentStatus.stopped,
        stopped_at=datetime.utcnow(),
    )
    deployment_service.update_deployment(db, deployment_id, stop_payload)

    # Find target version — use version_id from the existing deployment
    version = db.query(orm.ModelVersion).filter(orm.ModelVersion.id == dep.version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found for rollback")

    # Find the previous version of this model
    prev_version = (
        db.query(orm.ModelVersion)
        .filter(
            orm.ModelVersion.model_id == version.model_id,
            orm.ModelVersion.id != version.id,
        )
        .order_by(orm.ModelVersion.created_at.desc())
        .first()
    )
    rollback_version_id = prev_version.id if prev_version else version.id

    # Create new deployment from target version
    new_dep = deployment_service.create_deployment(
        db, schemas.DeploymentStateCreate(version_id=rollback_version_id)
    )
    activate_payload = schemas.DeploymentStateUpdate(
        status=orm.DeploymentStatus.running,
        deployed_at=datetime.utcnow(),
    )
    deployment_service.update_deployment(db, new_dep.id, activate_payload)
    new_dep = deployment_service.get_deployment(db, new_dep.id)
    return _enrich_deployment(new_dep, db)


# ─────────────────────────────────────────────────────────────────────────────
# A/B Tests  (bridge over /ab-configs with frontend-compatible shape)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ab-tests", summary="List A/B tests (bridge)")
def bridge_list_ab_tests(db: Session = Depends(get_db)) -> list[dict]:
    configs = ab_config_service.get_ab_configs(db)
    return [_ab_config_to_ab_test(c, db) for c in configs]


@router.get("/ab-tests/{test_id}/comparison", summary="A/B test comparison metrics (bridge)")
def bridge_ab_test_comparison(test_id: UUID, db: Session = Depends(get_db)) -> dict:
    cfg = ab_config_service.get_ab_config(db, test_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="A/B test not found")

    split = cfg.traffic_split or {}
    version_ids = list(split.keys())
    model_id_str = str(cfg.model_id)

    try:
        raw = metrics_service.get_model_metrics(db, cfg.model_id)
    except HTTPException:
        return {"model_a": [], "model_b": []}

    versions_by_id = {v["version_id"]: v for v in raw.get("versions", [])}

    def _build_snapshots(vid: Optional[str]) -> list[dict]:
        if not vid or vid not in versions_by_id:
            return []
        return [_version_metrics_to_snapshot(versions_by_id[vid], model_id_str)]

    return {
        "model_a": _build_snapshots(version_ids[0] if len(version_ids) >= 1 else None),
        "model_b": _build_snapshots(version_ids[1] if len(version_ids) >= 2 else None),
    }


@router.get("/ab-tests/{test_id}", summary="Get A/B test (bridge)")
def bridge_get_ab_test(test_id: UUID, db: Session = Depends(get_db)) -> dict:
    cfg = ab_config_service.get_ab_config(db, test_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="A/B test not found")
    return _ab_config_to_ab_test(cfg, db)


@router.post("/ab-tests", status_code=201, summary="Create A/B test (bridge)")
def bridge_create_ab_test(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    """
    Accepts { name, description?, model_a_id, model_b_id, model_a_traffic }.
    model_a_id and model_b_id are treated as version IDs.
    Creates a single ABConfig tied to the model that owns model_a_id's version.
    """
    model_a_id: str = payload.get("model_a_id", "")
    model_b_id: str = payload.get("model_b_id", "")
    model_a_traffic: float = float(payload.get("model_a_traffic", 50))
    model_b_traffic: float = 100 - model_a_traffic

    if not model_a_id or not model_b_id:
        raise HTTPException(status_code=422, detail="model_a_id and model_b_id are required")

    # FIX #15: Resolve IDs to version IDs (not model IDs) for traffic_split
    def _resolve_to_version_id(id_str: str) -> tuple[UUID, UUID]:
        """Returns (version_id, model_id). If a model ID is given, picks the latest active version."""
        try:
            uid = UUID(id_str)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid UUID: {id_str}")
        # Try as version first
        ver = db.query(orm.ModelVersion).filter(orm.ModelVersion.id == uid).first()
        if ver:
            return ver.id, ver.model_id
        # Try as model — auto-select latest active version
        mdl = db.query(orm.MLModel).filter(orm.MLModel.id == uid).first()
        if mdl:
            latest = (
                db.query(orm.ModelVersion)
                .filter(orm.ModelVersion.model_id == mdl.id, orm.ModelVersion.is_active.is_(True))
                .order_by(orm.ModelVersion.created_at.desc())
                .first()
            )
            if not latest:
                latest = (
                    db.query(orm.ModelVersion)
                    .filter(orm.ModelVersion.model_id == mdl.id)
                    .order_by(orm.ModelVersion.created_at.desc())
                    .first()
                )
            if not latest:
                raise HTTPException(status_code=404, detail=f"No versions found for model {id_str}")
            return latest.id, mdl.id
        raise HTTPException(status_code=404, detail=f"ID not found: {id_str}")

    version_a_id, model_id = _resolve_to_version_id(model_a_id)
    version_b_id, _ = _resolve_to_version_id(model_b_id)

    # FIX #6: Validate both versions belong to same model (or at minimum exist)
    for vid, label in [(version_a_id, "model_a_id"), (version_b_id, "model_b_id")]:
        ver = db.query(orm.ModelVersion).filter(orm.ModelVersion.id == vid).first()
        if not ver:
            raise HTTPException(status_code=422, detail=f"{label} version {vid} does not exist")

    # Deactivate any stale A/B configs for this model before creating a new one
    stale_configs = (
        db.query(orm.ABConfig)
        .filter(orm.ABConfig.model_id == model_id, orm.ABConfig.is_active.is_(True))
        .all()
    )
    for cfg in stale_configs:
        cfg.is_active = False
    if stale_configs:
        db.commit()

    # Build traffic split using actual version IDs
    traffic_split = {
        str(version_a_id): model_a_traffic,
        str(version_b_id): model_b_traffic,
    }

    create_payload = schemas.ABConfigCreate(
        model_id=model_id,
        name=payload.get("name", "A/B Test"),
        description=payload.get("description"),
        is_active=True,
        traffic_split=traffic_split,
        start_date=datetime.utcnow(),
    )
    cfg = ab_config_service.create_ab_config(db, create_payload)
    return _ab_config_to_ab_test(cfg, db)


@router.put("/ab-tests/{test_id}", summary="Update A/B test (bridge)")
def bridge_update_ab_test(
    test_id: UUID,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
) -> dict:
    update_data: dict[str, Any] = {}
    if "name" in payload:
        update_data["name"] = payload["name"]
    if "description" in payload:
        update_data["description"] = payload["description"]
    if "is_active" in payload:
        update_data["is_active"] = payload["is_active"]
    if "model_a_traffic" in payload:
        cfg = ab_config_service.get_ab_config(db, test_id)
        if cfg and cfg.traffic_split:
            vids = list(cfg.traffic_split.keys())
            a_traffic = float(payload["model_a_traffic"])
            update_data["traffic_split"] = {
                vids[0]: a_traffic,
                vids[1]: 100 - a_traffic,
            } if len(vids) >= 2 else cfg.traffic_split

    update_payload = schemas.ABConfigUpdate(**update_data)
    cfg = ab_config_service.update_ab_config(db, test_id, update_payload)
    if not cfg:
        raise HTTPException(status_code=404, detail="A/B test not found")
    return _ab_config_to_ab_test(cfg, db)


@router.post("/ab-tests/{test_id}/stop", summary="Stop A/B test (bridge)")
def bridge_stop_ab_test(test_id: UUID, db: Session = Depends(get_db)) -> dict:
    update_payload = schemas.ABConfigUpdate(is_active=False, end_date=datetime.utcnow())
    cfg = ab_config_service.update_ab_config(db, test_id, update_payload)
    if not cfg:
        raise HTTPException(status_code=404, detail="A/B test not found")
    return _ab_config_to_ab_test(cfg, db)


@router.delete("/ab-tests/{test_id}", status_code=204, summary="Delete A/B test (bridge)")
def bridge_delete_ab_test(test_id: UUID, db: Session = Depends(get_db)):
    deleted = ab_config_service.delete_ab_config(db, test_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="A/B test not found")


# ─────────────────────────────────────────────────────────────────────────────
# Metrics  (3 missing endpoints)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/metrics/summary", summary="Dashboard summary metrics (bridge)")
def bridge_metrics_summary(db: Session = Depends(get_db)) -> dict:
    """Aggregate across all models for the DashboardSummary shape."""
    all_models = model_service.get_models(db)
    active_deployments = (
        db.query(orm.DeploymentState)
        .filter(orm.DeploymentState.status == orm.DeploymentStatus.running)
        .count()
    )
    running_ab_tests = (
        db.query(orm.ABConfig)
        .filter(orm.ABConfig.is_active.is_(True))
        .count()
    )

    total_requests_today = 0
    accuracy_values: list[float] = []
    latency_values: list[float] = []

    for model in all_models:
        try:
            data = metrics_service.get_model_metrics(db, model.id)
        except HTTPException:
            continue
        for v in data.get("versions", []):
            total_requests_today += v.get("total_requests", 0)
            if v.get("accuracy") is not None:
                accuracy_values.append(v["accuracy"])
            if v.get("avg_latency_ms") is not None:
                latency_values.append(v["avg_latency_ms"])

    avg_accuracy = round(sum(accuracy_values) / len(accuracy_values), 4) if accuracy_values else 0.0
    avg_latency = round(sum(latency_values) / len(latency_values), 4) if latency_values else 0.0

    # Build recent_events from latest deployments / AB configs
    recent_events: list[dict] = []
    recent_deps = (
        db.query(orm.DeploymentState)
        .order_by(orm.DeploymentState.created_at.desc())
        .limit(5)
        .all()
    )
    for dep in recent_deps:
        version = db.query(orm.ModelVersion).filter(orm.ModelVersion.id == dep.version_id).first()
        model_id_str = str(version.model_id) if version else None
        recent_events.append({
            "id": str(dep.id),
            "event_type": "deployment",
            "message": f"Deployment {dep.status.value}",
            "model_id": model_id_str,
            "timestamp": dep.created_at.isoformat(),
            "severity": "success" if dep.status == orm.DeploymentStatus.running else "info",
        })

    return {
        "total_models": len(all_models),
        "active_deployments": active_deployments,
        "running_ab_tests": running_ab_tests,
        "avg_accuracy": avg_accuracy,
        "avg_latency_ms": avg_latency,
        "total_requests_today": total_requests_today,
        "recent_events": recent_events[:10],
    }


@router.get("/metrics/", summary="All models metrics snapshots (bridge)")
def bridge_metrics_all(hours: int = 24, db: Session = Depends(get_db)) -> list[dict]:
    """Return MetricsSnapshot[] shaped data for all models.
    FIX #4: hours parameter filters predictions to the requested time window.
    """
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    all_models = model_service.get_models(db)
    snapshots: list[dict] = []
    for model in all_models:
        try:
            data = metrics_service.get_model_metrics(db, model.id, since=since)
        except HTTPException:
            continue
        # FIX #3: Build version lookup so we can pass db_version for accuracy fallback
        db_versions = {
            str(v.id): v
            for v in db.query(orm.ModelVersion)
            .filter(orm.ModelVersion.model_id == model.id)
            .all()
        }
        for v in data.get("versions", []):
            db_ver = db_versions.get(v.get("version_id", ""))
            snapshots.append(_version_metrics_to_snapshot(v, str(model.id), hours=hours, db_version=db_ver))
    return snapshots


@router.get("/metrics/model/{model_id}", summary="Single model metrics snapshots (bridge)")
def bridge_metrics_for_model(model_id: UUID, hours: int = 24, db: Session = Depends(get_db)) -> list[dict]:
    """Return MetricsSnapshot[] for one model.
    FIX #4: hours parameter filters to time window.
    """
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    data = metrics_service.get_model_metrics(db, model_id, since=since)  # raises 404 if missing
    # FIX #3: Build version lookup for accuracy fallback
    db_versions = {
        str(v.id): v
        for v in db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == model_id)
        .all()
    }
    return [
        _version_metrics_to_snapshot(v, str(model_id), hours=hours, db_version=db_versions.get(v.get("version_id", "")))
        for v in data.get("versions", [])
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Predict  (body-based POST /predict)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/predict", summary="Run inference — body-based (bridge)")
def bridge_predict(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    """
    Accepts { model_id, features } in body.
    Delegates to inference_service.predict_for_model().
    """
    model_id_str: str = payload.get("model_id", "")
    if not model_id_str:
        raise HTTPException(status_code=422, detail="model_id is required in body")

    try:
        model_uuid = UUID(model_id_str)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid model_id UUID")

    features: dict[str, Any] = payload.get("features", {})
    if not isinstance(features, dict):
        raise HTTPException(status_code=422, detail="features must be a JSON object")

    result = inference_service.predict_for_model(
        db=db,
        model_id=model_uuid,
        request_payload=features,
    )
    # Enrich response to match frontend PredictResponse shape
    version_id_str = result.get("version_id", "")
    version = (
        db.query(orm.ModelVersion).filter(orm.ModelVersion.id == UUID(version_id_str)).first()
        if version_id_str
        else None
    )
    # FIX #8: Resolve human-readable class name for prediction_label
    prediction_label = None
    pred_val = result.get("prediction")
    if pred_val is not None:
        try:
            # Try to look up class names from the loaded artifact
            from app.services.inference_service import _model_cache
            ver_uuid = UUID(version_id_str) if version_id_str else None
            artifact = _model_cache.get(ver_uuid) if ver_uuid else None
            if artifact is not None:
                model_obj = artifact["model"] if isinstance(artifact, dict) else artifact
                if hasattr(model_obj, "classes_"):
                    classes = model_obj.classes_.tolist()
                    pred_int = int(pred_val) if isinstance(pred_val, (int, float)) else None
                    if pred_int is not None and 0 <= pred_int < len(classes):
                        prediction_label = str(classes[pred_int])
        except Exception:
            pass
        if prediction_label is None:
            prediction_label = str(pred_val)

    return {
        "prediction": pred_val,
        "prediction_label": prediction_label,
        "confidence": result.get("confidence"),  # FIX #1: read from inference result
        "model_id": model_id_str,
        "model_version": version.version_tag if version else version_id_str,
        "latency_ms": result.get("latency_ms", 0.0),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Models — activate / deactivate by model_id
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/models/{model_id}/activate", summary="Activate latest model version (bridge)")
def bridge_activate_model(model_id: UUID, db: Session = Depends(get_db)) -> dict:
    """Activate the latest version of a model."""
    db_model = model_service.get_model(db, model_id)
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    latest_version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == model_id)
        .order_by(orm.ModelVersion.created_at.desc())
        .first()
    )
    if not latest_version:
        raise HTTPException(status_code=404, detail="No versions found for this model")

    activated = version_service.activate_version(db, latest_version.id)
    if not activated:
        raise HTTPException(status_code=500, detail="Failed to activate version")

    # Return the model in the frontend's ModelVersion shape
    return _model_to_frontend(db_model, db)


@router.post("/models/{model_id}/deactivate", summary="Deactivate all model versions (bridge)")
def bridge_deactivate_model(model_id: UUID, db: Session = Depends(get_db)) -> dict:
    """Deactivate all versions of a model."""
    db_model = model_service.get_model(db, model_id)
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    db.query(orm.ModelVersion).filter(
        orm.ModelVersion.model_id == model_id
    ).update({"is_active": False}, synchronize_session="fetch")

    # Remove deployment pointer if present
    db.query(orm.ModelDeploymentPointer).filter(
        orm.ModelDeploymentPointer.model_id == model_id
    ).delete(synchronize_session="fetch")

    db.commit()
    return _model_to_frontend(db_model, db)


# ─────────────────────────────────────────────────────────────────────────────
# Models — list & create override (to handle framework mapping)
# ─────────────────────────────────────────────────────────────────────────────

_FRAMEWORK_MAP: dict[str, str] = {
    "scikit-learn": "sklearn",
    "scikit_learn": "sklearn",
    "sci-kit learn": "sklearn",
}


def _map_framework(value: str) -> str:
    return _FRAMEWORK_MAP.get(value.lower().strip(), value)


def _model_to_frontend(db_model: orm.MLModel, db: Session) -> dict:
    """Convert ORM MLModel to frontend ModelVersion shape."""
    # Get latest version info
    latest_version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == db_model.id)
        .order_by(orm.ModelVersion.created_at.desc())
        .first()
    )
    active_version = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == db_model.id, orm.ModelVersion.is_active.is_(True))
        .first()
    )

    # Determine status
    if active_version:
        status = "active"
    elif latest_version:
        status = "inactive"
    else:
        status = "inactive"

    # Get accuracy from active/latest version metrics
    acc = 0.0
    ref_version = active_version or latest_version
    if ref_version and ref_version.metrics:
        acc = float(ref_version.metrics.get("accuracy", 0.0) or 0.0)

    # Map backend framework enum to frontend display name
    fw_reverse_map = {"sklearn": "scikit-learn"}
    framework_display = fw_reverse_map.get(db_model.framework.value, db_model.framework.value)

    return {
        "id": str(db_model.id),
        "name": db_model.name,
        "version": latest_version.version_tag if latest_version else "v0",
        "description": db_model.description or "",
        "accuracy": acc,
        "status": status,
        "framework": framework_display,
        "created_at": db_model.created_at.isoformat() if db_model.created_at else None,
        "updated_at": db_model.updated_at.isoformat() if db_model.updated_at else None,
        "file_path": latest_version.artifact_path if latest_version else None,
        "metadata": {
            "owner": db_model.owner,
            "tags": db_model.tags or [],
            "versions": [
                {
                    "id": str(v.id),
                    "version_tag": v.version_tag,
                    "is_active": v.is_active,
                    "artifact_path": v.artifact_path,
                    "metrics": v.metrics,
                    "created_at": v.created_at.isoformat(),
                }
                for v in (db.query(orm.ModelVersion)
                           .filter(orm.ModelVersion.model_id == db_model.id)
                           .order_by(orm.ModelVersion.created_at.desc())
                           .all())
            ],
        },
    }


@router.get("/models/", summary="List models (bridge)")
def bridge_list_models(db: Session = Depends(get_db)) -> list[dict]:
    models = model_service.get_models(db)
    return [_model_to_frontend(m, db) for m in models]


@router.get("/models/{model_id}", summary="Get model (bridge)")
def bridge_get_model(model_id: UUID, db: Session = Depends(get_db)) -> dict:
    db_model = model_service.get_model(db, model_id)
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
    return _model_to_frontend(db_model, db)


@router.post("/models/", status_code=201, summary="Create model (bridge, JSON body)")
def bridge_create_model(payload: dict[str, Any], db: Session = Depends(get_db)) -> dict:
    """
    Accepts JSON body with optional framework mapping (scikit-learn → sklearn).
    Falls back to multipart form handled by the original model_router for file uploads.
    """
    framework_raw = payload.get("framework", "sklearn")
    payload["framework"] = _map_framework(str(framework_raw))

    if model_service.get_model_by_name(db, payload.get("name", "")):
        raise HTTPException(status_code=409, detail="Model with this name already exists")

    try:
        create_schema = schemas.MLModelCreate(**payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    db_model = model_service.create_model(db, create_schema)
    return _model_to_frontend(db_model, db)
