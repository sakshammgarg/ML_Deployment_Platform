from __future__ import annotations
from uuid import UUID
from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict, field_validator

from app.models import ModelFramework, DeploymentStatus


# ─────────────────────────── MLModel ────────────────────────────

class MLModelBase(BaseModel):
    name: str
    description: Optional[str] = None
    framework: ModelFramework
    owner: str
    tags: Optional[list[str]] = None

    @field_validator("tags", mode="before")
    @classmethod
    def default_tags(cls, v: Any) -> list[str]:
        return v if v is not None else []


class MLModelCreate(MLModelBase):
    pass


class MLModelUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    framework: Optional[ModelFramework] = None
    owner: Optional[str] = None
    tags: Optional[list[str]] = None


class MLModelResponse(MLModelBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─────────────────────────── ModelVersion ───────────────────────

class ModelVersionBase(BaseModel):
    version_tag: str
    artifact_path: str
    metrics: Optional[dict[str, Any]] = None
    hyperparameters: Optional[dict[str, Any]] = None
    input_schema: Optional[dict[str, Any]] = None
    output_schema: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = False

    @field_validator("metrics", "hyperparameters", "input_schema", "output_schema", mode="before")
    @classmethod
    def default_dict(cls, v: Any) -> dict:
        return v if v is not None else {}


class ModelVersionCreate(ModelVersionBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    model_id: UUID


class ModelVersionUpdate(BaseModel):
    version_tag: Optional[str] = None
    artifact_path: Optional[str] = None
    metrics: Optional[dict[str, Any]] = None
    hyperparameters: Optional[dict[str, Any]] = None
    input_schema: Optional[dict[str, Any]] = None
    output_schema: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ModelVersionResponse(ModelVersionBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: UUID
    model_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─────────────────────────── DeploymentState ────────────────────

class DeploymentStateBase(BaseModel):
    replicas: Optional[int] = 1
    cpu_limit: Optional[str] = "500m"
    memory_limit: Optional[str] = "512Mi"
    environment: Optional[dict[str, Any]] = None

    @field_validator("environment", mode="before")
    @classmethod
    def default_environment(cls, v: Any) -> dict:
        return v if v is not None else {}


class DeploymentStateCreate(DeploymentStateBase):
    version_id: UUID


class DeploymentStateUpdate(BaseModel):
    status: Optional[DeploymentStatus] = None
    endpoint_url: Optional[str] = None
    replicas: Optional[int] = None
    cpu_limit: Optional[str] = None
    memory_limit: Optional[str] = None
    environment: Optional[dict[str, Any]] = None
    error_message: Optional[str] = None
    deployed_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None


class DeploymentStateResponse(DeploymentStateBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    status: DeploymentStatus
    endpoint_url: Optional[str] = None
    error_message: Optional[str] = None
    deployed_at: Optional[datetime] = None
    stopped_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─────────────────────────── ABConfig ───────────────────────────

class ABConfigBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True
    traffic_split: Optional[dict[str, Any]] = None
    evaluation_metric: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

    @field_validator("traffic_split", mode="before")
    @classmethod
    def default_traffic_split(cls, v: Any) -> dict:
        return v if v is not None else {}


class ABConfigCreate(ABConfigBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    model_id: UUID


class ABConfigUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    traffic_split: Optional[dict[str, Any]] = None
    evaluation_metric: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None


class ABConfigResponse(ABConfigBase):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: UUID
    model_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None


# ─────────────────────────── Prediction ─────────────────────────

class PredictionCreate(BaseModel):
    version_id: UUID
    request_payload: dict[str, Any]
    client_id: Optional[str] = None
    actual_label: Optional[int] = None


class PredictionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: Optional[UUID] = None
    request_payload: dict[str, Any]
    response_payload: Optional[dict[str, Any]] = None
    latency_ms: Optional[float] = None
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    client_id: Optional[str] = None
    ab_config_id: Optional[UUID] = None
    actual_label: Optional[int] = None
    created_at: datetime


# ─────────────────────────── ModelDeploymentPointer ─────────────────

class ModelDeploymentPointerResponse(BaseModel):
    """
    Represents the currently deployed version for a given model.
    Table: model_deployment_pointer (one row per model, enforced by unique constraint on model_id).
    """
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    id: UUID
    model_id: UUID
    active_version_id: UUID
    updated_at: datetime

