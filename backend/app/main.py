from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .routers import admin, auth, chartmind, forex, messages, predictions, verification


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Convenience for local development. In production use Alembic migrations.
    Base.metadata.create_all(bind=engine)
    # Lightweight schema migration for existing dev databases.
    try:
        from sqlalchemy import inspect, text

        inspector = inspect(engine)
        tables = inspector.get_table_names()
        if "users" in tables:
            cols = {c["name"] for c in inspector.get_columns("users")}
            if "last_seen" not in cols:
                with engine.begin() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN last_seen TIMESTAMP"))
    except Exception:
        # Never block startup on a failed optional migration.
        pass
    yield


app = FastAPI(
    title="Trading Robot Guider API",
    version="0.1.0",
    description=(
        "Prediction-focused API for Forex, Gold, Crypto and Binary Options. "
        "No automatic trading or broker execution is performed."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(verification.router, prefix=api_prefix)
app.include_router(predictions.router, prefix=api_prefix)
app.include_router(forex.router, prefix=api_prefix)
app.include_router(chartmind.router, prefix=api_prefix)
app.include_router(messages.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "provider_configured": settings.provider_configured,
        "demo_mode": settings.demo_mode,
        "whatsapp_enabled": settings.whatsapp_enabled,
    }
