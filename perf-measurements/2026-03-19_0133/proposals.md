# 改善施策提案

**計測日時**: 2026-03-19 01:33 (gzip/brotli 圧縮有効化後)
**現在の推定スコア**: 64 / 100 点（ページランディング）
**提案日時**: 2026-03-19 02:00

## 現状の課題サマリー

最大の失点は **LCP (18.8点/25点失点)**。作者・作品・エピソードページの LCP が 15〜17 秒で、
書影画像が SSR HTML に含まれず JS 経由で動的に挿入されることが原因。
次に **TBT (11.6点/30点失点)** で、vendor-admin チャンク (118KB gzip) が全ページで読み込まれる
コード分割バグと、ルート単位の code splitting 未実施が主因。

## 改善施策一覧

### 施策 1: MUI アイコンをインライン SVG に置き換え、vendor-admin を全ページから除外する

- **対象メトリクス**: TBT, FCP, SI
- **期待される改善**: 全ページで vendor-admin チャンク (118KB gzip) の読み込みを排除。TBT 50-100ms 削減、Script Evaluation 大幅短縮
- **優先度**: 最高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `SvgIcon.tsx` が `@mui/icons-material` から 6 アイコンを import しており、これが全ページで vendor-admin チャンクを引き込む原因
  2. 使用されている 6 アイコン (ArrowBack, Close, Favorite, FavoriteBorder, NavigateNext, Search) をインライン SVG に置換
  3. `@mui/icons-material` の import を完全に除去
  4. Vite マニフェストで `src/index.tsx` → `vendor-admin` の静的依存が消えることを確認
- **対象ファイル**:
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx`
- **レギュレーション注意点**: アイコンの見た目が MUI オリジナルと同一であること（VRT 差異 3% 以内）

---

### 施策 2: SSR で書影・作者データを SWR fallback に含め、LCP 画像を HTML から発見可能にする

- **対象メトリクス**: LCP (主要), SI
- **期待される改善**: LCP Resource Load Delay 1,128ms を大幅削減。詳細ページ LCP 15-17秒 → 2-5秒。LCP スコア 0 → 0.3-0.6
- **優先度**: 最高
- **実装難易度**: 中
- **影響範囲**: 作者・作品・エピソードページ
- **具体的な作業内容**:
  1. `createInjectDataStr()` は現在 release/feature/ranking のみ inject している
  2. リクエストパスを解析し、該当ページの book/author/episode データも SWR fallback に含める
     - `/books/:bookId` → bookApiClient.fetch + episodeApiClient.fetchList
     - `/authors/:authorId` → authorApiClient.fetch
     - `/books/:bookId/episodes/:episodeId` → bookApiClient.fetch + episodeApiClient.fetch
  3. これにより SSR 時に `useBook()` → `useImage()` が即座にデータ取得 → `<img src>` が SSR HTML に含まれる
  4. ブラウザが HTML パース時に画像を発見 → Resource Load Delay が 0 に近づく
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` (createInjectDataStr にルートパス解析とデータ取得を追加)
  - `workspaces/app/src/features/book/apiClient/bookApiClient.ts` (SSR で使う API クライアント)
  - `workspaces/app/src/features/episode/apiClient/episodeApiClient.ts`
  - `workspaces/app/src/features/author/apiClient/authorApiClient.ts`
- **レギュレーション注意点**: ハイドレーションエラーが出ないこと。SSR と CSR で同じデータが使われること

---

### 施策 3: LCP 画像に fetchpriority="high" を設定し、`<link rel="preload">` を追加する

- **対象メトリクス**: LCP
- **期待される改善**: 施策 2 と組み合わせることで LCP Resource Load Delay をさらに削減。ブラウザが LCP 画像を最優先でダウンロード
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 作者・作品・エピソードページ
- **具体的な作業内容**:
  1. `Image.tsx` コンポーネントに `fetchPriority` prop を追加
  2. BookDetailPage, AuthorDetailPage の書影画像に `fetchPriority="high"` を設定
  3. SSR HTML の `<head>` に書影画像の `<link rel="preload" as="image">` を動的に追加
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Image.tsx`
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx`
  - `workspaces/server/src/routes/ssr/index.tsx`
- **レギュレーション注意点**: なし

---

### 施策 4: エピソード API の N+1 問題を解消する

- **対象メトリクス**: LCP, SI
- **期待される改善**: 作品詳細ページの API リクエスト 14 本 → 1-2 本に削減。ネットワーク Critical Path 短縮
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 作品詳細ページ
- **具体的な作業内容**:
  1. `GET /api/v1/episodes?bookId=:id` のレスポンスにエピソード詳細データ（画像、ページ数等）を含める
     - サーバー側 `episodeRepository.readAll()` は既に `with: { image, pages }` で取得しているので、レスポンスに含めるだけ
  2. `EpisodeListItem` で個別 `useEpisode` 呼び出しをやめ、リストデータを直接使う
- **対象ファイル**:
  - `workspaces/server/src/routes/api/episodes/getEpisodeList.ts`
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx`
  - `workspaces/app/src/features/episode/hooks/useEpisodeList.ts`
  - `workspaces/schema/src/api/episodes/`
- **レギュレーション注意点**: 既存 API レスポンスへの項目追加は許可されている

---

### 施策 5: ComicViewerCore の同期処理を最適化する

- **対象メトリクス**: TBT
- **期待される改善**: エピソードページの TBT 440ms → 200ms 以下。`getScrollToLeft()` の 4,096 回ループと `useInterval(rerender, 0)` の毎フレーム再レンダリングを修正
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: エピソードページ
- **具体的な作業内容**:
  1. `getScrollToLeft()` のループ回数を `2 ** 12` (4,096) → `2 ** 7` (128) に削減
  2. `useInterval(rerender, 0)` を `ResizeObserver` ベースに変更（サイズ変更時のみ再レンダリング）
- **対象ファイル**:
  - `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx` (lines 32, 104)
- **レギュレーション注意点**: ビューアーのスクロール・表示挙動が変わらないこと。VRT 差異 3% 以内

---

### 施策 6: 画像の Cache-Control ヘッダを修正する

- **対象メトリクス**: LCP, SI
- **期待される改善**: 再訪時の画像再ダウンロード不要。LCP 改善（キャッシュヒット時）
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `cacheControlMiddleware.ts` で全レスポンスに `Cache-Control: private, no-store` を設定しているのを修正
  2. 画像ルート (`/images/*`) に対しては `Cache-Control: public, max-age=86400` を設定
  3. 静的アセット (`/assets/*`) に対しては `Cache-Control: public, max-age=31536000, immutable` を設定
- **対象ファイル**:
  - `workspaces/server/src/middlewares/cacheControlMiddleware.ts`
- **レギュレーション注意点**: `POST /api/v1/initialize` 後にキャッシュが古いデータを返さないよう注意

---

### 施策 7: SSR HTML サイズを削減する

- **対象メトリクス**: SI, TTFB
- **期待される改善**: HTML サイズ 1.1-1.4MB → 数百KB。TTFB 50-100ms 短縮
- **優先度**: 低
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. SWR の inject-data に含まれるデータ量を確認・削減
  2. 現在のページで使わないデータ（release/feature/ranking の全データ）をルートパスに応じて絞り込む
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` (createInjectDataStr)
- **レギュレーション注意点**: ハイドレーションエラーが出ないこと

---

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 推定スコア改善 |
|------|------|--------------------|----------|--------|---------------|
| 1 | MUI アイコン → インライン SVG (vendor-admin 除外) | TBT, SI | 大 | 低 | +5-10 |
| 2 | SSR で書影データを SWR fallback に含める | LCP | 大 | 中 | +10-15 |
| 3 | LCP 画像に fetchpriority + preload | LCP | 中 | 低 | +2-5 |
| 4 | エピソード API N+1 解消 | LCP, SI | 中 | 中 | +3-5 |
| 5 | ComicViewerCore 最適化 | TBT | 小〜中 | 低 | +1-3 |
| 6 | 画像 Cache-Control 修正 | LCP, SI | 小〜中 | 低 | +1-2 |
| 7 | SSR HTML サイズ削減 | SI, TTFB | 小 | 中 | +1-2 |

## 次のステップ

1. **施策 1 (MUI アイコン置換)** から着手 — 最も簡単で TBT・バンドルサイズに大きく効く
2. **施策 2 (SSR 書影データ注入)** — LCP の根本原因を解消する最重要施策
3. 施策 3 は施策 2 と同時に実装可能
4. 各施策の実装後は `perf-validate` でビルド・テスト確認、まとまったら `perf-measure` で再計測
