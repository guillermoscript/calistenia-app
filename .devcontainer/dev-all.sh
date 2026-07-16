#!/usr/bin/env bash
# Run all three dev services in one terminal. Ctrl-C stops everything.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so the AI API sees provider keys / config.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

pids=()
cleanup() { echo "==> stopping..."; kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> PocketBase  http://0.0.0.0:8090  (admin /_/)"
./pocketbase serve --http=0.0.0.0:8090 & pids+=($!)

echo "==> AI API      http://0.0.0.0:3001"
( cd mcp-server && pnpm dev:simple ) & pids+=($!)

echo "==> Web (Vite)  http://0.0.0.0:5173"
pnpm --filter @calistenia/web dev & pids+=($!)

wait
