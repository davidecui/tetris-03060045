"""Tetris Web — FastAPI backend serving the browser-based Tetris game."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Tetris Web", version="1.0.0")

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def index():
    """Serve the main game page."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health():
    """Liveness / readiness probe endpoint."""
    return {"status": "ok"}
