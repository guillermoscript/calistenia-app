FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY views/ ./views/
COPY public/ ./public/
# `mcp-use build` bundles src/server.ts + every views/<name>/view.tsx into
# .mcp-use/build/ (index.js + manifest.json + views/<name>/assets + views/public).
# It evaluates the entry module while doing so, so it must not need any
# runtime secret (see src/bootstrap.ts for the scheduler guard).
RUN npm run build

# ── Runtime ───────────────────────────────────────────────────────────────────
FROM node:22-alpine

# Public origin of this server, baked at build time. CI supplies the real value
# via --build-arg SERVER_URL=${{ vars.SERVER_URL }} (see build-ai-api.yml); the
# localhost default only applies to a bare `docker build` with no arg. Required
# so OAuth discovery metadata advertises the public domain. A runtime
# `-e SERVER_URL=...` still overrides this if needed.
ARG SERVER_URL=http://localhost:3001
ENV SERVER_URL=${SERVER_URL}

ENV NODE_ENV=production
# `mcp-use start` binds 127.0.0.1 unless HOST says otherwise, and reads PORT
# (defaulting to 3000) — both must be explicit inside a container.
ENV HOST=0.0.0.0
ENV PORT=3001

WORKDIR /app

COPY package.json package-lock.json ./
# mcp-use (and its CLI, which owns `start`) is a regular dependency, so the
# production install is enough to serve the build.
RUN npm ci --omit=dev

# Prebuilt server + views (see builder). `mcp-use start` reads
# .mcp-use/build/manifest.json and serves the view assets from there; the
# `public/` fonts are copied into .mcp-use/build/views/public by the build.
COPY --from=builder /app/.mcp-use/build ./.mcp-use/build
COPY data/ ./data/

RUN adduser -D -u 1001 apiuser
USER apiuser

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)throw r.status;process.exit(0)}).catch(()=>process.exit(1))"

CMD ["npx", "mcp-use", "start", "--path", "."]
