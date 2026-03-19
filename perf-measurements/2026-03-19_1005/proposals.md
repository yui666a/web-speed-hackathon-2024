# 改善施策提案

**計測日時**: 2026-03-19 10:05 (gzip/brotli 圧縮 + MUI アイコン置換後)
**現在の推定スコア**: 69 / 100 点（ページランディング）
**提案日時**: 2026-03-19 10:30

## 現状の課題サマリー

最大の失点は **LCP (18.8点/25点失点)**。ホームページは LCP 1.4秒 (スコア 1.0) で解決済みだが、
作者・作品・エピソードの詳細ページが LCP 15〜17秒 (スコア 0) のまま。
原因は SSR HTML に書影画像の `<img src>` が含まれず、JS 実行後の API 呼び出しを待ってから画像 URL が確定するため。
TBT (6.9点) と SI (3.7点) も残るが、LCP 解消が最大のインパクト。

## 改善施策一覧

### 施策 1: SSR で書影・作者・エピソードデータを SWR fallback に含める

- **対象メトリクス**: LCP (主要), SI
- **期待される改善**: 詳細ページ LCP 15-17秒 → 1-3秒。LCP スコア 0 → 0.7-1.0。**失点 18.8点 → 2-5点 (13-16点改善)**
- **優先度**: 最高
- **実装難易度**: 中
- **影響範囲**: 作者・作品・エピソードページ
- **具体的な作業内容**:
  1. `createInjectDataStr()` に `path` パラメータを追加し、リクエストパスに応じたデータ取得を行う
  2. パスのパターンマッチングで bookId / authorId / episodeId を抽出:
     - `/books/:bookId` → bookApiClient.fetch + episodeApiClient.fetchList
     - `/authors/:authorId` → authorApiClient.fetch
     - `/books/:bookId/episodes/:episodeId` → bookApiClient.fetch + episodeApiClient.fetch
  3. 取得したデータを `unstable_serialize(xxxApiClient.fetch$$key({...}))` でキーを生成し、fallback に注入
  4. これにより SSR 時に `useBook()` → `useImage()` が即座にデータ取得 → `<img src="/images/{id}?...">` が SSR HTML に含まれる
  5. ハンドラ側で `createInjectDataStr(c.req.path)` を呼ぶように修正
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx`
- **レギュレーション注意点**: ハイドレーションエラーが出ないこと（SWR キーがクライアントと完全一致すること）

---

### 施策 2: LCP 画像に fetchpriority="high" を設定する

- **対象メトリクス**: LCP
- **期待される改善**: 施策 1 と組み合わせることで LCP をさらに 0.5-1秒短縮。ブラウザが LCP 画像を最優先でダウンロード
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 作者・作品ページ
- **具体的な作業内容**:
  1. `Image.tsx` の props に `fetchPriority` を受け取れるようにする（`...rest` で既に通るが明示）
  2. BookDetailPage の書影画像に `fetchPriority="high"` を付与
  3. AuthorDetailPage のプロフィール画像に `fetchPriority="high"` を付与
- **対象ファイル**:
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx`
- **レギュレーション注意点**: なし

---

### 施策 3: エピソード API の N+1 問題を解消する

- **対象メトリクス**: LCP, SI
- **期待される改善**: 作品詳細ページの API リクエスト 14 本 → 1-2 本に削減。SI 大幅改善
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 作品詳細ページ
- **具体的な作業内容**:
  1. `GET /api/v1/episodes?bookId=:id` のレスポンスにエピソード詳細データ（画像、ページ数等）を含める
  2. `EpisodeListItem` で個別 `useEpisode` 呼び出しをやめ、リストデータを直接使う
- **対象ファイル**:
  - `workspaces/server/src/routes/api/episodes/getEpisodeList.ts`
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx`
  - `workspaces/schema/src/api/episodes/`
- **レギュレーション注意点**: 既存 API レスポンスへの項目追加は許可されている

---

### 施策 4: 画像の Cache-Control ヘッダを修正する

- **対象メトリクス**: LCP, SI
- **期待される改善**: Lighthouse は初回訪問をシミュレートするため直接のスコア改善は限定的だが、再訪時のパフォーマンスと画像配信の効率が向上
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `cacheControlMiddleware.ts` でパスに応じたキャッシュ戦略を設定
  2. `/assets/*` → `public, max-age=31536000, immutable`
  3. `/images/*` → `public, max-age=86400`
  4. API レスポンスは現状維持 (`private, no-store`)
- **対象ファイル**:
  - `workspaces/server/src/middlewares/cacheControlMiddleware.ts`
- **レギュレーション注意点**: `POST /api/v1/initialize` 後にキャッシュ不整合が起きないこと

---

### 施策 5: ComicViewerCore の同期処理を最適化する

- **対象メトリクス**: TBT
- **期待される改善**: エピソードページの TBT 290ms → 150ms 以下
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: エピソードページ
- **具体的な作業内容**:
  1. `getScrollToLeft()` のループ回数を `2 ** 12` (4,096) → `2 ** 7` (128) に削減
  2. `useInterval(rerender, 0)` を `ResizeObserver` ベースに変更
- **対象ファイル**:
  - `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx`
- **レギュレーション注意点**: ビューアーのスクロール挙動が変わらないこと

---

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 推定スコア改善 |
|------|------|--------------------|----------|--------|---------------|
| 1 | SSR で書影データを SWR fallback に含める | LCP | 大 | 中 | +13-16 |
| 2 | LCP 画像に fetchpriority="high" | LCP | 小〜中 | 低 | +1-3 |
| 3 | エピソード API N+1 解消 | LCP, SI | 中 | 中 | +2-5 |
| 4 | 画像 Cache-Control 修正 | LCP | 小 | 低 | +0-1 |
| 5 | ComicViewerCore 最適化 | TBT | 小 | 低 | +1-2 |

## 次のステップ

1. **施策 1 (SSR 書影データ注入)** から着手 — LCP の根本原因を解消する最重要施策
2. **施策 2 (fetchpriority)** は施策 1 と同時に実装可能
3. 各施策の実装後は `perf-validate` でビルド・テスト確認、まとまったら `perf-measure` で再計測
