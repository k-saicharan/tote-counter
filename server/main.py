import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from server.vlm import count_totes

app = FastAPI(title="Tote Counter")

# Serve static frontend files
static_dir = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


class CountRequest(BaseModel):
    image: str  # base64-encoded JPEG


class CountResponse(BaseModel):
    count: int
    confidence: str
    warning: str | None = None
    error: str | None = None


@app.get("/")
async def index():
    return FileResponse(str(static_dir / "index.html"))


@app.post("/api/count", response_model=CountResponse)
async def api_count(req: CountRequest):
    if not req.image:
        raise HTTPException(status_code=400, detail="No image provided")

    # Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    image_data = req.image
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    try:
        result = count_totes(image_data)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VLM error: {e}")

    return CountResponse(
        count=result.get("count", -1),
        confidence=result.get("confidence", "low"),
        warning=result.get("warning"),
        error=result.get("error"),
    )
