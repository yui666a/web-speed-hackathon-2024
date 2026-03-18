#!/usr/bin/env bash
set -euo pipefail

# Usage: validate.sh [--skip-test] [--skip-build]
# Runs build, bundle size check, regulation checks, and E2E/VRT tests.
# Outputs a structured validation report to stdout.

SKIP_TEST=false
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-test) SKIP_TEST=true ;;
    --skip-build) SKIP_BUILD=true ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$PROJECT_ROOT"

PASS="PASS"
FAIL="FAIL"
SKIP="SKIP"
ERRORS=""

section() { echo ""; echo "=== $1 ==="; }
result() {
  local status="$1" name="$2" detail="${3-}"
  echo "[$status] $name"
  if [ -n "$detail" ]; then echo "  $detail"; fi
  if [ "$status" = "$FAIL" ]; then ERRORS="$ERRORS\n- $name: $detail"; fi
}

section "1. Build"
if [ "$SKIP_BUILD" = true ]; then
  result "$SKIP" "Build" "Skipped by --skip-build"
else
  if pnpm run build 2>&1 | tail -5; then
    result "$PASS" "Build"
  else
    result "$FAIL" "Build" "pnpm run build failed"
  fi
fi

section "2. Bundle Size Analysis"
CLIENT_DIST="workspaces/client/dist"
if [ -d "$CLIENT_DIST/assets" ]; then
  # Total JS size
  TOTAL_JS=$(find "$CLIENT_DIST/assets" -name '*.js' -exec stat -f%z {} + 2>/dev/null | awk '{s+=$1}END{print s}' || echo "0")
  TOTAL_JS_KB=$((TOTAL_JS / 1024))
  echo "Total JS: ${TOTAL_JS_KB} KB"

  # Per-chunk sizes
  echo ""
  echo "Chunk breakdown:"
  find "$CLIENT_DIST/assets" -name '*.js' -exec stat -f "%z %N" {} + 2>/dev/null | sort -rn | while read -r size name; do
    basename=$(basename "$name")
    size_kb=$((size / 1024))
    echo "  ${size_kb} KB  $basename"
  done

  # SW size
  if [ -f "$CLIENT_DIST/serviceworker.global.js" ]; then
    SW_SIZE=$(stat -f%z "$CLIENT_DIST/serviceworker.global.js" 2>/dev/null || echo "0")
    SW_KB=$((SW_SIZE / 1024))
    echo "  ${SW_KB} KB  serviceworker.global.js"
  fi

  # Compare with previous if exists
  PREV_SIZE_FILE="$CLIENT_DIST/.bundle-sizes.prev"
  CURR_SIZE_FILE="$CLIENT_DIST/.bundle-sizes.curr"
  echo "$TOTAL_JS" > "$CURR_SIZE_FILE"

  if [ -f "$PREV_SIZE_FILE" ]; then
    PREV_JS=$(cat "$PREV_SIZE_FILE")
    DIFF=$((TOTAL_JS - PREV_JS))
    DIFF_KB=$((DIFF / 1024))
    if [ "$DIFF" -gt 0 ]; then
      echo ""
      echo "Size change: +${DIFF_KB} KB from previous build"
    elif [ "$DIFF" -lt 0 ]; then
      DIFF_KB=$(( -DIFF / 1024 ))
      echo ""
      echo "Size change: -${DIFF_KB} KB from previous build"
    else
      echo ""
      echo "Size change: no change"
    fi
  fi

  result "$PASS" "Bundle size check"
else
  result "$FAIL" "Bundle size check" "dist/assets not found. Run build first."
fi

section "3. Regulation Checks"

# 3a. Service Worker registration
if grep -rq "serviceWorker" workspaces/client/src/ 2>/dev/null && grep -rq "\.register" workspaces/client/src/utils/registerServiceWorker* 2>/dev/null; then
  result "$PASS" "SW registration" "registerServiceWorker found in client source"
else
  result "$FAIL" "SW registration" "SW registration not found in client source"
fi

# 3b. SW output file exists
if [ -f "$CLIENT_DIST/serviceworker.global.js" ]; then
  result "$PASS" "SW build output" "serviceworker.global.js exists"
else
  result "$FAIL" "SW build output" "serviceworker.global.js not found in dist"
fi

# 3c. Image encryption (decrypt function used in SW)
if grep -rq "decrypt" workspaces/client/src/serviceworker/ 2>/dev/null; then
  result "$PASS" "Image obfuscation" "decrypt() used in Service Worker"
else
  result "$FAIL" "Image obfuscation" "Image decryption not found in SW — images may be served unencrypted"
fi

# 3d. DB initialize endpoint
if grep -rq "api/v1/initialize" workspaces/server/src/ 2>/dev/null; then
  result "$PASS" "DB initialize endpoint" "POST /api/v1/initialize route exists"
else
  result "$FAIL" "DB initialize endpoint" "Initialize endpoint not found"
fi

# 3e. Vite manifest exists (needed for asset resolution)
if [ -f "$CLIENT_DIST/.vite/manifest.json" ]; then
  result "$PASS" "Vite manifest" ".vite/manifest.json exists"
else
  result "$FAIL" "Vite manifest" ".vite/manifest.json not found"
fi

section "4. E2E / VRT Tests"
if [ "$SKIP_TEST" = true ]; then
  result "$SKIP" "E2E/VRT" "Skipped by --skip-test"
else
  echo "Running tests (this may take a few minutes)..."
  if pnpm run test 2>&1 | tail -20; then
    result "$PASS" "E2E/VRT"
  else
    result "$FAIL" "E2E/VRT" "Some tests failed. Check output above."
  fi
fi

section "Summary"
if [ -n "$ERRORS" ]; then
  echo "FAILURES:"
  echo -e "$ERRORS"
  echo ""
  echo "Status: FAILED"
  exit 1
else
  echo "All checks passed."
  echo "Status: PASSED"
fi

# Save current bundle size for next comparison
if [ -f "$CURR_SIZE_FILE" ]; then
  cp "$CURR_SIZE_FILE" "$PREV_SIZE_FILE"
fi
