#!/usr/bin/env bash
# Start headless Chromium with remote debugging for Lighthouse / chrome-devtools MCP
set -euo pipefail

PORT="${1:-9222}"

echo "Starting Chromium (headless) on port ${PORT}..."
exec chromium \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port="${PORT}" \
  about:blank
