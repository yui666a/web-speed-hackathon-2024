#!/usr/bin/env bash
set -euo pipefail

# Usage: run-lighthouse.sh [timestamp_dir]
# Runs Lighthouse CLI on all 4 scoring pages and saves JSON results.
# If timestamp_dir is omitted, creates one with current datetime.

BASE_DIR="perf-measurements"
TIMESTAMP="${1:-$(date +%Y-%m-%d_%H%M)}"
OUT_DIR="$BASE_DIR/$TIMESTAMP"

mkdir -p "$OUT_DIR"

# Scoring pages: name|url pairs
PAGES="home|http://localhost:8000/
author|http://localhost:8000/authors/2ab0aca5-7dc2-4543-ac98-e23fdaca0739
book|http://localhost:8000/books/cf6552c4-a713-468d-ab76-9cabb51e62ac
episode|http://localhost:8000/books/cf6552c4-a713-468d-ab76-9cabb51e62ac/episodes/4a9f9923-cac7-4206-aba7-fbe5e28eb593"

echo "=== Lighthouse Measurement ==="
echo "Output: $OUT_DIR"
echo ""

echo "$PAGES" | while IFS='|' read -r page url; do
  out_path="$OUT_DIR/${page}.json"
  echo "[$page] $url ..."
  npx lighthouse "$url" \
    --output json \
    --output-path "$out_path" \
    --chrome-flags="--headless" \
    --only-categories=performance \
    2>/dev/null
  echo "[$page] Done."
done

echo ""
echo "=== All pages measured ==="
echo "JSON files saved to: $OUT_DIR"
echo "TIMESTAMP=$TIMESTAMP"
