# """FastAPI application entrypoint."""
# import logging

# from fastapi import FastAPI
# from fastapi.middleware.cors import CORSMiddleware

# from app.config import get_settings
# from app.routers import chat

# settings = get_settings()

# logging.basicConfig(
#     level=settings.log_level.upper(),
#     format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
# )
# logger = logging.getLogger(__name__)

# app = FastAPI(
#     title="PowerBI Assistant API",
#     description=(
#         "FastAPI wrapper around a Google Cloud Conversational Analytics "
#         "data agent. Exposes a simple /chat/ask endpoint that a BI tool "
#         "(e.g. Power BI via Web connector) can call."
#     ),
#     version="0.1.0",
# )

# # CORS — loosen only what you need in production.
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# app.include_router(chat.router)


# @app.get("/", tags=["meta"])
# def root() -> dict:
#     return {
#         "service": "powerbi-agent-api",
#         "agent_resource": settings.agent_resource,
#         "docs": "/docs",
#     }


# @app.get("/health", tags=["meta"])
# def health() -> dict:
#     return {"status": "ok"}


# @app.on_event("startup")
# def _log_startup() -> None:
#     logger.info("Starting up — agent=%s", settings.agent_resource)


"""FastAPI application entrypoint."""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import chat

settings = get_settings()

logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PowerBI Assistant API",
    description=(
        "FastAPI wrapper around a Google Cloud Conversational Analytics "
        "data agent. /chat/ask returns JSON; /ui serves a simple chat UI "
        "that renders charts, tables and follow-ups like the Cloud console."
    ),
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)

# --- Serve the small HTML/JS client at /ui ---------------------------------
UI_DIR = Path(__file__).parent.parent / "static"
if UI_DIR.is_dir():
    app.mount("/ui", StaticFiles(directory=str(UI_DIR), html=True), name="ui")


@app.get("/", tags=["meta"])
def root():
    # Send users to the UI if it exists, otherwise show metadata.
    index = UI_DIR / "index.html"
    if index.is_file():
        return FileResponse(str(index))
    return {
        "service": "powerbi-agent-api",
        "agent_resource": settings.agent_resource,
        "docs": "/docs",
    }


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok"}


@app.on_event("startup")
def _log_startup() -> None:
    logger.info("Starting up — agent=%s", settings.agent_resource)