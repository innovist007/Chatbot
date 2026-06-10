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
from app.modules.chat.router import router as chat_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.web_cr.router import router as web_cr_router
from app.modules.d2c.router import router as d2c_router
from app.modules.app_cr.router import router as app_cr_router
from app.modules.auth.router import router as auth_router
from app.modules.d2c_rto.router import router as d2c_rto_router
from app.modules.promo_basket.router import router as promo_basket_router
from app.modules.supply_chain.router import router as supply_chain_router
from app.modules.acquisition.router import router as acquisition_router
from app.modules.retention.router import router as retention_router
from app.modules.d2c_overview.router import router as d2c_overview_router
from app.modules.internal.router import router as internal_router

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

app.include_router(chat_router)
app.include_router(dashboard_router)
app.include_router(web_cr_router)
app.include_router(d2c_router)
app.include_router(app_cr_router)
app.include_router(auth_router)
app.include_router(d2c_rto_router)
app.include_router(promo_basket_router)
app.include_router(supply_chain_router)
app.include_router(acquisition_router)
app.include_router(retention_router)
app.include_router(d2c_overview_router)
app.include_router(internal_router)

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