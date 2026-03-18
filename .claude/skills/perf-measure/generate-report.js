#!/usr/bin/env node
// Usage: node generate-report.js <out_dir> <report_path> [prev_dir]
// Reads Lighthouse JSON files and generates report.md with scoring analysis.

const fs = require('fs');
const path = require('path');

const outDir = process.argv[2];
const reportPath = process.argv[3];
const prevDir = process.argv[4] || '';

if (!outDir || !reportPath) {
  console.error('Usage: node generate-report.js <out_dir> <report_path> [prev_dir]');
  process.exit(1);
}

const timestamp = path.basename(outDir);

const pages = [
  { key: 'home', label: 'ホーム' },
  { key: 'author', label: '作者詳細' },
  { key: 'book', label: '作品詳細' },
  { key: 'episode', label: 'エピソード' },
];

function extractMetrics(jsonPath) {
  const r = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const a = r.audits;
  return {
    score: Math.round(r.categories.performance.score * 100),
    fcp: { display: a['first-contentful-paint'].displayValue, score: a['first-contentful-paint'].score },
    si:  { display: a['speed-index'].displayValue, score: a['speed-index'].score },
    lcp: { display: a['largest-contentful-paint'].displayValue, score: a['largest-contentful-paint'].score },
    tbt: { display: a['total-blocking-time'].displayValue, score: a['total-blocking-time'].score },
    cls: { display: a['cumulative-layout-shift'].displayValue, score: a['cumulative-layout-shift'].score },
  };
}

function formatTimestamp(ts) {
  return ts.replace('_', ' ').replace(/(\d{2})(\d{2})$/, '$1:$2');
}

function compare(cur, prev) {
  const diff = cur - prev;
  if (diff > 0) return `↑ +${diff} (${prev}→${cur})`;
  if (diff < 0) return `↓ ${diff} (${prev}→${cur})`;
  return `→ 0 (${prev}→${cur})`;
}

// Collect metrics
const results = pages.map(p => {
  const m = extractMetrics(path.join(outDir, p.key + '.json'));
  let prevScore = null;
  if (prevDir) {
    const prevJson = path.join(prevDir, p.key + '.json');
    if (fs.existsSync(prevJson)) {
      const pr = JSON.parse(fs.readFileSync(prevJson, 'utf8'));
      prevScore = Math.round(pr.categories.performance.score * 100);
    }
  }
  return { ...p, m, prevScore };
});

// Build report
const lines = [];
lines.push('# パフォーマンス計測レポート');
lines.push('');
lines.push(`**計測日時**: ${formatTimestamp(timestamp)}`);
lines.push('**計測環境**: Lighthouse CLI (シミュレーションスロットリング)');
if (prevDir) {
  lines.push(`**前回計測**: ${formatTimestamp(path.basename(prevDir))}`);
}
lines.push('');

// Score summary table
lines.push('## スコアサマリー');
lines.push('');
lines.push('| ページ | Score | FCP | SI | LCP | TBT | CLS | 前回比 |');
lines.push('|--------|-------|-----|----|----|-----|-----|--------|');

let totalScore = 0;
const metricSums = { fcp: 0, si: 0, lcp: 0, tbt: 0, cls: 0 };

for (const r of results) {
  const { m, prevScore, label } = r;
  totalScore += m.score;
  for (const k of Object.keys(metricSums)) metricSums[k] += m[k].score;

  const comp = prevScore !== null ? compare(m.score, prevScore) : '-';
  lines.push(`| ${label} | ${m.score} | ${m.fcp.display} (${m.fcp.score}) | ${m.si.display} (${m.si.score}) | ${m.lcp.display} (${m.lcp.score}) | ${m.tbt.display} (${m.tbt.score}) | ${m.cls.display} (${m.cls.score}) | ${comp} |`);
}

const avgScore = totalScore / 4;
lines.push('');
lines.push(`**4ページ平均スコア**: ${avgScore} / 100`);
lines.push(`**推定合計スコア**: 約 ${Math.round(avgScore)} / 100 点（ページランディング）`);
lines.push('');

// Weighted loss analysis
lines.push('## 配点ウェイト別の失点分析');
lines.push('');
lines.push('| メトリクス | 配点 | 4ページ平均スコア | 失点 |');
lines.push('|-----------|------|-----------------|------|');

const weights = [
  { name: 'TBT', key: 'tbt', w: 30 },
  { name: 'LCP', key: 'lcp', w: 25 },
  { name: 'CLS', key: 'cls', w: 25 },
  { name: 'FCP', key: 'fcp', w: 10 },
  { name: 'SI',  key: 'si',  w: 10 },
];

const lossEntries = weights.map(({ name, key, w }) => {
  const avg = metricSums[key] / 4;
  const loss = w * (1 - avg);
  return { name, w, avg, loss };
}).sort((a, b) => b.loss - a.loss);

let totalLoss = 0;
for (const e of lossEntries) {
  totalLoss += e.loss;
  lines.push(`| ${e.name} | ${e.w}点 | ${e.avg.toFixed(2)} | **${e.loss.toFixed(1)}点** |`);
}
lines.push(`| **合計** | **100点** | - | **${totalLoss.toFixed(1)}点** |`);
lines.push('');

// chrome-devtools placeholder
lines.push('## chrome-devtools トレース結果');
lines.push('');
lines.push('(chrome-devtools MCP による分析結果をここに追記)');
lines.push('');

// Previous comparison
if (prevDir) {
  lines.push('## 前回からの変化');
  lines.push('');
  lines.push(`- 前回計測: ${formatTimestamp(path.basename(prevDir))}`);
  let prevTotal = 0;
  for (const r of results) {
    if (r.prevScore !== null) prevTotal += r.prevScore;
  }
  lines.push(`- 4ページ平均: ${prevTotal / 4} → ${avgScore}`);
} else {
  lines.push('## 前回からの変化');
  lines.push('');
  lines.push('初回計測');
}
lines.push('');

fs.writeFileSync(reportPath, lines.join('\n'));
console.log(`Report generated: ${reportPath}`);
