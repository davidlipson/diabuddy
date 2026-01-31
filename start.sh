#!/bin/bash
# Startup script for combined Node + Python services

set -e

echo "=========================================="
echo "Diabuddy Combined Server"
echo "=========================================="

# Start Python predictor in background on port 8001
echo "Starting Python predictor on localhost:8001..."
cd /app/predictor
/app/predictor/venv/bin/python -m uvicorn src.api:app \
    --host 127.0.0.1 \
    --port 8001 \
    --log-level info &

PREDICTOR_PID=$!
echo "Predictor started (PID: $PREDICTOR_PID)"

# Wait for predictor to be ready
echo "Waiting for predictor to be ready..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8001/ > /dev/null 2>&1; then
        echo "Predictor is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Warning: Predictor may not be ready yet, continuing anyway..."
    fi
    sleep 1
done

# Start Node server in foreground on PORT (default 8000)
echo "Starting Node server on port ${PORT:-8000}..."
cd /app/server
exec node dist/index.js
