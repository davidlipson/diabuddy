# Diabuddy Server (Node.js only)

FROM node:20-slim

WORKDIR /app

# ============================================
# Node Server Setup
# ============================================
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

COPY server/ ./
RUN npm run build && npm prune --production

# Expose main port
EXPOSE 8000

# Start server
CMD ["node", "dist/index.js"]
