import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.api.analyze import router as analyze_router
from backend.api.stream import router as stream_router, set_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Hand the running loop to the SSE module so agent threads can push events
    # from the moment the app is up, not from the first client connection.
    set_loop(asyncio.get_running_loop())
    yield


app = FastAPI(title="ProcessPulse AI — Lean Process Agent", lifespan=lifespan)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(stream_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "module": "process-agent"}
