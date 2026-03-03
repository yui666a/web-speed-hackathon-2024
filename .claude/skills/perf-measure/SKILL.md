---
name: perf-measure
description: |
  Web Speed Hackathon 2024 のパフォーマンス計測・レポート出力スキル。
  Lighthouse CLI と chrome-devtools MCP を使って採点対象ページを計測し、
  スコア・メトリクス・インサイトを構造化された MD ファイルに記録する。
  過去の計測結果との比較機能あり。

  このスキルは以下のような場面で使うこと：
  - 「パフォーマンス測定」「パフォーマンス計測」「Lighthouse 計測」と言われたとき
  - 「スコアを測って」「今のスコアは？」「ベンチマーク取って」と言われたとき
  - パフォーマンス最適化の進捗確認を求められたとき
  - 「perf」「計測」「CWV」「Core Web Vitals」に言及があったとき
  改善施策の提案が必要な場合は perf-propose スキルに引き継ぐこと。
---

# パフォーマンス計測スキル

## 概要

Web Speed Hackathon 2024 (Cyber TOON) の採点対象ページを計測し、結果をレポートにまとめる。
改善施策の提案は perf-propose スキルの担当なので、このスキルでは行わない。
計測が終わったら、ユーザーに「改善施策の提案が必要なら perf-propose を呼べる」と伝えること。

## 前提条件

- サーバーが `http://localhost:8000` で起動していること (`pnpm run start`)
- Chrome ブラウザが起動していること（chrome-devtools MCP 用）

サーバーが起動していない場合は、ユーザーに起動を促すこと。

## ワークフロー

### Step 1: 計測対象ページの決定

デフォルトの採点対象4ページ：

| ページ | URL |
|--------|-----|
| ホームページ | `http://localhost:8000/` |
| 作者詳細 | `http://localhost:8000/authors/2ab0aca5-7dc2-4543-ac98-e23fdaca0739` |
| 作品詳細 | `http://localhost:8000/books/cf6552c4-a713-468d-ab76-9cabb51e62ac` |
| エピソード | `http://localhost:8000/books/cf6552c4-a713-468d-ab76-9cabb51e62ac/episodes/4a9f9923-cac7-4206-aba7-fbe5e28eb593` |

ユーザーが特定ページを指定した場合はそのページのみ計測する。

### Step 2: 計測ディレクトリの準備

タイムスタンプ付きのディレクトリを作成する：

```bash
TIMESTAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p perf-measurements/$TIMESTAMP
```

### Step 3: Lighthouse CLI で定量計測

各ページに対して Lighthouse CLI を実行する。

```bash
npx lighthouse <URL> \
  --output json \
  --output-path ./perf-measurements/$TIMESTAMP/<page-name>.json \
  --chrome-flags="--headless" \
  --only-categories=performance
```

ページ名のマッピング：
- ホームページ → `home.json`
- 作者詳細 → `author.json`
- 作品詳細 → `book.json`
- エピソード → `episode.json`

JSON レポートからスコアとメトリクスを抽出する：

```bash
node -e "
const r = JSON.parse(require('fs').readFileSync('<json-path>', 'utf8'));
const a = r.audits;
console.log(JSON.stringify({
  score: Math.round(r.categories.performance.score * 100),
  fcp: { value: a['first-contentful-paint'].numericValue, display: a['first-contentful-paint'].displayValue, score: a['first-contentful-paint'].score },
  si: { value: a['speed-index'].numericValue, display: a['speed-index'].displayValue, score: a['speed-index'].score },
  lcp: { value: a['largest-contentful-paint'].numericValue, display: a['largest-contentful-paint'].displayValue, score: a['largest-contentful-paint'].score },
  tbt: { value: a['total-blocking-time'].numericValue, display: a['total-blocking-time'].displayValue, score: a['total-blocking-time'].score },
  cls: { value: a['cumulative-layout-shift'].numericValue, display: a['cumulative-layout-shift'].displayValue, score: a['cumulative-layout-shift'].score }
}, null, 2));
"
```

### Step 4: chrome-devtools MCP で詳細分析

Lighthouse のスコアだけでは改善の方向性がわかりにくいため、chrome-devtools MCP でトレースを取得し、具体的なボトルネックを特定する。

全ページではなく、Lighthouse スコアが最も低いページ1〜2ページに絞って実行すると効率的。

1. `navigate_page` で対象ページに遷移
2. `performance_start_trace` で `reload: true`, `autoStop: true` を指定してトレース
3. 得られた Insights を記録
4. 必要に応じて `performance_analyze_insight` で特定のインサイトを深掘り

特に注目すべきインサイト：
- **DocumentLatency**: サーバーレスポンス時間の問題
- **LCPDiscovery**: LCP リソースの発見タイミング
- **LCPBreakdown**: LCP の内訳（TTFB, Load delay, Load duration, Render delay）
- **CLSCulprits**: CLS の原因要素
- **RenderBlocking**: レンダリングブロックリソース
- **ThirdParties**: サードパーティリソースの影響

### Step 5: 過去の計測結果との比較

`perf-measurements/latest` シンボリックリンクが存在する場合、前回の JSON を読み込んでスコアを比較する。

比較フォーマット：
- 改善: `↑ +5 (70 → 75)`
- 悪化: `↓ -3 (75 → 72)`
- 変化なし: `→ 0 (75 → 75)`

### Step 6: レポート出力

`perf-measurements/$TIMESTAMP/report.md` に出力する：

```markdown
# パフォーマンス計測レポート

**計測日時**: YYYY-MM-DD HH:MM
**計測環境**: Lighthouse CLI (シミュレーションスロットリング)

## スコアサマリー

| ページ | Score | FCP | SI | LCP | TBT | CLS | 前回比 |
|--------|-------|-----|----|----|-----|-----|--------|
| ホーム | XX | X.Xs | X.Xs | X.Xs | XXms | X.XX | ↑ +N |
| 作者詳細 | XX | ... | ... | ... | ... | ... | ... |
| 作品詳細 | XX | ... | ... | ... | ... | ... | ... |
| エピソード | XX | ... | ... | ... | ... | ... | ... |

**推定合計スコア**: XX / 100 点（ページランディング）

## 配点ウェイト別の失点分析

各メトリクスの配点ウェイト（TBT:30, LCP:25, CLS:25, FCP:10, SI:10）に基づき、
失点が大きい順に整理する。これにより perf-propose スキルが改善優先度を判断できる。

| メトリクス | 配点 | 4ページ平均スコア | 失点 |
|-----------|------|-----------------|------|
| TBT | 30点 | X.XX | XX点 |
| LCP | 25点 | X.XX | XX点 |
| CLS | 25点 | X.XX | XX点 |
| FCP | 10点 | X.XX | XX点 |
| SI | 10点 | X.XX | XX点 |

## chrome-devtools トレース結果

### [ページ名] のインサイト
- ...

## 前回からの変化

（前回結果がある場合のみ。ない場合は「初回計測」と記載）
```

### Step 7: シンボリックリンクの更新

```bash
ln -sfn $TIMESTAMP perf-measurements/latest
```

### Step 8: 完了報告

計測結果の要約をユーザーに伝え、以下を案内する：
- 詳細は `perf-measurements/$TIMESTAMP/report.md` を参照
- 改善施策の提案が必要なら「改善案を考えて」と言うか perf-propose スキルを呼ぶ

## ディレクトリ構成

```
perf-measurements/
├── YYYY-MM-DD_HHMM/       # タイムスタンプ付きディレクトリ
│   ├── home.json           # Lighthouse JSON (ホームページ)
│   ├── author.json         # Lighthouse JSON (作者詳細)
│   ├── book.json           # Lighthouse JSON (作品詳細)
│   ├── episode.json        # Lighthouse JSON (エピソード)
│   └── report.md           # 計測結果レポート
└── latest -> YYYY-MM-DD_HHMM/  # 最新結果へのシンボリックリンク
```
