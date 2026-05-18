from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import engine, Base
from app.routes import (
    bridge_router,
    model_router,
    version_router,
    deployment_router,
    ab_config_router,
    prediction_router,
    predict_router,
    metrics_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="ML Deployment Platform",
    description="Production-ready API for managing ML model deployments",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bridge_router.router,    prefix="/api/v1")
app.include_router(model_router.router,      prefix="/api/v1")
app.include_router(version_router.router,     prefix="/api/v1")
app.include_router(deployment_router.router,  prefix="/api/v1")
app.include_router(ab_config_router.router,   prefix="/api/v1")
app.include_router(prediction_router.router,  prefix="/api/v1")
app.include_router(predict_router.router,     prefix="/api/v1")
app.include_router(metrics_router.router,     prefix="/api/v1")


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


@app.get("/api/v1/health", tags=["Health"])
def health_check_v1():
    return {"status": "ok"}
