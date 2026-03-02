# 01. 計測環境のセットアップ

Web パフォーマンス最適化の第一歩として、計測ツールの導入手順をまとめる。

## Chrome DevTools MCP (Model Context Protocol)

Claude Code から Chrome ブラウザを直接操作し、パフォーマンストレース（Core Web Vitals 取得）やスナップショット取得を行うための MCP サーバー。

### セットアップ

プロジェクトルートに `.mcp.json` を作成する：

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

- `npx -y` で毎回最新版を自動インストール・実行する
- Claude Code 起動時に自動で MCP サーバーが接続される
- Chrome が起動していれば、ページ操作・スクリーンショット・パフォーマンストレースなどが可能
- 注意： chrome-devtools-mcp は node@22.19.0 以上が必要

### 主な使い方

| 操作 | MCP ツール名 | 用途 |
|------|-------------|------|
| ページを開く | `new_page` | 指定 URL を新しいタブで開く |
| スクリーンショット | `take_screenshot` | 現在のページを画像キャプチャ |
| テキストスナップショット | `take_snapshot` | a11y ツリーベースのページ構造取得 |
| パフォーマンストレース | `performance_start_trace` | CWV スコア・インサイトを取得 |
| コンソール確認 | `list_console_messages` | エラー・警告の確認 |
| ネットワーク確認 | `list_network_requests` | リクエスト一覧の確認 |

### パフォーマンストレースの例

`performance_start_trace` に `reload: true`, `autoStop: true` を指定すると、ページリロードから自動でトレースを記録・停止し、以下のような結果が得られる：

```
Metrics (lab / observed):
  - LCP: 4350 ms
  - CLS: 0.17

LCP breakdown:
  - TTFB: 914 ms
  - Load delay: 9 ms
  - Load duration: 2,826 ms
  - Render delay: 601 ms

Insights:
  - DocumentLatency: FCP/LCP で約 813ms の改善余地
  - LCPDiscovery: LCP 画像の発見が遅い
  - CLSCulprits: レイアウトシフトの原因要素あり
```

> **Note**: MCP トレースはスロットリングなし（実機速度）で計測される。Lighthouse のシミュレーション環境とは異なるため、数値に差が出る。

---

## Lighthouse CLI

Google 製の Web パフォーマンス計測ツール。Performance / Accessibility / Best Practices / SEO の 4 カテゴリでスコアリングする。

### インストール

グローバルインストールは不要。`npx` で直接実行できる：

```bash
# バージョン確認
npx lighthouse --version
# → 13.0.3

# 実行にはChrome/Chromiumが必要
# macOS なら通常インストール済み
```

プロジェクトに固定したい場合は devDependencies に追加：

```bash
pnpm add -D lighthouse
```

### 基本的な使い方

```bash
# HTML レポート出力（ブラウザで閲覧可能）
npx lighthouse http://localhost:8000 \
  --output html \
  --output-path ./lighthouse-report.html \
  --chrome-flags="--headless"

# JSON 出力（プログラムで処理可能）
npx lighthouse http://localhost:8000 \
  --output json \
  --output-path ./lighthouse-report.json \
  --chrome-flags="--headless"

# HTML + JSON 同時出力
npx lighthouse http://localhost:8000 \
  --output html --output json \
  --output-path ./lighthouse-report \
  --chrome-flags="--headless"
```

### 主要オプション

| オプション | 説明 |
|-----------|------|
| `--output html\|json\|csv` | 出力形式 |
| `--output-path <path>` | レポート保存先 |
| `--chrome-flags="--headless"` | ヘッドレスモードで実行 |
| `--only-categories=performance` | 特定カテゴリのみ計測 |
| `--view` | 計測後にブラウザでレポートを開く |
| `--preset=desktop` | デスクトップ設定で計測（デフォルトはモバイル） |

### JSON レポートからスコアを抽出するワンライナー

```bash
npx lighthouse http://localhost:8000 \
  --output json \
  --chrome-flags="--headless" 2>/dev/null \
  | node -e "
const data = require('fs').readFileSync('/dev/stdin','utf8');
const r = JSON.parse(data);
const c = r.categories;
console.log('=== Scores ===');
Object.entries(c).forEach(([k,v]) => console.log(v.title + ': ' + Math.round(v.score*100)));
console.log('');
const a = r.audits;
const metrics = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive'
];
console.log('=== Metrics ===');
metrics.forEach(m => {
  if(a[m]) console.log(a[m].title + ': ' + a[m].displayValue);
});
"
```

---

## MCP トレース vs Lighthouse の違い

| 項目 | MCP パフォーマンストレース | Lighthouse CLI |
|------|--------------------------|----------------|
| スロットリング | なし（実機速度） | あり（Slow 4G + CPU 4x） |
| スコアリング | CWV 値のみ（点数なし） | 0-100 点のスコア |
| インサイト | 具体的な改善提案 | 改善提案 + 節約量の見積もり |
| 操作性 | Claude Code から対話的に実行 | CLI でバッチ実行 |
| 用途 | 開発中の素早い確認 | 定量的なベンチマーク |

> **推奨ワークフロー**: 開発中は MCP トレースで素早くフィードバックを得て、マイルストーンごとに Lighthouse CLI でフルスコアを記録する。
