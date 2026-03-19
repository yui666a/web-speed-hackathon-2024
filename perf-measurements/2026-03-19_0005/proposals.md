# 改善施策提案

**計測日時**: 2026-03-19 00:05
**現在の推定スコア**: 44.5 / 100 点（ページランディング）
**提案日時**: 2026-03-19 00:30

## 現状の課題サマリー

最大の失点は **LCP (24.8点/25点失点)** で、作者・作品・エピソードページの LCP が 54〜56 秒と壊滅的。
次に **TBT (10.5点/30点失点)**、**FCP (9.9点/10点失点)**、**SI (9.4点/10点失点)** が続く。
根本原因として、**gzip/brotli 圧縮が無効** (9MB のバンドルが無圧縮で転送)、**vendor-admin が全ページで読み込まれるコード分割バグ**、
**LCP 画像が JS 経由で動的挿入**される問題が複合的に効いている。

## 改善施策一覧

### 施策 1: gzip/brotli 圧縮を有効化する

- **対象メトリクス**: FCP, LCP, SI, TBT (全メトリクス改善)
- **期待される改善**: 転送サイズ 60-70% 削減。client.js 9.0MB → ~2.7MB (gzip) / ~2.2MB (brotli)。FCP 3-4秒短縮、全ページスコア +15-20 点
- **優先度**: 最高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/compressMiddleware.ts` を修正
    - 現状: `X-Accept-Encoding` ヘッダで `zstd` のみ対応（SW のカスタム圧縮用）
    - 標準の `Accept-Encoding` ヘッダで `gzip` / `br` (brotli) に対応する処理を追加
    - Hono の `hono/compress` ミドルウェアを使うか、`zlib` の `createGzip()` / `createBrotliCompress()` を使用
  2. `workspaces/server/src/routes/index.ts` で圧縮ミドルウェアの適用を確認
- **対象ファイル**:
  - `workspaces/server/src/middlewares/compressMiddleware.ts`
  - `workspaces/server/src/routes/index.ts`
- **レギュレーション注意点**: なし

---

### 施策 2: vendor-admin チャンクを全ページから除外する (コード分割修正)

- **対象メトリクス**: FCP, TBT, SI
- **期待される改善**: 全ページで 343KB の不要な JS 読み込みを排除。FCP 1-2秒短縮。TBT 100-200ms 削減
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ（特に非 admin ページ）
- **具体的な作業内容**:
  1. **問題の原因**: Vite マニフェストで `client-DD0Qk1Wm.js` が `vendor-admin-DYLf84do.js` を静的 import している
    - `manualChunks` で分離はされているが、メインバンドル内に admin 系ライブラリ（@emotion 等）を使うコードが静的に含まれているため、Rollup が依存としてリンク
  2. `workspaces/app/src/` 内で `@emotion` や `@chakra-ui` や `@mui` をインポートしている箇所を特定・排除
    - あるいは admin パッケージ内部から漏れている共有モジュールを確認
  3. `workspaces/server/src/routes/ssr/index.tsx` の `getViteAssetTags()` で vendor-admin の script タグが全ページに出力されないようフィルタリング（応急措置）
  4. 恒久対策: `workspaces/client/vite.config.ts` の `manualChunks` で admin 系が動的 import 側にだけ紐づくよう修正
- **対象ファイル**:
  - `workspaces/client/vite.config.ts`
  - `workspaces/server/src/routes/ssr/index.tsx`
  - `workspaces/server/src/utils/viteManifest.ts`
  - `workspaces/app/src/` (漏れているインポートの特定)
- **レギュレーション注意点**: admin 画面 (`/admin`) の機能が壊れないこと

---

### 施策 3: LCP 画像を SSR HTML に含め、fetchpriority=high を設定する

- **対象メトリクス**: LCP (主要), FCP
- **期待される改善**: LCP Resource Load Delay 3,177ms (61.4%) を大幅削減。作者・作品・エピソードページの LCP 54-56秒 → 数秒に改善。LCP スコア 0 → 0.3-0.6 程度
- **優先度**: 高
- **実装難易度**: 中〜高
- **影響範囲**: 作者・作品・エピソードページ
- **具体的な作業内容**:
  1. SSR 時に書影画像の URL を解決し、HTML に `<img>` が含まれるようにする
    - `workspaces/server/src/routes/ssr/index.tsx` の `createInjectDataStr()` で book/author データも SWR fallback に含める
    - 各詳細ページのルートパスを解析して対応する API を呼ぶ
  2. `workspaces/app/src/foundation/components/Image.tsx` に `fetchPriority` prop を追加
  3. BookDetailPage, AuthorDetailPage の書影画像に `fetchPriority="high"` を設定
  4. SSR HTML の `<head>` に LCP 画像の `<link rel="preload" as="image">` を追加
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx`
  - `workspaces/app/src/foundation/components/Image.tsx`
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx`
- **レギュレーション注意点**: VRT に影響しないこと（画像サイズ・位置を変えない）

---

### 施策 4: エピソード API の N+1 問題を解消する

- **対象メトリクス**: LCP, SI
- **期待される改善**: 作品詳細ページの API リクエスト 14本 → 1-2本に削減。ネットワーク Critical Path 4,980ms → ~1,500ms
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 作品詳細ページ
- **具体的な作業内容**:
  1. `GET /api/v1/episodes?bookId=:id` のレスポンスにエピソード詳細データ（画像、ページ数等）を含める
    - `workspaces/server/src/routes/api/episodes/getEpisodeList.ts` を確認
    - サーバー側 `episodeRepository.readAll()` は既に `with: { image, pages }` で取得しているので、レスポンスに含めるだけ
  2. `workspaces/app/src/features/episode/components/EpisodeListItem.tsx` で個別 `useEpisode` 呼び出しをやめ、リストから渡されたデータを使う
  3. API スキーマ (`workspaces/schema/`) のレスポンス型に必要なフィールドを追加
- **対象ファイル**:
  - `workspaces/server/src/routes/api/episodes/getEpisodeList.ts`
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx`
  - `workspaces/app/src/features/episode/hooks/useEpisodeList.ts`
  - `workspaces/schema/src/api/episodes/`
- **レギュレーション注意点**: 既存 API レスポンスへの項目追加は許可されている

---

### 施策 5: 画像の Cache-Control ヘッダを修正する

- **対象メトリクス**: LCP, SI
- **期待される改善**: 再訪時の画像再ダウンロード不要に。LCP で 1-2 秒改善（キャッシュヒット時）
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/cacheControlMiddleware.ts` を修正
    - 現状: `Cache-Control: private, no-store` が全レスポンスに適用
    - 画像ルート (`/images/`*) に対しては `Cache-Control: public, max-age=86400` 等に変更
    - 静的アセット (`/assets/*`) に対しても `immutable` キャッシュを設定
  2. あるいは画像ルートでキャッシュミドルウェアをスキップし、独自にヘッダ設定
- **対象ファイル**:
  - `workspaces/server/src/middlewares/cacheControlMiddleware.ts`
  - `workspaces/server/src/routes/image/index.ts`
  - `workspaces/server/src/routes/static/index.ts`
- **レギュレーション注意点**: `POST /api/v1/initialize` 後にキャッシュが古いデータを返さないよう注意

---

### 施策 6: ComicViewerCore の同期処理を最適化する

- **対象メトリクス**: TBT
- **期待される改善**: エピソードページの TBT を 100ms → 50ms 以下に。他ページへの波及効果あり
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: エピソードページ
- **具体的な作業内容**:
  1. `getScrollToLeft()` のループ回数を `2 ** 12` (4,096) → `2 ** 6` (64) 程度に削減
    - コメントに「世界は我々の想像する以上に変化するため」とあるが、過剰な反復
  2. `useInterval(rerender, 0)` を `ResizeObserver` ベースに変更
    - 現状: 毎フレーム再レンダリング（60fps × 全コンポーネント）
    - 変更後: コンテナサイズ変更時のみ再レンダリング
  3. `getBoundingClientRect()` の呼び出しを `useMemo` でキャッシュ
- **対象ファイル**:
  - `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx` (lines 32, 104, 112-114)
- **レギュレーション注意点**: ビューアーの表示・スクロール挙動を変えないこと。VRT 差異 3% 以内

---

### 施策 7: SSR HTML サイズを削減する

- **対象メトリクス**: FCP, TTFB
- **期待される改善**: HTML サイズ 1.1-1.4MB → 数百KB に。TTFB 100-200ms 短縮
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. SWR の inject-data に含まれるデータ量を確認・削減
    - 現在 release, feature, ranking の全データを JSON シリアライズしている
    - 現在のページで使わないデータは除外する（ルートパスに応じた条件分岐）
  2. styled-components の SSR スタイルタグを最適化（未使用スタイルの除外）
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` (createInjectDataStr)
- **レギュレーション注意点**: ハイドレーションエラーが出ないこと

---

### 施策 8: Service Worker 登録をハイドレーション後に遅延する

- **対象メトリクス**: FCP, TBT
- **期待される改善**: FCP 500-800ms 短縮。ハイドレーションが SW 待ちでブロックされなくなる
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/src/index.tsx` で `registerServiceWorker()` の呼び出しをハイドレーション後に移動
    - 現状: `main()` の先頭で `registerServiceWorker()` を呼んでいる（await はしていないが、SW 起動がメインスレッドを競合する）
    - 変更: `ReactDOM.hydrateRoot()` の後に `registerServiceWorker()` を呼ぶ
  2. ただし採点サーバーが SW 起動を待ち合わせるため、あまり遅くしすぎない
- **対象ファイル**:
  - `workspaces/client/src/index.tsx` (line 22)
- **レギュレーション注意点**: **Service Worker を register すること**は必須。遅延は OK だが削除は NG

---

### 施策 9: ページコンポーネントを React.lazy で遅延読み込みする

- **対象メトリクス**: FCP, TBT, SI
- **期待される改善**: 各ページで不要なページコンポーネントのコードが読み込まれなくなる。client.js が複数チャンクに分割され、初期ロードサイズ大幅削減。FCP 1-3秒短縮、TBT 100-300ms 削減
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/app/src/routes.tsx` で静的 import を `React.lazy(() => import(...))` に変更
    - 現状: TopPage, BookDetailPage, EpisodeDetailPage, AuthorDetailPage, SearchPage がすべて静的 import
    - 変更: 各ページを `React.lazy` で動的 import に切り替え
  2. `<Suspense>` でラップ（SSR との互換性に注意）
  3. Vite が自動的にルート単位のチャンクを生成する
- **対象ファイル**:
  - `workspaces/app/src/routes.tsx`
- **レギュレーション注意点**: SSR で `Suspense` を使う場合、`renderToString` ではなく `renderToPipeableStream` が必要になる可能性がある。現状の `renderToString` で動作するか確認が必要

---

## 施策の優先順位


| 順位  | 施策                         | 主な対象メトリクス         | 期待改善 | 難易度 | 推定スコア改善 |
| --- | -------------------------- | ----------------- | ---- | --- | ------- |
| 1   | gzip/brotli 圧縮有効化          | FCP, LCP, SI, TBT | 大    | 低   | +15-20  |
| 2   | vendor-admin 全ページ読み込み修正    | FCP, TBT, SI      | 大    | 中   | +5-10   |
| 3   | LCP 画像 SSR + fetchpriority | LCP               | 大    | 中〜高 | +10-15  |
| 4   | ページ単位の React.lazy 分割       | FCP, TBT, SI      | 大    | 低   | +5-10   |
| 5   | エピソード API N+1 解消           | LCP, SI           | 中    | 中   | +3-5    |
| 6   | 画像 Cache-Control 修正        | LCP, SI           | 中    | 低   | +2-3    |
| 7   | ComicViewerCore 最適化        | TBT               | 小〜中  | 中   | +1-2    |
| 8   | SSR HTML サイズ削減             | FCP, TTFB         | 小〜中  | 中   | +1-2    |
| 9   | SW 登録遅延                    | FCP, TBT          | 小    | 低   | +1-2    |


## 次のステップ

1. **施策 9 (React.lazy ルート分割)** を実装
2. **施策 1 (gzip/brotli 圧縮)** から着手を推奨 — 最も簡単で最も効果が大きい
3. 続けて **施策 2 (vendor-admin 分離)** → **施策 3 (LCP 画像 SSR)** の順で実装
4. 各施策の実装後は `perf-validate` でビルド・テスト確認、ある程度まとまったら `perf-measure` で再計測

