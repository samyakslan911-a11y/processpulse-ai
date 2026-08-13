"""Server-Sent Events — el frontend escucha el progreso del agente en tiempo real."""
import asyncio

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/stream", tags=["stream"])

PING_INTERVAL = 30.0   # segundos sin datos antes de mandar un keep-alive
MAX_IDLE_PINGS = 20    # ~10 min sin actividad -> cerramos la conexion
TERMINAL_EVENTS = {"done", "failed"}

_queues: dict[str, asyncio.Queue] = {}
_loop: asyncio.AbstractEventLoop | None = None


def set_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Called once at app startup. The agent runs in a worker thread and needs a
    reference to the event loop to hand messages over safely; capturing it on the
    first SSE connection instead meant emit() was a no-op until someone connected."""
    global _loop
    _loop = loop


def ensure_queue(analysis_id: str) -> asyncio.Queue:
    if analysis_id not in _queues:
        _queues[analysis_id] = asyncio.Queue()
    return _queues[analysis_id]


def discard_queue(analysis_id: str) -> None:
    """Drop the queue once nobody is listening — otherwise _queues grows for the
    lifetime of the process, holding every chart's base64 payload in memory."""
    _queues.pop(analysis_id, None)


def emit(analysis_id: str, event: str, data: str) -> None:
    if analysis_id not in _queues:
        return
    loop = _loop
    if loop and loop.is_running():
        loop.call_soon_threadsafe(
            _queues[analysis_id].put_nowait,
            f"event: {event}\ndata: {data}\n\n"
        )


def _event_name(msg: str) -> str:
    head = msg.split("\n", 1)[0]
    return head[7:].strip() if head.startswith("event: ") else ""


@router.get("/{analysis_id}")
async def stream_analysis(analysis_id: str, request: Request):
    queue = ensure_queue(analysis_id)

    async def generator():
        idle = 0
        try:
            yield f"event: connected\ndata: {analysis_id}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=PING_INTERVAL)
                except asyncio.TimeoutError:
                    # Bounded: an unknown analysis_id used to keep a connection
                    # (and its queue) alive forever, pinging into the void.
                    idle += 1
                    if idle >= MAX_IDLE_PINGS:
                        yield "event: timeout\ndata: sin actividad\n\n"
                        break
                    yield "event: ping\ndata: keep-alive\n\n"
                    continue

                idle = 0
                yield msg
                # Match on the event name. The old check looked for the quoted
                # strings '"done"' / '"failed"' in the raw frame, which never
                # appear there — so the stream never closed, even on success.
                if _event_name(msg) in TERMINAL_EVENTS:
                    break
        finally:
            discard_queue(analysis_id)

    return StreamingResponse(generator(), media_type="text/event-stream")
