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

# Public origin (SERVER_URL) is read at RUNTIME from the environment — supply it
# via Dokploy env vars (prod) or docker-compose/.env (local). Not baked into the
# image: keeping it out of the build avoids shipping an env-specific URL and the
# localhost default that silently breaks OAuth discovery when left unset.

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
