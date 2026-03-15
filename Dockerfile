# ─────────────────────────────────────────────
# Stage 1: Build the Vite / React frontend
# ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .

# VITE_POCKETBASE_URL must point to the same origin so the browser
# can reach PocketBase through Dokploy's reverse-proxy (no port in URL).
# Pass it as a build arg so the GA workflow can inject the real domain.
ARG VITE_POCKETBASE_URL=""
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL

RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Download PocketBase for linux/amd64
# ─────────────────────────────────────────────
FROM debian:bookworm-slim AS pb-downloader

ARG PB_VERSION=0.27.1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
    -o /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /tmp/pb \
    && chmod +x /tmp/pb/pocketbase

# ─────────────────────────────────────────────
# Stage 3: Final runtime image
# ─────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -u 1001 -m pbuser

WORKDIR /app

# Copy PocketBase binary
COPY --from=pb-downloader /tmp/pb/pocketbase ./pocketbase

# Copy migrations so fresh containers auto-apply them on first boot
COPY pb_migrations/ ./pb_migrations/

# Copy Vite build output into pb_public — PocketBase serves this as static files
COPY --from=frontend-builder /app/dist ./pb_public

# pb_data is mounted as a volume — do NOT copy it
# This directory must be writable by pbuser
RUN mkdir -p /app/pb_data && chown -R pbuser:pbuser /app

USER pbuser

EXPOSE 8090

# --dev is NOT used in production; migrations run automatically on startup
ENTRYPOINT ["./pocketbase", "serve", \
    "--http=0.0.0.0:8090", \
    "--dir=/app/pb_data", \
    "--migrationsDir=/app/pb_migrations", \
    "--publicDir=/app/pb_public"]
