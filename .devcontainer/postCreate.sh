#!/usr/bin/env bash
# Codespace one-time setup: pnpm deps + Linux PocketBase binary + .env seed.
set -euo pipefail

PB_VERSION="0.36.8"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Enabling pnpm via corepack"
corepack enable
corepack prepare pnpm@10.30.0 --activate

echo "==> Installing monorepo deps (pnpm install)"
pnpm install --frozen-lockfile || pnpm install

# mcp-server is a standalone project (not part of the pnpm workspace).
echo "==> Installing mcp-server deps"
pnpm -C mcp-server install --frozen-lockfile || pnpm -C mcp-server install

# PocketBase binary is gitignored + platform-specific. Fetch Linux amd64.
if ! ./pocketbase version >/dev/null 2>&1; then
  echo "==> Downloading PocketBase v${PB_VERSION} (linux_amd64)"
  ZIP="pocketbase_${PB_VERSION}_linux_amd64.zip"
  curl -sSL -o "/tmp/${ZIP}" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"
  unzip -o "/tmp/${ZIP}" pocketbase -d "$ROOT" >/dev/null
  chmod +x ./pocketbase
  rm -f "/tmp/${ZIP}"
fi
echo "==> PocketBase: $(./pocketbase version)"

# Seed .env so services boot. AI keys stay empty (AI features degrade, app runs).
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
fi

echo ""
echo "==============================================================="
echo " Setup done. Start everything with:"
echo "     pnpm dev:all"
echo ""
echo " Then open the forwarded ports:"
echo "     Web        -> 5173"
echo "     PocketBase -> 8090  (admin UI at /_/)"
echo "     AI API     -> 3001"
echo ""
echo " Optional: add API keys to .env for AI features"
echo "   (ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)"
echo "==============================================================="
