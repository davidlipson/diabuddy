"""
Configuration management for the prediction engine.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Supabase
    supabase_url: str = Field(..., env="SUPABASE_URL")
    supabase_service_key: str = Field(..., env="SUPABASE_SERVICE_KEY")

    # Server (PORT is set by Koyeb/Heroku, PREDICTOR_PORT for local dev)
    port: int = Field(default=8000, env="PORT")
    predictor_port: int = Field(default=8001, env="PREDICTOR_PORT")
    host: str = Field(default="0.0.0.0", env="PREDICTOR_HOST")

    @property
    def server_port(self) -> int:
        """Get the port to use (prefers PORT env var for cloud platforms)."""
        import os
        return int(os.environ.get("PORT", self.predictor_port))

    # Training
    retrain_interval_hours: int = Field(default=24, env="RETRAIN_INTERVAL_HOURS")
    min_training_rows: int = Field(default=1000, env="MIN_TRAINING_ROWS")

    # Prediction horizons (in minutes)
    prediction_horizons: str = Field(default="30,60,90,120", env="PREDICTION_HORIZONS")

    @property
    def horizons(self) -> list[int]:
        """Parse prediction horizons from comma-separated string."""
        return [int(h.strip()) for h in self.prediction_horizons.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
