import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Float, Boolean, Integer,
    DateTime, ForeignKey, JSON, Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class ModelFramework(str, enum.Enum):
    sklearn = "sklearn"
    pytorch = "pytorch"
    tensorflow = "tensorflow"
    xgboost = "xgboost"
    onnx = "onnx"
    other = "other"


class DeploymentStatus(str, enum.Enum):
    pending = "pending"
    deploying = "deploying"
    running = "running"
    failed = "failed"
    stopped = "stopped"


class MLModel(Base):
    __tablename__ = "models"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    framework = Column(SAEnum(ModelFramework), nullable=False)
    owner = Column(String(255), nullable=False)
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions = relationship("ModelVersion", back_populates="model", cascade="all, delete-orphan")
    ab_configs = relationship("ABConfig", back_populates="model", cascade="all, delete-orphan")
    deployment_pointer = relationship(
        "ModelDeploymentPointer",
        back_populates="model",
        uselist=False,
        cascade="all, delete-orphan",
    )


class ModelVersion(Base):
    __tablename__ = "versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id", ondelete="CASCADE"), nullable=False, index=True)
    version_tag = Column(String(100), nullable=False)
    artifact_path = Column(Text, nullable=False)
    metrics = Column(JSON, default=dict)
    hyperparameters = Column(JSON, default=dict)
    input_schema = Column(JSON, default=dict)
    output_schema = Column(JSON, default=dict)
    is_active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    model = relationship("MLModel", back_populates="versions")
    deployment_states = relationship("DeploymentState", back_populates="version", cascade="all, delete-orphan")
    predictions = relationship("Prediction", back_populates="version")
    deployment_pointer = relationship("ModelDeploymentPointer", back_populates="active_version")


class DeploymentState(Base):
    __tablename__ = "deployment_state"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id = Column(UUID(as_uuid=True), ForeignKey("versions.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(SAEnum(DeploymentStatus), default=DeploymentStatus.pending, nullable=False)
    endpoint_url = Column(Text, nullable=True)
    replicas = Column(Integer, default=1)
    cpu_limit = Column(String(50), default="500m")
    memory_limit = Column(String(50), default="512Mi")
    environment = Column(JSON, default=dict)
    error_message = Column(Text, nullable=True)
    deployed_at = Column(DateTime, nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    version = relationship("ModelVersion", back_populates="deployment_states")


class ABConfig(Base):
    __tablename__ = "ab_config"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(UUID(as_uuid=True), ForeignKey("models.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    traffic_split = Column(JSON, default=dict)
    # traffic_split example: {"version_id_a": 60, "version_id_b": 40}
    evaluation_metric = Column(String(100), nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    model = relationship("MLModel", back_populates="ab_configs")


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    version_id = Column(UUID(as_uuid=True), ForeignKey("versions.id", ondelete="SET NULL"), nullable=True, index=True)
    request_payload = Column(JSON, nullable=False)
    response_payload = Column(JSON, nullable=True)
    latency_ms = Column(Float, nullable=True)
    status_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    client_id = Column(String(255), nullable=True)
    ab_config_id = Column(UUID(as_uuid=True), nullable=True)
    actual_label = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    version = relationship("ModelVersion", back_populates="predictions")


class ModelDeploymentPointer(Base):
    """
    One-per-model pointer that records which version is currently deployed.
    Distinct from DeploymentState (which tracks individual deployment events).
    """
    __tablename__ = "model_deployment_pointer"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_id = Column(
        UUID(as_uuid=True),
        ForeignKey("models.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,      # enforces one active pointer per model
        index=True,
    )
    active_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("versions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    model = relationship("MLModel", back_populates="deployment_pointer")
    active_version = relationship("ModelVersion", back_populates="deployment_pointer")
