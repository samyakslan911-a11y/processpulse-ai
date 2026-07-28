from pathlib import Path
from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).parent.parent / ".env"

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    gemini_api_key: str
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"

    model_config = {
        "env_file": str(ENV_FILE),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

settings = Settings()
