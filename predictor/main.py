#!/usr/bin/env python3
"""
Diabuddy Prediction Engine - Main Entry Point

Run with: python main.py
Or for development: uvicorn src.api:app --reload --port 8001
"""

import os
import uvicorn
from src.config import get_settings


def main():
    settings = get_settings()
    
    # Use PORT env var (Koyeb/Heroku) or fall back to PREDICTOR_PORT
    port = int(os.environ.get("PORT", settings.predictor_port))

    print("=" * 60)
    print("Diabuddy Prediction Engine")
    print("=" * 60)
    print(f"Starting server on http://{settings.host}:{port}")
    print(f"Prediction horizons: {settings.horizons} minutes")
    print("=" * 60)

    uvicorn.run(
        "src.api:app",
        host=settings.host,
        port=port,
        reload=False,
    )


if __name__ == "__main__":
    main()
