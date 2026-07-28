from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.api.analyze import router as analyze_router
from backend.api.stream import router as stream_router

app = FastAPI(title="ProcessPulse AI — Lean Process Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(stream_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "module": "process-agent"}
