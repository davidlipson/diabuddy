# Diabuddy Prediction Engine Docker Image
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Create models directory
RUN mkdir -p models

# Koyeb provides PORT env var, default to 8000
ENV PORT=8000
EXPOSE 8000

# Run the server (uvicorn reads $PORT)
CMD uvicorn src.api:app --host 0.0.0.0 --port ${PORT}
