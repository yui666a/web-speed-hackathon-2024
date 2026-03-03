#!/usr/bin/env bash
# Run Lighthouse against a local or remote URL
# Usage: ./run-lighthouse.sh [URL] [--output-dir DIR]
set -euo pipefail

URL="${1:-http://localhost:8000}"
OUTPUT_DIR="${2:-./lighthouse-results}"

mkdir -p "${OUTPUT_DIR}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_FILE="${OUTPUT_DIR}/report_${TIMESTAMP}"

echo "Running Lighthouse against ${URL}..."
lighthouse "${URL}" \
  --chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage" \
  --output=html,json \
  --output-path="${OUTPUT_FILE}" \
  --only-categories=performance \
  --preset=perf

echo ""
echo "Reports saved:"
echo "  HTML: ${OUTPUT_FILE}.report.html"
echo "  JSON: ${OUTPUT_FILE}.report.json"
