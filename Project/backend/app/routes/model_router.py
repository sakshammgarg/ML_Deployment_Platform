from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.database import get_db
from app import schemas
from app.services import model_service, version_service

router = APIRouter(prefix="/models", tags=["Models"])


@router.get("/", response_model=list[schemas.MLModelResponse])
def list_models(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    return model_service.get_models(db, skip=skip, limit=limit)


@router.get("/{model_id}", response_model=schemas.MLModelResponse)
def get_model(model_id: UUID, db: Session = Depends(get_db)):
    db_model = model_service.get_model(db, model_id)
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
    return db_model


@router.post("/", response_model=schemas.MLModelResponse, status_code=201)
def create_model(payload: schemas.MLModelCreate, db: Session = Depends(get_db)):
    if model_service.get_model_by_name(db, payload.name):
        raise HTTPException(status_code=409, detail="Model with this name already exists")
    return model_service.create_model(db, payload)


@router.patch("/{model_id}", response_model=schemas.MLModelResponse)
def update_model(model_id: UUID, payload: schemas.MLModelUpdate, db: Session = Depends(get_db)):
    db_model = model_service.update_model(db, model_id, payload)
    if not db_model:
        raise HTTPException(status_code=404, detail="Model not found")
    return db_model


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: UUID, db: Session = Depends(get_db)):
    deleted = model_service.delete_model(db, model_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Model not found")


@router.post(
    "/{model_id}/versions",
    response_model=schemas.ModelVersionResponse,
    status_code=201,
    tags=["Versions"],
    summary="Upload a .pkl model version file",
)
def upload_version(
    model_id: UUID,
    version_tag: str = Form(..., description="Unique version tag, e.g. 'v1.0.0'"),
    file: UploadFile = File(..., description="Serialized model file (.pkl only)"),
    db: Session = Depends(get_db),
):
    try:
        return version_service.upload_version(
            db=db,
            model_id=model_id,
            version_tag=version_tag,
            file=file,
        )
    except ValueError as exc:
        msg = str(exc)
        if msg == "model_not_found":
            raise HTTPException(status_code=404, detail="Model not found")
        if msg.startswith("invalid_extension:"):
            ext = msg.split(":")[1]
            raise HTTPException(
                status_code=422,
                detail=f"Invalid file extension '{ext}'. Only .pkl files are accepted.",
            )
        if msg.startswith("duplicate_version_tag:"):
            tag = msg.split(":")[1]
            raise HTTPException(
                status_code=409,
                detail=f"Version tag '{tag}' already exists for this model.",
            )
        raise HTTPException(status_code=500, detail="Upload failed")
