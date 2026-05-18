# Self-Optimizing ML Deployment Platform

This project delivers a production-ready, full-stack platform for registering, versioning, deploying, and live-monitoring machine learning models through a unified API and dashboard, with built-in A/B testing and automated performance tracking.

## Project Description

This project builds a complete ML Deployment Platform using a FastAPI backend, a Next.js frontend, and a PostgreSQL database, all orchestrated via Docker Compose. The platform supports the full model lifecycle: uploading serialized model artifacts, activating specific versions for inference, routing live traffic across versions via configurable A/B tests, and collecting real-time performance metrics (latency, accuracy, error rate). Multi-framework support covers scikit-learn, PyTorch, TensorFlow, XGBoost, and ONNX. An in-process model cache eliminates redundant disk I/O on repeated inference calls, while a deployment-pointer abstraction keeps routing consistent across restarts.

## Key Steps

### 1. Data and Artifact Management

* Upload serialized `.pkl` model artifacts through the REST API
* Validate file integrity at upload time — corrupt pickles are rejected before any DB record is written
* Auto-compute accuracy on an Iris benchmark dataset during upload (for compatible classifiers)
* Store artifacts under a persistent `models_storage` volume, keyed by model UUID and version number

### 2. Model Registry

* Register named models with framework tags (`sklearn`, `pytorch`, `tensorflow`, `xgboost`, `onnx`, `other`), owner, description, and free-form JSON tags
* Attach multiple versioned artifacts to each model, each with its own `metrics`, `hyperparameters`, `input_schema`, and `output_schema` fields
* Enforce unique version tags per model to prevent accidental overwrites

### 3. Deployment and Version Control

* Activate any registered version with a single API call — atomic upsert deactivates all other versions and updates the deployment pointer in one transaction
* Rollback to any prior version instantly by re-activating it; the deployment pointer is updated so all subsequent inference calls route to the rollback target
* Track deployment lifecycle states: `pending → deploying → running → stopped / failed`
* Configure per-deployment resource hints: replicas, CPU limit, memory limit, and environment variables

### 4. Inference Engine

* POST `/api/v1/predict/{model_id}` for on-demand inference on the currently active version
* Intelligent routing: active A/B config takes priority; falls back to the deployment pointer when no A/B test is running
* In-process `_model_cache` (keyed by version UUID) loads each artifact exactly once per process lifetime
* Supports both plain model artifacts and wrapped `{"model", "scaler", "feature_names"}` dicts
* Returns `prediction`, `confidence` (from `predict_proba` when available), `version_id`, and `latency_ms`
* Every prediction is logged to the `predictions` table — including request/response payloads, latency, status code, and optional `actual_label` for accuracy tracking

### 5. A/B Testing

* Create named A/B configurations with arbitrary traffic splits: `{"version_id_a": 70, "version_id_b": 30}`
* Weighted random routing uses `random.choices` with normalized weights — no manual cumulative logic, no ordering dependency
* Full validation at routing time: empty splits, non-positive weights, and unknown/unowned version IDs all raise descriptive errors
* Activate or deactivate A/B configs independently of version activation

### 6. Metrics and Observability

* GET `/api/v1/metrics/{model_id}` aggregates per-version stats in a single SQL `GROUP BY` query — no Python-side row iteration
* Tracks: `total_requests`, `avg/min/max latency_ms`, `error_count`, `error_rate`, `accuracy`, and `last_request_time`
* Accuracy computed entirely in PostgreSQL: `CAST(response_payload->>'prediction' AS INT) = actual_label`
* AB comparison summary automatically identifies the version with lowest latency, lowest error rate, and highest accuracy when an A/B test is active

### 7. Bridge Router

* Adapter layer (`bridge_router.py`) registered before all other routers in `main.py` so its paths take priority over generic catch-alls
* Translates the frontend's API contract to backend services without modifying any existing route or schema
* Exposes frontend-compatible shapes for every resource: enriched deployment objects (with `traffic_percentage` derived from the active A/B config), AB test objects (with `model_a_traffic` / `model_b_traffic` computed from the `traffic_split`), and `MetricsSnapshot` objects with `latency_p50/p95/p99` and `throughput` fields
* `GET /metrics/summary` — dashboard overview: total models, active deployments, running A/B tests, average accuracy, average latency, and a recent-events feed
* `GET /metrics/?hours=N` and `GET /metrics/model/{model_id}?hours=N` — time-windowed metrics snapshots; `hours` converts to a `since` datetime passed to the SQL aggregation layer
* `POST /predict` — body-based inference accepting `{ model_id, features }`; enriches the response with a human-readable `prediction_label` resolved from the model's `classes_` attribute
* `POST /models/{model_id}/activate` / `deactivate` — convenience shortcuts to activate the latest version of a model or deactivate all versions
* Framework name normalization: maps `"scikit-learn"` / `"scikit_learn"` → `"sklearn"` at model-creation time

### 8. Prediction Log

* `GET /api/v1/predictions/` — paginated list of all logged inference calls, filterable by `version_id`
* `GET /api/v1/predictions/{prediction_id}` — retrieve a single prediction record with full request/response payload
* `DELETE /api/v1/predictions/{prediction_id}` — remove a prediction record from the audit log
* Records stored include: `request_payload`, `response_payload`, `latency_ms`, `status_code`, `error_message`, `client_id`, `ab_config_id`, and optional `actual_label` for post-hoc accuracy tracking

### 9. Frontend Dashboard

* Next.js 14 + Tailwind CSS + Recharts dashboard served on port `3000`
* Pages: Models, Model Detail, Deployments, A/B Testing, Metrics, Predict
* React Query for data fetching and cache invalidation; `react-hot-toast` for user feedback
* Sidebar navigation with `lucide-react` icons

## Results

The platform demonstrates end-to-end ML operations capability with clean architectural separation:

* **Inference pipeline** handles plain models and scaler-wrapped dicts with a single code path
* **Routing logic** is strict and validated — no silent fallbacks or ambiguous states
* **Metrics aggregation** runs entirely in the database, keeping the API tier stateless
* **Version rollback** is atomic — a failed transaction never leaves the deployment pointer and `is_active` flag out of sync
* **A/B traffic split** is statistically unbiased across arbitrary weight magnitudes (e.g., `{v1: 1, v2: 3}` and `{v1: 25, v2: 75}` produce identical distributions)
* **Model cache** ensures each artifact is deserialized exactly once, keeping p99 inference latency low under repeated calls

## Dependencies

**Backend**

```
fastapi>=0.111.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
psycopg2-binary>=2.9.9
pydantic>=2.7.0
python-dotenv>=1.0.1
alembic>=1.13.1
python-multipart>=0.0.9
joblib>=1.4.0
numpy>=1.24.0
scikit-learn>=1.3.0
```

**Frontend**

```
next 14.2.3
react ^18
recharts ^2.12.7
@tanstack/react-query ^5.40.0
axios ^1.7.2
tailwindcss ^3.4.1
lucide-react ^0.383.0
```

Install backend dependencies manually:

```bash
pip install fastapi uvicorn sqlalchemy psycopg2-binary pydantic python-dotenv alembic python-multipart joblib numpy scikit-learn
```

## Installation

1. **Clone the repository**

```bash
git clone https://github.com/sakshammgarg/ML_Deployment_Platform.git
cd ML_Deployment_Platform
```

2. **Configure environment**

```bash
cp ml-platform-fixed/backend/.env.example ml-platform-fixed/backend/.env
# Edit .env if using non-default Postgres credentials
```

3. **Launch all services with Docker Compose**

```bash
cd ml-platform-fixed
docker compose up --build
```

This starts three containers:
* `db` — PostgreSQL 15 on port `5432`
* `backend` — FastAPI on port `8000`
* `frontend` — Next.js on port `3000`

The backend auto-creates all database tables on startup via SQLAlchemy `create_all`.

4. **Verify health**

```bash
curl http://localhost:8000/health
# → {"status": "ok"}
```

## Usage

Run the platform to execute the full ML operations workflow:

1. **Register a model** — POST `/api/v1/models` with `name`, `framework`, and `owner`
2. **Upload a version** — POST `/api/v1/models/{model_id}/versions` with a `.pkl` artifact and `version_tag`
3. **Activate a version** — PATCH `/api/v1/versions/{version_id}/activate`
4. **Run inference** — POST `/api/v1/predict/{model_id}` with feature payload
5. **View metrics** — GET `/api/v1/metrics/{model_id}` for live latency and accuracy stats
6. **Create an A/B test** — POST `/api/v1/ab-configs` with `traffic_split` across two version IDs
7. **Monitor results** — GET `/api/v1/metrics/{model_id}` returns AB comparison summary automatically
8. **Rollback** — POST `/api/v1/versions/{version_id}/rollback` to revert to any prior version
9. **Browse the dashboard** — open `http://localhost:3000` for the full Next.js UI

## Platform Component Guide

| Use Case | Recommended Approach |
|---|---|
| Production inference | Activate a version → POST `/predict/{model_id}` |
| Comparing two model versions | Create an A/B config with desired traffic split |
| Reverting a bad deployment | Use rollback endpoint — atomic, no downtime |
| Monitoring latency regressions | GET `/metrics/model/{model_id}?hours=24` (bridge route) |
| Uploading a retrained model | Upload new version; old version stays active until you switch |

## Advanced Features

This implementation includes:

* **Deployment Pointer abstraction** — one row per model tracks the currently active version; inference always reads from this pointer, never from a mutable flag scan
* **Atomic version activation** — deactivates all siblings and upserts the pointer in a single transaction with rollback on error
* **Corrupt artifact rejection** — pkl files are `joblib.load`-tested at upload time; bad files are deleted and the request fails before any DB record is created
* **Benchmark accuracy on upload** — compatible sklearn classifiers are automatically evaluated against the Iris dataset and the score is stored in the version's `metrics` field
* **Confidence extraction** — `predict_proba` is called after every prediction when available; the max class probability is returned as `confidence` alongside the raw prediction
* **Time-windowed metrics** — the bridge metrics routes (`GET /metrics/?hours=N`, `GET /metrics/model/{model_id}?hours=N`) convert the integer `hours` parameter to a `since` datetime and pass it into the SQL aggregation layer, scoping all stats to that window
* **AB comparison auto-summary** — the metrics endpoint automatically names the winning version by latency, error rate, and accuracy when an A/B test is running
* **Persistent volume mounts** — `postgres_data` and `models_storage` volumes survive container restarts

## Applications

Practical use cases for this ML deployment platform:

* **MLOps infrastructure** for teams needing a self-hosted model registry and serving layer
* **Experiment management** via versioned artifacts with stored hyperparameters and metrics
* **Canary and A/B deployments** for safely rolling out retrained models to a fraction of traffic
* **Audit trails** through the `predictions` table — every inference call is logged with payload, latency, and ground-truth label
* **Academic and teaching environments** for demonstrating production ML system design patterns
* **Rapid prototyping** for data scientists who want a REST endpoint for a trained model without writing serving code

## Future Improvements

Potential enhancements for production hardening:

1. **Async inference** — migrate inference endpoint to an async FastAPI handler with a background task queue (Celery / ARQ) for long-running models
2. **Model schema validation** — enforce `input_schema` at inference time to reject malformed payloads before model load
3. **Multi-format artifact support** — extend beyond `.pkl` to support SavedModel, ONNX `.onnx`, and PyTorch `.pt` natively
4. **Authentication and RBAC** — add JWT-based auth and role-based access so only authorized owners can activate or delete versions
5. **Prometheus + Grafana integration** — export latency histograms and error-rate counters as Prometheus metrics for ops dashboards
6. **Drift detection** — compute PSI or KL-divergence between upload-time and live feature distributions to trigger retraining alerts
7. **Horizontal scaling** — replace the in-process model cache with Redis or shared memory so multiple backend replicas serve from a consistent state
8. **CI/CD integration** — add a `/api/v1/deploy` endpoint that accepts a model artifact, registers it, and activates it in one call, enabling automated post-training deployment pipelines

This project demonstrates how Model Versioning, Atomic Deployment Pointers, Weighted A/B Traffic Routing, In-Process Caching, and SQL-native Metrics Aggregation can be combined to build a reliable, observable, and operationally sound machine learning deployment platform.
