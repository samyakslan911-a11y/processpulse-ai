from pathlib import Path
from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    gemini_api_key: str
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    # Single source of truth for the model: the agent and the follow-up
    # question endpoint used to disagree with each other.
    gemini_model: str = "gemini-2.0-flash"

    # Each analysis occupies a worker thread that spawns pandas/matplotlib
    # subprocesses; unbounded threads would let N users exhaust the box.
    max_concurrent_analyses: int = 3

    model_config = {
        "env_file": str(ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

settings = Settings()
