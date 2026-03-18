#!/usr/bin/env bash
set -euo pipefail

# Usage: generate-report.sh <timestamp_dir> [previous_dir]
# Reads Lighthouse JSON files and generates report.md with scoring analysis.
# Updates the latest symlink.

BASE_DIR="perf-measurements"
TIMESTAMP="${1:?Usage: generate-report.sh <timestamp_dir> [previous_dir]}"
OUT_DIR="$BASE_DIR/$TIMESTAMP"
PREV_DIR="${2-}"
REPORT="$OUT_DIR/report.md"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Resolve previous dir if it's a symlink
if [ -n "$PREV_DIR" ] && [ -L "$BASE_DIR/$PREV_DIR" ]; then
  PREV_DIR=$(readlink "$BASE_DIR/$PREV_DIR")
fi

# Build the full previous dir path
PREV_FULL=""
if [ -n "$PREV_DIR" ]; then
  PREV_FULL="$BASE_DIR/$PREV_DIR"
fi

# Validate JSON files exist
for page in home author book episode; do
  if [ ! -f "$OUT_DIR/${page}.json" ]; then
    echo "ERROR: $OUT_DIR/${page}.json not found" >&2
    exit 1
  fi
done

# Generate report using Node.js
node "$SCRIPT_DIR/generate-report.js" "$OUT_DIR" "$REPORT" "$PREV_FULL"

# Update latest symlink
ln -sfn "$TIMESTAMP" "$BASE_DIR/latest"
echo "Symlink updated: $BASE_DIR/latest -> $TIMESTAMP"
