from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.environments import router as environments_router
from app.routers.flags import router as flags_router
from app.routers.management_flags import router as management_flags_router
from app.routers.release_controls import router as release_controls_router
from app.routers.release_controls import evaluation_router
from app.routers.workspace import router as workspace_router
from app.config import settings

app = FastAPI(
    title="Feature Flag Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth_router)
app.include_router(flags_router)
app.include_router(management_flags_router)
app.include_router(release_controls_router)
app.include_router(evaluation_router)
app.include_router(workspace_router)
app.include_router(environments_router)


@app.get("/")
def root():
    return {
        "message": "Feature Flag Management System API is running"
    }