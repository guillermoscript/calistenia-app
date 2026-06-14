FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY resources/ ./resources/
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:20-alpine

# Public origin of this server, baked at build time. CI supplies the real value
# via --build-arg SERVER_URL=${{ vars.SERVER_URL }} (see build-ai-api.yml); the
# localhost default only applies to a bare `docker build` with no arg. Required
# so OAuth discovery metadata advertises the public domain. A runtime
# `-e SERVER_URL=...` still overrides this if needed.
ARG SERVER_URL=http://localhost:3001
ENV SERVER_URL=${SERVER_URL}

# Run mcp-use in production mode. Without this it mounts widgets in DEV mode,
# which tries to `mkdir /app/resources` as the non-root user and crashes the
# container on boot (EACCES) — leaving the old container serving stale config.
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /app/build ./build
# Prebuilt widgets + manifest read by mcp-use production mode (dist/mcp-use.json,
# dist/resources/widgets/*). Required or no interactive widgets are served.
COPY --from=builder /app/dist ./dist
COPY data/ ./data/

RUN adduser -D -u 1001 apiuser
USER apiuser

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)throw r.status;process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "build/server.js"]
