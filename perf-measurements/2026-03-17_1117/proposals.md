# 改善施策提案

**計測日時**: 2026-03-17 11:17
**現在の推定スコア**: 22.5 / 100 点（ページランディング）
**提案日時**: 2026-03-17

## 現状の課題サマリー

LCP が全ページ 58-63s（Lighthouse シミュレーション）と壊滅的。根本原因は **N+1 API 問題**（ホームページで 140+ 本の `/api/v1/books/:id` 個別リクエスト）と **SSR データの未活用**（サーバーで取得したデータをクライアントが読まずに再取得）。CLS は Footer の `isClient` state 変更で 0.65 のシフトが発生。TBT は `useImage` フックの Canvas 処理がメインスレッドを圧迫。

## 改善施策一覧

### 施策 1: N+1 API 問題の解消 — カードコンポーネントに親データを渡す

- **対象メトリクス**: LCP (25点), SI (10点), FCP (10点)
- **期待される改善**: API リクエスト 140+ → 3 本に削減。LCP/SI が劇的に改善。Lighthouse シミュレーション環境では直列化されるため LCP 58s → 10s 以下が見込める
- **優先度**: 高
- **実装難易度**: 中（Props バケツリレーの変更が多いが定型作業）
- **影響範囲**: 全ページ（特にホームページ）
- **具体的な作業内容**:
  1. `FeatureCard` — `bookId` ではなく `book` オブジェクトを props で受け取るよう変更。内部の `useBook()` を削除
  2. `RankingCard` — 同上
  3. `BookCard` — 同上
  4. `TopPage/index.tsx` — `featureList.map` 等で `feature.book` を直接カードに渡す
  5. 他ページ（AuthorDetailPage, BookDetailPage 等）でも同パターンがあれば修正
  6. `BookCard` は他ページからも使われるため、`book` オブジェクト全体を受け取る形にしつつ、`bookId` のみの場合は `useBook()` にフォールバックするか、呼び出し元で事前に取得済みデータを渡す
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
- **レギュレーション注意点**: API レスポンスの型は既に book データを含んでいるので、サーバー側の変更は不要

### 施策 2: SSR ハイドレーションデータの活用

- **対象メトリクス**: LCP (25点), FCP (10点), SI (10点)
- **期待される改善**: 初回ロード時に API リクエスト 0 本で描画可能に。TTFB 直後にコンテンツを表示。LCP をさらに短縮
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. サーバー側 (`routes/ssr/index.tsx`) で `inject-data` に書き込んでいるデータを SWR の `fallback` 用キーで整理
  2. クライアント側 (`client/src/index.tsx`) で `inject-data` スクリプトからデータを読み取り、SWRConfig の `fallback` に設定
  3. SWR の `revalidateIfStale` を `false` に変更（初回描画時の不要な再取得を防止）
  4. 各 `useSWR` フックの key と SSR 注入データの key を一致させる
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx`
  - `workspaces/client/src/index.tsx`
  - `workspaces/app/src/features/*/hooks/use*.ts` (SWR key の確認)
- **レギュレーション注意点**: なし

### 施策 3: Footer CLS の修正

- **対象メトリクス**: CLS (25点)
- **期待される改善**: CLS 0.65 → 0 に近づく。Lighthouse CLS スコアが 0.02-0.29 → 0.9 以上へ改善の可能性。配点 25 点中 15-20 点回復を期待
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `Footer.tsx` の `isClient` state を削除し、ボタンを常に enabled にする。もしくは CSS で disabled 時のサイズが変わらないようにする
  2. Footer 内のボタンの disabled 状態でレイアウトが変わらないよう CSS を統一
  3. Footer の SVG ロゴに明示的な width/height を設定
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Footer.tsx`
  - `workspaces/server/index.html` (SVG ロゴサイズ)
- **レギュレーション注意点**: VRT 差異 3% 以内であること。ボタンの見た目・機能は変えない

### 施策 4: useImage フックの最適化（Canvas 処理の削減）

- **対象メトリクス**: TBT (30点), LCP (25点)
- **期待される改善**: 各カードの Canvas 処理（decode + drawImage + toDataURL）を廃止し、`<img>` の object-fit: cover で代替。TBT を大幅に削減
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ（画像表示のあるすべてのコンポーネント）
- **具体的な作業内容**:
  1. `useImage` フックの Canvas 処理を廃止し、画像 URL を直接返すように変更
  2. 画像コンポーネントで `object-fit: cover` を CSS で指定
  3. サーバー側の画像 API がリサイズ済み画像を返すことを確認（`/images/:imageId?w=N&h=N` パターン）
  4. 各カードコンポーネントの `useImage` 呼び出しを更新
- **対象ファイル**:
  - `workspaces/app/src/foundation/hooks/useImage.ts`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/foundation/components/Image.tsx`
- **レギュレーション注意点**: 画像の見た目（トリミング・アスペクト比）が変わらないこと。VRT 差異 3% 以内

### 施策 5: HeroImage の Three.js 削除

- **対象メトリクス**: TBT (30点), CLS (25点), LCP (25点)
- **期待される改善**: Three.js バンドル削除（~500KB+）で TBT 改善。Canvas toDataURL の廃止で CLS 改善。GPU シェーダコンパイルの廃止でレンダリング高速化
- **優先度**: 中
- **実装難易度**: 中（Three.js のシェーダ効果を CSS/Canvas 2D で再現する必要あり）
- **影響範囲**: ホームページのみ
- **具体的な作業内容**:
  1. HeroImage の Three.js ベースの描画を CSS グラデーション/filter で置換
  2. もしくは静的に生成した画像に置き換え
  3. Three.js 関連の依存をバンドルから除去
  4. requestAnimationFrame アニメーションループの削除
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx`
  - `workspaces/app/package.json` (three.js 依存)
- **レギュレーション注意点**: VRT 差異 3% 以内にヒーロー画像の見た目を維持すること。シェーダ効果の再現精度に注意

### 施策 6: Suspense fallback にスケルトンを設定

- **対象メトリクス**: CLS (25点)
- **期待される改善**: `fallback={null}` を適切なサイズのプレースホルダーに変更し、コンテンツ表示時のレイアウトシフトを防止
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 各カードコンポーネントの Suspense fallback に、カードと同じサイズの空 div を設定
  2. TopPage の各セクションに min-height を設定
- **対象ファイル**:
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/pages/TopPage/index.tsx`
- **レギュレーション注意点**: スケルトンの見た目が VRT に影響する可能性。読み込み完了後は元通りになるので問題は小さい

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 理由 |
|------|------|--------------------|----------|--------|------|
| 1 | N+1 API 解消 | LCP, SI | 極大 | 中 | LCP 失点 25 点の根本原因。140+ リクエストを 3 本に削減 |
| 2 | Footer CLS 修正 | CLS | 大 | 低 | CLS 失点の 60% 以上がこれ。修正は簡単 |
| 3 | useImage Canvas 廃止 | TBT, LCP | 大 | 中 | メインスレッド負荷の主要因。TBT 30 点配点に効く |
| 4 | SSR ハイドレーション | LCP, FCP, SI | 大 | 中 | 施策 1 と組み合わせで API 0 本で初回描画可能に |
| 5 | HeroImage Three.js 削除 | TBT, CLS | 中 | 中 | バンドル削減 + GPU 負荷削減 |
| 6 | Suspense skeleton | CLS | 小〜中 | 低 | 施策 1 で N+1 解消すれば影響は小さくなる |

## 次のステップ

1. **施策 1（N+1 API 解消）と 施策 2（Footer CLS）から同時着手を推奨** — 独立した作業で並行可能
2. 施策 1 の完了後に 施策 3（useImage）→ 施策 4（SSR ハイドレーション）の順で実装
3. 各施策の実装後は perf-validate でビルド＆テスト確認、perf-measure で再計測して効果を確認
