# ─────────────────────────────────────────────
# Stage 1: Build the Vite / React frontend
# ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Empty → pocketbase.js falls back to window.location.origin
ARG VITE_POCKETBASE_URL=""
ENV VITE_POCKETBASE_URL=$VITE_POCKETBASE_URL

# Empty in dev (uses Vite proxy). In prod: absolute URL of the AI API service.
ARG VITE_AI_API_URL=""
ENV VITE_AI_API_URL=$VITE_AI_API_URL

RUN npm run build

# ─────────────────────────────────────────────
# Stage 2: Download PocketBase
# ─────────────────────────────────────────────
FROM alpine:3.19 AS pb-downloader

ARG PB_VERSION=0.27.1

RUN apk add --no-cache curl unzip \
    && curl -fsSL \
       "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
       -o /tmp/pocketbase.zip \
    && unzip /tmp/pocketbase.zip -d /tmp/pb \
    && chmod +x /tmp/pb/pocketbase

# ─────────────────────────────────────────────
# Stage 3: Final runtime image
# ─────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates wget

RUN adduser -D -u 1001 pbuser

WORKDIR /app

COPY --from=pb-downloader /tmp/pb/pocketbase ./pocketbase
COPY pb_migrations/ ./pb_migrations/
COPY --from=frontend-builder /app/dist ./pb_public

RUN mkdir -p /app/pb_data && chown -R pbuser:pbuser /app

USER pbuser

EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:8090/api/health || exit 1

CMD ["./pocketbase", "serve", \
     "--http=0.0.0.0:8090", \
     "--dir=/app/pb_data", \
     "--migrationsDir=/app/pb_migrations", \
     "--publicDir=/app/pb_public"]
