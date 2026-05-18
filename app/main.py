"""FastAPI application entrypoint."""
import asyncio
import concurrent.futures
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.routers import chat, d2c_rto, dashboard, web_cr, d2c_router, app_cr, auth, promo_basket, supply_chain, acquisition

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
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(chat.router)
app.include_router(dashboard.router)
app.include_router(web_cr.router)
app.include_router(d2c_router.router)
app.include_router(app_cr.router)
app.include_router(auth.router)
app.include_router(d2c_rto.router)
app.include_router(promo_basket.router)
app.include_router(supply_chain.router)
app.include_router(acquisition.router)

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
async def _startup() -> None:
    loop = asyncio.get_running_loop()
    loop.set_default_executor(concurrent.futures.ThreadPoolExecutor(max_workers=40))
    logger.info("Starting up — agent=%s  thread_pool=40", settings.agent_resource)