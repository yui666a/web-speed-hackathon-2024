---
name: perf-validate
description: |
  パフォーマンス改善施策の実装後に、ビルド・バンドルサイズ・レギュレーション・E2E/VRT を
  一括検証するスキル。perf-measure で再計測する前の事前チェックとして使う。

  このスキルは以下のような場面で使うこと：
  - 施策の実装が完了して「確認して」「チェックして」「大丈夫か見て」と言われたとき
  - ビルドが通るか、テストが通るか確認したいとき
  - 「レギュレーション違反してないか」「VRT 大丈夫か」と聞かれたとき
  - perf-measure の前にサニティチェックしたいとき
  - 「validate」「検証」「テスト」に言及があったとき
---

# パフォーマンス検証スキル

## 概要

施策実装後に「ビルド → バンドルサイズ → レギュレーション → E2E/VRT」を一括検証する。
問題があれば perf-measure 前に修正できるので、イテレーションのロスを防ぐ。

## ワークフロー

### Step 1: 検証スクリプトの実行

```bash
bash .claude/skills/perf-validate/validate.sh
```

オプション：
- `--skip-test`: E2E/VRT をスキップ（ビルド確認だけしたいとき）
- `--skip-build`: ビルド済みの場合にスキップ

### Step 2: 結果の確認と対応

スクリプトの出力を確認し、FAIL がある場合は原因を特定して修正する。

チェック項目：
1. **Build** — `pnpm run build` が成功するか
2. **Bundle Size** — JS の総サイズとチャンク内訳。前回ビルドとの差分
3. **Regulation Checks**:
   - SW registration が client ソースに存在するか
   - serviceworker.global.js がビルド出力に含まれるか
   - 画像の難読化（decrypt）が SW に実装されているか
   - DB initialize エンドポイントが存在するか
   - Vite manifest が生成されているか
4. **E2E/VRT** — Playwright テストが通るか（VRT 差異 3% 以内）

### Step 3: 全チェック通過後

「Status: PASSED」が出たら perf-measure で再計測して効果を確認する。
