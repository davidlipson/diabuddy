# Combined Diabuddy Server + Predictor
# Runs Node.js server and Python predictor in a single container

FROM node:20-slim

# Install Python and curl (for health checks)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ============================================
# Python Predictor Setup
# ============================================
COPY predictor/requirements.txt ./predictor/
RUN python3 -m venv /app/predictor/venv && \
    /app/predictor/venv/bin/pip install --no-cache-dir -r predictor/requirements.txt

COPY predictor/ ./predictor/
RUN mkdir -p /app/predictor/models

# ============================================
# Node Server Setup
# ============================================
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

COPY server/ ./
RUN npm run build && npm prune --production

# ============================================
# Startup Script
# ============================================
WORKDIR /app
COPY start.sh ./
RUN chmod +x start.sh

# Expose main port (Node server)
EXPOSE 8000

# Start both services
CMD ["./start.sh"]
