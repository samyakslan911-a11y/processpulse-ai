from datetime import datetime, timezone
from supabase import create_client
from backend.config import settings


def _client():
    return create_client(settings.supabase_url, settings.supabase_key)


def create_analysis(user_id: str, filename: str, csv_preview: str = "") -> dict:
    r = _client().table("process_analyses").insert({
        "user_id": user_id,
        "filename": filename,
        "status": "running",
        "csv_preview": csv_preview,
    }).execute()
    return r.data[0]


def update_analysis(analysis_id: str, data: dict) -> dict:
    payload = {**data, "updated_at": datetime.now(timezone.utc).isoformat()}
    r = _client().table("process_analyses").update(payload).eq("id", analysis_id).execute()
    return r.data[0]


def list_analyses(user_id: str) -> list[dict]:
    r = (_client().table("process_analyses")
         .select("id,filename,status,iterations,created_at,updated_at")
         .eq("user_id", user_id)
         .order("created_at", desc=True)
         .limit(20)
         .execute())
    return r.data


def get_analysis(analysis_id: str, user_id: str) -> dict | None:
    r = (_client().table("process_analyses")
         .select("*")
         .eq("id", analysis_id)
         .eq("user_id", user_id)
         .execute())
    return r.data[0] if r.data else None
