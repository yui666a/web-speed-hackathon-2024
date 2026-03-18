# 改善施策提案

**計測日時**: 2026-03-17 00:11
**現在の推定スコア**: 29 / 100 点（ページランディング）
**提案日時**: 2026-03-17 00:30

## 現状の課題サマリー

LCP が全ページで 114〜118 秒（Lighthouse シミュレーション）と壊滅的。主因は巨大な JS バンドル（~4.9 MB）+ 30 MB のフォント（9本）+ HTML 無圧縮（751 KB）によるレンダリング遅延。CLS は 0.3〜1.1 で、Suspense fallback={null} + 非同期画像読み込みによるレイアウトシフトが深刻。TBT は 310〜430 ms で配点比では既にそこそこ改善済み。

## 改善施策一覧

### 施策 1: フォント最適化（サブセット化 + font-display: swap + 本数削減）

- **対象メトリクス**: LCP, FCP, CLS, SI
- **期待される改善**: FCP を 6.2s → 2-3s に短縮、LCP を大幅改善、CLS のフォント起因シフト解消
- **優先度**: 高
- **実装難易度**: 低〜中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 9本の Noto Sans JP WOFF フォント（各 3.0-3.3 MB、合計 30 MB）を WOFF2 サブセット化
     - 使用文字だけのサブセットで 100-300 KB/本に削減
     - または Google Fonts CDN から WOFF2 を取得（最も簡単）
  2. `@font-face` に `font-display: swap` を追加
  3. 9ウェイト全てが必要か確認し、不要なウェイトを削除（3-4本で十分な可能性）
  4. `workspaces/server/index.html` の preload タグを更新
  5. `workspaces/app/src/foundation/styles/GlobalStyle.ts` に `@font-face` 宣言を追加
- **対象ファイル**:
  - `workspaces/server/index.html` (preload タグ)
  - `workspaces/app/src/foundation/styles/GlobalStyle.ts` (@font-face)
  - `workspaces/server/public/assets/` (フォントファイル)
- **レギュレーション注意点**: VRT でフォント描画差異が出る可能性。同じ Noto Sans JP であれば問題ないが、別フォントへの変更は NG

### 施策 2: three.js 除去（HeroImage を Canvas 2D / CSS に置換）

- **対象メトリクス**: LCP, TBT, FCP, SI
- **期待される改善**: JS バンドルから ~500 KB+ 削減、HeroImage のレンダリング高速化
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: ホームページ（TopPage）
- **具体的な作業内容**:
  1. `HeroImage.tsx` の Three.js + WebGL レンダリングを Canvas 2D API または CSS background-image に置換
  2. テクスチャローダーの非同期処理を除去し、シンプルな画像表示に変更
  3. `three` パッケージを `workspaces/app/package.json` から削除
  4. HeroImage のアスペクト比（16:9）は維持
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx`
  - `workspaces/app/package.json`
- **レギュレーション注意点**: VRT でヒーロー画像の見た目が変わらないよう注意。Three.js シェーダーで特殊な視覚効果がある場合は Canvas 2D で再現する必要あり

### 施策 3: N+1 API 解消（カードコンポーネントの個別 book fetch を除去）

- **対象メトリクス**: LCP, SI, CLS
- **期待される改善**: ホームページの 130+ API リクエスト → 3 リクエストに削減。ネットワーク負荷大幅削減
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: ホームページ（TopPage）、他のリストページ
- **具体的な作業内容**:
  1. TopPage の `useRelease` / `useFeatureList` / `useRankingList` が返す book データを直接カードに渡す
  2. FeatureCard / RankingCard / BookCard の `useBook({ params: { bookId } })` 呼び出しを除去
  3. 各カードコンポーネントを `bookId` ではなく `book` オブジェクトを受け取るように変更
  4. API レスポンスに既に book の name, description, image, author 情報が含まれているのでそれを使う
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
- **レギュレーション注意点**: API レスポンスのスキーマは変更しないので影響なし

### 施策 4: CLS 改善（Suspense fallback にスケルトン + 画像サイズ予約）

- **対象メトリクス**: CLS
- **期待される改善**: CLS を 0.3-1.1 → 0.1 以下に削減（25点中 19.3点の失点回収）
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 全ページの `<Suspense fallback={null}>` を適切なサイズのプレースホルダー/スケルトンに変更
  2. `useImage` フックの非同期画像デコード（`img.decode()`）中でもコンテナサイズを確保
  3. BookCard / RankingCard / FeatureCard のコンテナに `min-height` を設定
  4. HeroImage のプレースホルダー（16:9 アスペクト比で灰色背景等）を追加
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx`
  - `workspaces/app/src/pages/EpisodeDetailPage/index.tsx`
  - `workspaces/app/src/foundation/hooks/useImage.ts`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
- **レギュレーション注意点**: スケルトンの見た目は VRT に影響しない（データロード後は同じ見た目になる）が、タイミング次第でスクリーンショット差異が出る可能性

### 施策 5: HTML レスポンス圧縮（gzip/brotli 対応）

- **対象メトリクス**: FCP, LCP, SI
- **期待される改善**: HTML 転送サイズ 751 KB → ~150 KB（5倍削減）。TTFB 実質短縮
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `compressMiddleware.ts` が `X-Accept-Encoding` ヘッダーのみチェックしている問題を修正
  2. 標準の `Accept-Encoding` ヘッダーも参照するように変更
  3. Zstd のみでなく gzip / brotli フォールバックを追加
  4. または Hono の compress middleware を使う
- **対象ファイル**:
  - `workspaces/server/src/middlewares/compressMiddleware.ts`
- **レギュレーション注意点**: なし

### 施策 6: @react-spring 除去（CSS アニメーションに置換）

- **対象メトリクス**: TBT, LCP (バンドル削減)
- **期待される改善**: JS バンドルから ~100-150 KB 削減
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 作品詳細ページ（BottomNavigator）
- **具体的な作業内容**:
  1. `BottomNavigator.tsx` の `useSpring` / `animated.div` を CSS transition/animation に置換
  2. `@react-spring/web` を `workspaces/app/package.json` から削除
- **対象ファイル**:
  - `workspaces/app/src/pages/BookDetailPage/internal/BottomNavigator.tsx`
  - `workspaces/app/package.json`
- **レギュレーション注意点**: アニメーションの見た目が同等であること

### 施策 7: axios → native fetch 置換

- **対象メトリクス**: TBT (バンドル削減)
- **期待される改善**: JS バンドルから ~50-70 KB 削減
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `apiClient.ts` の axios を native fetch API に置換
  2. SWR の fetcher を fetch ベースに変更
  3. axios パッケージを削除
- **対象ファイル**:
  - `workspaces/app/src/lib/api/apiClient.ts`
  - `workspaces/app/package.json`
- **レギュレーション注意点**: API エラーハンドリングの挙動が変わらないよう注意

### 施策 8: unicode-collation-algorithm2 の遅延読み込みまたは置換

- **対象メトリクス**: TBT (バンドル削減)
- **期待される改善**: JS バンドルから ~200-300 KB 削減
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 検索ページ
- **具体的な作業内容**:
  1. `unicode-collation-algorithm2` を検索ページでのみ動的 import する
  2. または、よりシンプルな日本語テキストマッチング（正規化 + includes）で置換
- **対象ファイル**:
  - `workspaces/app/src/` (該当する検索関連ファイル)
  - `workspaces/app/package.json`
- **レギュレーション注意点**: 検索結果が変わらないこと

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 |
|------|------|--------------------|----------|--------|
| 1 | フォント最適化 | LCP, FCP, CLS | 極大 | 低〜中 |
| 2 | HTML 圧縮 | FCP, LCP, SI | 大 | 低 |
| 3 | N+1 API 解消 | LCP, SI | 大 | 低 |
| 4 | three.js 除去 | LCP, TBT | 大 | 中 |
| 5 | CLS 改善 | CLS | 大 | 中 |
| 6 | @react-spring 除去 | TBT | 小〜中 | 低 |
| 7 | axios → fetch | TBT | 小 | 低 |
| 8 | unicode-collation 遅延 | TBT | 中 | 中 |

## 次のステップ

1. **施策 1（フォント最適化）+ 施策 2（HTML 圧縮）** を最優先で着手（LCP/FCP への効果が最大）
2. **施策 3（N+1 解消）** は実装が簡単で効果大なので並行して実施
3. **施策 4（three.js 除去）** でバンドルサイズをさらに削減
4. 実装後は perf-validate → perf-measure で効果を確認
