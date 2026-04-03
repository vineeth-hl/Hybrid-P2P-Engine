from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.uploads import router as uploads_router

app = FastAPI(
    title="Hybrid P2P-Cloud Anonymous Transfer API",
    description="Core backend for P2P signaling, S3 cloud fallback, and anonymous signaling.",
    version="1.0.0"
)

# Initialize Prometheus Instrumentator for Observability metrics
Instrumentator().instrument(app).expose(app)

# Configure CORS
# TODO(Production): Restrict `allow_origins` to specific frontend domains.
# e.g., allow_origins=["https://my-frontend-domain.com"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for now
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users_router, prefix="/api", tags=["Users"])
app.include_router(uploads_router, prefix="/api", tags=["Uploads"])

@app.get("/ping")
async def ping():
    """
    Health check endpoint to verify the API is running.
    """
    return {"status": "ok", "message": "pong"}
