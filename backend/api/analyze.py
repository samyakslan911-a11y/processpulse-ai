"""
POST /analyze               — upload CSV, start agent, return analysis_id
GET  /analyze               — list user's analyses
GET  /analyze/{id}          — get one analysis (report + charts)
POST /analyze/{id}/question — ask a follow-up question about the analysis
"""
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from google import genai
from google.genai import types

from backend.auth.dependencies import get_current_user
from backend.config import settings
from backend.db.analyses import create_analysis, get_analysis, list_analyses
from backend.agent.process_agent import run_process_agent
from backend.api.stream import ensure_queue

router = APIRouter(prefix="/analyze", tags=["analyze"])

ALLOWED_TYPES = {"text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"}
MAX_SIZE_MB = 10

# Bounded pool instead of one daemon thread per upload: the queue is implicit,
# so a burst of uploads waits its turn rather than spawning unbounded threads
# and pandas/matplotlib subprocesses.
_executor = ThreadPoolExecutor(
    max_workers=settings.max_concurrent_analyses,
    thread_name_prefix="agent",
)


@router.post("")
async def start_analysis(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    content_type = file.content_type or ""
    filename = file.filename or "upload.csv"
    if not filename.endswith(".csv") and content_type not in ALLOWED_TYPES:
        raise HTTPException(400, "Solo se aceptan archivos CSV")

    csv_bytes = await file.read()
    if len(csv_bytes) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"Archivo demasiado grande (máx {MAX_SIZE_MB} MB)")
    if len(csv_bytes) < 10:
        raise HTTPException(400, "Archivo vacío o inválido")

    try:
        csv_text = csv_bytes.decode("utf-8", errors="replace")
        csv_preview = "\n".join(csv_text.split("\n")[:51])
    except Exception:
        csv_preview = ""

    analysis = create_analysis(user_id, filename, csv_preview)
    analysis_id = analysis["id"]
    ensure_queue(analysis_id)

    _executor.submit(run_process_agent, analysis_id, user_id, csv_bytes, filename)

    return {"analysis_id": analysis_id, "filename": filename}


@router.get("")
async def list_user_analyses(user_id: str = Depends(get_current_user)):
    return list_analyses(user_id)


@router.get("/{analysis_id}")
async def get_one_analysis(analysis_id: str, user_id: str = Depends(get_current_user)):
    analysis = get_analysis(analysis_id, user_id)
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")
    return analysis


class QuestionBody(BaseModel):
    question: str


@router.post("/{analysis_id}/question")
async def ask_question(
    analysis_id: str,
    body: QuestionBody,
    user_id: str = Depends(get_current_user),
):
    analysis = get_analysis(analysis_id, user_id)
    if not analysis:
        raise HTTPException(404, "Análisis no encontrado")
    if analysis.get("status") != "done":
        raise HTTPException(400, "El análisis aún no está completo")

    context = (
        f"Archivo analizado: {analysis['filename']}\n\n"
        f"INFORME DEL AGENTE:\n{analysis.get('report', 'No disponible')}\n\n"
        f"VISTA PREVIA DE LOS DATOS (primeras filas):\n{analysis.get('csv_preview', 'No disponible')}"
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    for attempt in range(4):
        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=[{"role": "user", "parts": [{"text": f"Contexto:\n{context}\n\nPregunta: {body.question}"}]}],
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "Eres un analista Lean de manufactura. Responde en español "
                        "usando los datos del análisis. Sé conciso y directo. "
                        "Si la pregunta no puede responderse con los datos disponibles, dilo."
                    )
                ),
            )
            text = response.candidates[0].content.parts[0].text
            return {"answer": text}
        except Exception as e:
            if "429" in str(e) and attempt < 3:
                time.sleep(30 * (attempt + 1))
                continue
            raise HTTPException(503, f"Error Gemini: {e}")
