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

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /app/build ./build
COPY data/ ./data/

RUN adduser -D -u 1001 apiuser
USER apiuser

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r=>{if(!r.ok)throw r.status;process.exit(0)}).catch(()=>process.exit(1))"

CMD ["node", "build/server.js"]
