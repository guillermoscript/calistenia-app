#!/usr/bin/env bash
# Prueba cal_scan_receipt con una foto real de recibo, sin pelear con base64 en el inspector.
# Uso: ./scripts/test-scan-receipt.sh ~/Desktop/recibo.jpg
# Requiere haber conectado antes: npx mcp-use client connect calwidgets http://localhost:3001/mcp --auth "<PB_JWT>"
set -euo pipefail

IMG="${1:?Uso: $0 <foto-del-recibo.jpg|png|webp>}"
case "${IMG##*.}" in
  jpg|jpeg) MIME="image/jpeg" ;;
  png) MIME="image/png" ;;
  webp) MIME="image/webp" ;;
  *) echo "Formato no soportado (jpg/png/webp)"; exit 1 ;;
esac

B64=$(base64 -i "$IMG" | tr -d '\n')
ARGS=$(node -e "console.log(JSON.stringify({images:[{base64_data: process.argv[1], mime_type: process.argv[2]}]}))" "$B64" "$MIME")

npx mcp-use client calwidgets tools call cal_scan_receipt "$ARGS" --screenshot
