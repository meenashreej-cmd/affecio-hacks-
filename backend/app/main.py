import os
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.db import Base, engine
from backend.app.routes import conversations, media, reports, users
from backend.app.ws import ws_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Ensure database schema is created on startup
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Affecio Behavioral Trust Scorer API",
    description="Real-time trust scoring and scam detection backend for chat and media restriction.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
origins_str = os.getenv("CORS_ORIGINS", "http://localhost:5173")
origins = [origin.strip() for origin in origins_str.split(",") if origin.strip()]
if "http://localhost:5173" not in origins:
    origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(users.router)
app.include_router(conversations.router)
app.include_router(media.router)
app.include_router(reports.router)
app.include_router(ws_router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
