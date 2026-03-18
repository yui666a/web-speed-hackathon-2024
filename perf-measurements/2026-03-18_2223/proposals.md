# 改善施策提案

**計測日時**: 2026-03-18 22:23
**現在の推定スコア**: 25.5 / 100 点（ページランディング）
**提案日時**: 2026-03-18

## 現状の課題サマリー

LCP が全ページ 60s 超と壊滅的。根本原因は **useImage フックの Canvas 処理**（toDataURL がメインスレッドをブロック）と **SSR データの未活用**（サーバーで取得したデータをクライアントが無視して再取得）。CLS は **Footer の isClient state** が 0.85 のシフトを発生させている。vendor-admin チャンク（343KB）が MUI アイコンの依存で全ページにロードされている。

## 改善施策一覧

### 施策 1: Footer CLS の修正（isClient 削除）

- **対象メトリクス**: CLS (25点)
- **期待される改善**: CLS 0.85 → 0 に近づく。全ページで CLS スコアが大幅改善。配点 25 点中 15-20 点回復を期待
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `Footer.tsx` の `isClient` state と useEffect を削除
  2. ボタンの `disabled={!isClient}` を削除し、常に enabled にする
  3. SSR/Hydration の不一致がなくなるため CLS が解消
  4. Footer の SVG ロゴ `<img alt="Cyber TOON" src="/assets/cyber-toon.svg" />` に width/height を追加
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Footer.tsx` (lines 28-32, 117-131)
- **レギュレーション注意点**: ボタンの見た目・機能は変わらないため VRT への影響なし

### 施策 2: useImage フックの Canvas 処理廃止

- **対象メトリクス**: LCP (25点), TBT (30点), CLS (25点)
- **期待される改善**: 全ページで 40-50 回の同期的 toDataURL() 呼び出しを廃止。LCP のレンダリング遅延（89%）を大幅削減。TBT も削減
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `useImage` の Canvas 処理（decode → drawImage → toDataURL）を廃止
  2. 代わりにサーバーの画像 API URL を直接 `<img src>` に設定
  3. `object-fit: cover` を CSS で指定してクロッピングを実現（Canvas 手動クロッピングの代替）
  4. 各カードコンポーネントの useImage 呼び出しを画像 URL 直接生成に置換
  5. Suspense の fallback={null} も不要になるため削除可能
- **対象ファイル**:
  - `workspaces/app/src/foundation/hooks/useImage.ts` (lines 5-46)
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/components/BookListItem.tsx`
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx`
- **レギュレーション注意点**: 画像のアスペクト比・トリミングが CSS object-fit: cover で同等に再現できること。VRT 差異 3% 以内

### 施策 3: MUI アイコンを SVG インラインに置換（vendor-admin 分離）

- **対象メトリクス**: TBT (30点), FCP (10点)
- **期待される改善**: vendor-admin チャンク（343KB / gzip 118KB）が全ページでロードされなくなる。FCP・TBT が改善
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `SvgIcon.tsx` で import している 6 つの MUI アイコン（ArrowBack, Close, Favorite, FavoriteBorder, NavigateNext, Search）をインライン SVG に置換
  2. `@mui/icons-material` への依存を app ワークスペースから除去
  3. Vite の manualChunks 設定で vendor-admin が client エントリの静的 import から外れることを確認
- **対象ファイル**:
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx` (lines 1-6)
  - `workspaces/client/vite.config.ts` (manualChunks 設定の確認)
- **レギュレーション注意点**: アイコンの見た目が完全に同一であること

### 施策 4: HeroImage の Three.js 廃止

- **対象メトリクス**: TBT (30点), LCP (25点)
- **期待される改善**: Three.js バンドル削減 + WebGL 初期化・シェーダコンパイル・requestAnimationFrame ループの廃止。メインスレッド負荷大幅削減
- **優先度**: 中
- **実装難易度**: 中（シェーダ効果の CSS/Canvas 2D 再現が必要）
- **影響範囲**: ホームページ
- **具体的な作業内容**:
  1. HeroImage.tsx の Three.js WebGL レンダリングを CSS filter/gradient で代替
  2. もしくは Three.js のシェーダ効果を事前にビルド時に静的画像として生成
  3. three パッケージを app の dependencies から除去
  4. requestAnimationFrame アニメーションループを削除
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` (lines 31-91)
  - `workspaces/app/package.json` (three 依存)
- **レギュレーション注意点**: VRT 差異 3% 以内。ヒーロー画像のビジュアルが大きく変わらないこと

### 施策 5: SSR ハイドレーションデータの活用

- **対象メトリクス**: LCP (25点), FCP (10点), SI (10点)
- **期待される改善**: 初回ロード時に API 再取得なしで描画可能。TTFB 直後にコンテンツ表示
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. サーバー側 SSR (`routes/ssr/index.tsx`) で inject-data に書き込むデータを SWR キーで整理
  2. クライアント側 (`client/src/index.tsx`) で `<script id="inject-data">` からデータを読み取り SWRConfig の `fallback` に設定
  3. `revalidateIfStale` を `false` に変更
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` (lines 22-77)
  - `workspaces/client/src/index.tsx` (lines 18-26)
- **レギュレーション注意点**: なし

### 施策 6: サーバー画像キャッシュの導入

- **対象メトリクス**: LCP (25点), SI (10点)
- **期待される改善**: 画像リサイズ・フォーマット変換の結果をキャッシュし、同一リクエストの2回目以降をキャッシュから返す。TTFB 短縮
- **優先度**: 低
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `routes/image/index.ts` でリサイズ・変換後の画像をインメモリ or ディスクキャッシュ
  2. Cache-Control ヘッダーの設定（immutable, max-age）
- **対象ファイル**:
  - `workspaces/server/src/routes/image/index.ts` (lines 82-130)
- **レギュレーション注意点**: `POST /api/v1/initialize` でキャッシュをクリアすること

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 理由 |
|------|------|--------------------|----------|--------|------|
| 1 | Footer CLS 修正 | CLS | 大 | 低 | CLS 失点の 85% がこれ。5分で修正可能 |
| 2 | useImage Canvas 廃止 | LCP, TBT | 極大 | 中 | LCP 60s の根本原因。全ページに効く |
| 3 | MUI アイコン置換 | TBT, FCP | 中 | 低 | 343KB の不要チャンク除去 |
| 4 | HeroImage Three.js 廃止 | TBT, LCP | 中 | 中 | バンドル削減 + GPU 負荷削減 |
| 5 | SSR ハイドレーション | LCP, FCP, SI | 大 | 中 | 施策 2 と組み合わせで効果最大 |
| 6 | 画像キャッシュ | LCP, SI | 小 | 低 | サーバー側の最適化 |

## 次のステップ

1. **施策 1（Footer CLS）から着手を推奨** — 5分で完了、CLS 大幅改善
2. 施策 2（useImage）→ 施策 3（MUI アイコン）の順で実装
3. 各施策の実装後は perf-validate でビルド＆テスト確認、perf-measure で再計測
