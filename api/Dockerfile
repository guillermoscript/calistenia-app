FROM node:20-alpine

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy source
COPY server.js ./
COPY src/ ./src/

# Non-root user
RUN adduser -D -u 1001 apiuser
USER apiuser

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server.js"]
