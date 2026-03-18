#!/usr/bin/env bash
set -euo pipefail

# Usage: analyze.sh [--rebuild] [--top N]
# Analyzes Vite bundle output: chunk sizes, dependency breakdown, large modules.
# Requires build output in workspaces/client/dist/

REBUILD=false
TOP=20
for arg in "$@"; do
  case $arg in
    --rebuild) REBUILD=true ;;
    --top) shift; TOP="${1:-20}" ;;
    --top=*) TOP="${arg#*=}" ;;
  esac
done

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$PROJECT_ROOT"

CLIENT_DIST="workspaces/client/dist"

if [ "$REBUILD" = true ]; then
  echo "Rebuilding with sourcemaps enabled..."
  # Temporarily enable sourcemaps for analysis
  VITE_BUILD_SOURCEMAP=true pnpm --filter @wsh-2024/client run build:vite 2>&1 | tail -3
fi

section() { echo ""; echo "=== $1 ==="; }

section "1. Overall Bundle Size"

if [ ! -d "$CLIENT_DIST/assets" ]; then
  echo "ERROR: $CLIENT_DIST/assets not found. Run 'pnpm run build' first."
  exit 1
fi

TOTAL_JS=0
TOTAL_CSS=0
echo ""
echo "JavaScript chunks (sorted by size):"
find "$CLIENT_DIST/assets" -name '*.js' -exec stat -f "%z %N" {} + 2>/dev/null | sort -rn | while read -r size name; do
  basename=$(basename "$name")
  size_kb=$((size / 1024))
  TOTAL_JS=$((TOTAL_JS + size))
  # Gzip estimate (~30-40% of original for JS)
  gzip_kb=$((size_kb * 35 / 100))
  echo "  ${size_kb} KB (gzip ~${gzip_kb} KB)  $basename"
done

echo ""
echo "CSS files:"
find "$CLIENT_DIST/assets" -name '*.css' -exec stat -f "%z %N" {} + 2>/dev/null | sort -rn | while read -r size name; do
  basename=$(basename "$name")
  size_kb=$((size / 1024))
  echo "  ${size_kb} KB  $basename"
done

echo ""
echo "Service Worker:"
if [ -f "$CLIENT_DIST/serviceworker.global.js" ]; then
  SW_SIZE=$(stat -f%z "$CLIENT_DIST/serviceworker.global.js" 2>/dev/null || echo "0")
  echo "  $((SW_SIZE / 1024)) KB  serviceworker.global.js"
fi

section "2. Dependency Analysis (from node_modules in chunks)"

echo ""
echo "Top $TOP largest dependencies found in main JS chunks:"
echo "(Scanning for node_modules paths in bundle...)"
echo ""

# Use Vite manifest to find entry chunks, then scan for known heavy libs
node -e "
const fs = require('fs');
const path = require('path');

const distDir = '$CLIENT_DIST/assets';
const jsFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

// Known heavy dependencies to check for
const heavyDeps = [
  'three', 'canvaskit-wasm', 'lodash', 'moment', 'moment-timezone',
  'core-js', 'regenerator-runtime', '@mui', '@chakra-ui', '@emotion',
  'jimp', 'image-js', 'swr', 'react-dom', 'react-router',
  'styled-components', 'framer-motion', 'date-fns', 'zod',
  'hls.js', '@fortawesome', 'jsquash', 'p-queue', 'drizzle',
  '@radix-ui', 'axios', 'jquery', 'es5-shim', 'es6-shim', 'es7-shim'
];

const results = {};
for (const jsFile of jsFiles) {
  const content = fs.readFileSync(path.join(distDir, jsFile), 'utf8');
  for (const dep of heavyDeps) {
    // Check if the dependency name appears in the bundle
    // This is a heuristic - looks for import paths or module references
    const escaped = dep.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    const regex = new RegExp(escaped, 'g');
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      if (!results[dep]) results[dep] = [];
      results[dep].push({ file: jsFile, refs: matches.length });
    }
  }
}

// Sort by number of references
const sorted = Object.entries(results)
  .map(([dep, files]) => ({ dep, files, totalRefs: files.reduce((s, f) => s + f.refs, 0) }))
  .sort((a, b) => b.totalRefs - a.totalRefs)
  .slice(0, $TOP);

for (const { dep, files } of sorted) {
  const chunks = files.map(f => f.file.replace(/-.{8}\.js$/, '')).join(', ');
  console.log('  ' + dep + ' → found in: ' + chunks);
}

if (sorted.length === 0) {
  console.log('  No known heavy dependencies detected in bundle.');
}
"

section "3. Chunk Splitting Analysis"

echo ""
echo "Vite manifest entry points and their dependencies:"
node -e "
const fs = require('fs');
const manifestPath = '$CLIENT_DIST/.vite/manifest.json';
if (!fs.existsSync(manifestPath)) {
  console.log('  Manifest not found. Run build first.');
  process.exit(0);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry) {
    console.log('  Entry: ' + key);
    console.log('    File: ' + entry.file);
    if (entry.css) console.log('    CSS: ' + entry.css.join(', '));
    if (entry.imports) console.log('    Imports: ' + entry.imports.join(', '));
    if (entry.dynamicImports) console.log('    Dynamic: ' + entry.dynamicImports.join(', '));
    console.log('');
  }
}
"

section "4. Optimization Opportunities"

echo ""
node -e "
const fs = require('fs');
const path = require('path');

const distDir = '$CLIENT_DIST/assets';
const jsFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

const issues = [];

for (const jsFile of jsFiles) {
  const filePath = path.join(distDir, jsFile);
  const size = fs.statSync(filePath).size;
  const sizeKB = Math.round(size / 1024);

  // Flag chunks > 500KB
  if (size > 500 * 1024) {
    issues.push({
      severity: size > 2000 * 1024 ? 'CRITICAL' : 'WARNING',
      message: jsFile + ' is ' + sizeKB + ' KB — consider code splitting',
    });
  }

  // Check for unminified code patterns
  const content = fs.readFileSync(filePath, 'utf8').slice(0, 10000);
  if (content.includes('  function ') || content.includes('  var ') || content.includes('  const ')) {
    // Rough heuristic for unminified code
    const indentedLines = content.split('\n').filter(l => l.startsWith('  ')).length;
    if (indentedLines > 20) {
      issues.push({
        severity: 'WARNING',
        message: jsFile + ' appears to contain unminified code',
      });
    }
  }
}

// Check total JS size
const totalSize = jsFiles.reduce((sum, f) => sum + fs.statSync(path.join(distDir, f)).size, 0);
const totalKB = Math.round(totalSize / 1024);
if (totalSize > 5000 * 1024) {
  issues.push({
    severity: 'CRITICAL',
    message: 'Total JS bundle is ' + totalKB + ' KB (' + Math.round(totalKB / 1024) + ' MB) — major optimization needed',
  });
}

if (issues.length === 0) {
  console.log('  No major optimization issues detected.');
} else {
  for (const issue of issues.sort((a, b) => (a.severity === 'CRITICAL' ? -1 : 1))) {
    console.log('  [' + issue.severity + '] ' + issue.message);
  }
}
"

echo ""
echo "=== Analysis Complete ==="
