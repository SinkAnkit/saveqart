# ─────────────────────────────────────────────────────────────
# SaveQart Production Dockerfile
# Multi-stage: build frontend → run backend with Chromium
# ─────────────────────────────────────────────────────────────

# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --omit=dev
COPY frontend/ ./
RUN npm run build

# Stage 2: Production runtime (Node + Chromium for Puppeteer)
FROM node:20-slim AS runtime
WORKDIR /app

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (skip download)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install backend dependencies
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src

# Copy built frontend into backend's public directory
COPY --from=frontend-build /app/frontend/dist ./public

# Serve frontend static files from Express in production
RUN echo "const path = require('path');" > serve-static.js && \
    echo "const express = require('express');" >> serve-static.js && \
    echo "const app = require('./src/index');" >> serve-static.js

# Environment
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

EXPOSE 4000

CMD ["node", "src/index.js"]
