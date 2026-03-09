from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from app.core.database import create_db_and_tables
from app.api import auth, places, routing

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting StreetSense API...")
    os.makedirs("data", exist_ok=True)
    create_db_and_tables()
    logger.info("✅ Database initialized")
    yield
    logger.info("👋 StreetSense API shutting down...")


app = FastAPI(
    title="StreetSense API",
    description="Premium Delhi NCR Navigation Platform API",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(places.router, prefix="/api/places", tags=["Places"])
app.include_router(routing.router, prefix="/api/routing", tags=["Routing"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": "StreetSense API",
        "version": "3.0.0",
        "region": "Delhi NCR",
    }
