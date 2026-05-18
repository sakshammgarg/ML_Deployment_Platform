from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, case, Integer as SAInteger, cast, literal_column
from sqlalchemy.orm import Session

from app import models as orm


def get_model_metrics(db: Session, model_id: UUID, since=None) -> dict[str, Any]:
    """
    Aggregate per-version prediction metrics using a single GROUP BY query.
    Never fetches individual prediction rows into Python.

    Accuracy SQL logic (run entirely inside PostgreSQL):
      correct  = rows where actual_label IS NOT NULL
                 AND CAST(response_payload->>'prediction' AS INT) = actual_label
      labeled  = COUNT(actual_label)   [COUNT ignores NULL by definition]
      accuracy = correct / NULLIF(labeled, 0)

    FIX #4: Optional `since` datetime filters predictions to a time window.
    """
    # ── 1. Verify model exists ────────────────────────────────────────────────
    db_model = db.query(orm.MLModel).filter(orm.MLModel.id == model_id).first()
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")

    # ── 2. Fetch all versions for this model ──────────────────────────────────
    db_versions = (
        db.query(orm.ModelVersion)
        .filter(orm.ModelVersion.model_id == model_id)
        .all()
    )
    version_ids = [v.id for v in db_versions]
    version_tag_map = {v.id: v.version_tag for v in db_versions}

    # ── 3. SQL aggregation — one query, GROUP BY version_id ───────────────────
    # accuracy_numerator: rows where label is present AND prediction matches
    # We cast `response_payload->>'prediction'` (scalar text) to INTEGER.
    # Scalar storage means ->> gives the value directly; no array indexing needed.
    pred_as_int = cast(
        literal_column("response_payload->>'prediction'"),
        SAInteger,
    )

    accuracy_numerator = func.sum(
        case(
            (
                (orm.Prediction.actual_label.isnot(None))
                & (pred_as_int == orm.Prediction.actual_label),
                1,
            ),
            else_=0,
        )
    ).label("correct_count")

    # COUNT(col) ignores NULLs — gives number of labeled rows automatically
    labeled_count = func.count(orm.Prediction.actual_label).label("labeled_count")

    agg_query = (
        db.query(
            orm.Prediction.version_id,
            func.count(orm.Prediction.id).label("total_requests"),
            func.avg(
                func.coalesce(orm.Prediction.latency_ms, 0.0)
            ).label("avg_latency_ms"),
            func.min(
                func.coalesce(orm.Prediction.latency_ms, 0.0)
            ).label("min_latency_ms"),
            func.max(
                func.coalesce(orm.Prediction.latency_ms, 0.0)
            ).label("max_latency_ms"),
            func.sum(
                case(
                    (
                        (orm.Prediction.status_code == None)  # noqa: E711
                        | (orm.Prediction.status_code >= 400),
                        1,
                    ),
                    else_=0,
                )
            ).label("error_count"),
            func.max(orm.Prediction.created_at).label("last_request_time"),
            accuracy_numerator,
            labeled_count,
        )
        .filter(orm.Prediction.version_id.in_(version_ids))
    )
    # FIX #4: Apply time-window filter when `since` is provided
    if since is not None:
        agg_query = agg_query.filter(orm.Prediction.created_at >= since)

    agg_rows = agg_query.group_by(orm.Prediction.version_id).all()

    # Index by version_id for O(1) lookup
    stats_by_version: dict[UUID, Any] = {row.version_id: row for row in agg_rows}

    # ── 4. Build per-version metrics ──────────────────────────────────────────
    versions_out = []
    for vid in version_ids:
        row = stats_by_version.get(vid)
        if row is None:
            versions_out.append({
                "version_id":        str(vid),
                "version_tag":       version_tag_map[vid],
                "total_requests":    0,
                "avg_latency_ms":    None,
                "min_latency_ms":    None,
                "max_latency_ms":    None,
                "error_count":       0,
                "error_rate":        None,
                "accuracy":          None,
                "last_request_time": None,
            })
        else:
            total    = row.total_requests
            err      = int(row.error_count or 0)
            labeled  = int(row.labeled_count or 0)
            correct  = int(row.correct_count or 0)
            accuracy = round(correct / labeled, 6) if labeled > 0 else None

            versions_out.append({
                "version_id":        str(vid),
                "version_tag":       version_tag_map[vid],
                "total_requests":    total,
                "avg_latency_ms":    round(float(row.avg_latency_ms), 4) if row.avg_latency_ms is not None else None,
                "min_latency_ms":    round(float(row.min_latency_ms), 4) if row.min_latency_ms is not None else None,
                "max_latency_ms":    round(float(row.max_latency_ms), 4) if row.max_latency_ms is not None else None,
                "error_count":       err,
                "error_rate":        round(err / total, 6) if total > 0 else None,
                "accuracy":          accuracy,
                "last_request_time": row.last_request_time.isoformat() if row.last_request_time else None,
            })

    # ── 5. Check for active AB config ─────────────────────────────────────────
    ab_config = (
        db.query(orm.ABConfig)
        .filter(
            orm.ABConfig.model_id == model_id,
            orm.ABConfig.is_active.is_(True),
        )
        .first()
    )

    result: dict[str, Any] = {
        "model_id":     str(model_id),
        "ab_active":    ab_config is not None,
        "traffic_split": ab_config.traffic_split if ab_config else None,
        "versions":     versions_out,
    }

    # ── 6. AB comparison summary ──────────────────────────────────────────────
    if ab_config and len(versions_out) >= 2:
        compared = [v for v in versions_out if v["total_requests"] > 0]
        if compared:
            best_latency  = min(compared, key=lambda v: v["avg_latency_ms"] or float("inf"))
            best_error    = min(compared, key=lambda v: v["error_rate"]     or 0.0)
            ab_comparison: dict[str, Any] = {
                "lowest_avg_latency_version_id": best_latency["version_id"],
                "lowest_error_rate_version_id":  best_error["version_id"],
            }
            # Only include accuracy winner when at least one version has labeled data
            labeled_versions = [v for v in compared if v["accuracy"] is not None]
            if labeled_versions:
                best_accuracy = max(labeled_versions, key=lambda v: v["accuracy"])  # type: ignore[arg-type]
                ab_comparison["highest_accuracy_version_id"] = best_accuracy["version_id"]

            result["ab_comparison"] = ab_comparison

    return result
