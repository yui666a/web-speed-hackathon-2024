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

## 前提条件

- サーバーが `http://localhost:8000` で起動していること (`pnpm run start`)
- Chrome ブラウザが起動していること（chrome-devtools MCP 用）

## ワークフロー

### Step 1: Lighthouse 計測の実行

同ディレクトリの `run-lighthouse.sh` を実行する。特定ページのみ計測したい場合は手動で `npx lighthouse` を実行。

```bash
bash .claude/skills/perf-measure/run-lighthouse.sh
```

出力末尾の `TIMESTAMP=...` を控えておく。

### Step 2: レポート生成

同ディレクトリの `generate-report.sh` を実行する。前回結果がある場合は自動で比較する。

```bash
# latest シンボリックリンクが前回結果を指している場合
PREV=$(readlink perf-measurements/latest 2>/dev/null || echo "")
bash .claude/skills/perf-measure/generate-report.sh <TIMESTAMP> "$PREV"
```

生成物: `perf-measurements/<TIMESTAMP>/report.md`（スコアサマリー + 配点ウェイト別失点分析）

### Step 3: chrome-devtools MCP で詳細分析

Lighthouse スコアが最も低い1〜2ページに対して実行する。

1. `navigate_page` で対象ページに遷移
2. `performance_start_trace` で `reload: true`, `autoStop: true` を指定してトレース
3. 得られた Insights を記録
4. 必要に応じて `performance_analyze_insight` で深掘り

注目すべきインサイト: **LCPBreakdown**, **CLSCulprits**, **RenderBlocking**, **DocumentLatency**, **LCPDiscovery**

### Step 4: レポート補完と完了

chrome-devtools の分析結果を `report.md` の「chrome-devtools トレース結果」セクションに追記する。

完了後ユーザーに案内：
- 詳細は `perf-measurements/<TIMESTAMP>/report.md` を参照
- 改善施策が必要なら「改善案を考えて」と言うか perf-propose スキルを呼ぶ
