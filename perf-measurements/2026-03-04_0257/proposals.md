# 改善施策提案

**計測日時**: 2026-03-04 02:57
**現在の推定スコア**: 約 11 / 100 点（ページランディング）
**提案日時**: 2026-03-04 03:15

## 現状の課題サマリー

全メトリクスで大幅な失点（合計89.3点失点）。最大の問題は:
1. **LCP 全ページ score 0** — 12.8MB base64 画像がバンドルに内包 + N+1 API 問題（100+ リクエスト）
2. **TBT 平均 1,341ms** — 22MB の client JS（vendor-admin 4.2MB 含む）+ blocking な preloadImages
3. **CLS 平均 0.49** — 画像の条件付きレンダリング + placeholder なし + font-face 未定義

## 改善施策一覧

---

### 施策 1: ImageSrc.ts (12.8MB base64) の外部化と Three.js 除去

- **対象メトリクス**: TBT, LCP, FCP, SI
- **期待される改善**: TBT -500ms以上、FCP -2s以上。JS バンドルが 12.8MB 縮小し parse/eval 時間が劇的改善
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ（バンドルサイズ削減）、ホームページ（HeroImage）
- **具体的な作業内容**:
  1. `ImageSrc.ts` の base64 データをデコードして PNG ファイルとして `public/` または `assets/` に配置
  2. `HeroImage.tsx` を Three.js WebGL レンダリングから CSS/Canvas ベースの軽量実装に変更
     - Three.js の ShaderMaterial は単純なテクスチャ表示 + アニメーション → CSS filter/animation や Canvas 2D で代替可能
     - `requestAnimationFrame` 無限ループも除去
  3. `three` パッケージを `workspaces/app/package.json` から削除
  4. HeroImage の `<img>` に `width`, `height` を明示して CLS も改善
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` — 削除
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` — Three.js 除去、CSS/img ベースに書き換え
  - `workspaces/app/package.json` — `three` 依存削除
- **レギュレーション注意点**: VRT でヒーロー画像のビジュアルが変わりすぎないよう注意（3%以内）。Three.js のシェーダーが単純テクスチャ表示なら CSS 代替で視覚差は最小限

---

### 施策 2: N+1 API 問題の解消（カードコンポーネントへ book データ直接渡し）

- **対象メトリクス**: LCP, SI
- **期待される改善**: LCP を数十秒→数秒に短縮（Lighthouse シミュレーション下で100+リクエスト→3リクエスト）。SI も大幅改善
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: ホームページ、作品詳細、作者詳細ページ
- **具体的な作業内容**:
  1. `TopPage/index.tsx`: FeatureCard, RankingCard, BookCard に `bookId` ではなく `book` オブジェクトを渡す
     - `/api/v1/features`, `/api/v1/rankings`, `/api/v1/releases/{day}` のレスポンスには既に完全な book データが含まれている
  2. 各カードコンポーネントの Props を `{ bookId: string }` → `{ book: GetBookResponse }` に変更
  3. カード内の `useBook({ params: { bookId } })` 呼び出しを削除し、渡された book を直接使用
  4. 同様に AuthorDetailPage, BookDetailPage でも book リスト表示時の N+1 を修正
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx` — lines 43-77: book オブジェクトを直接渡す
  - `workspaces/app/src/features/book/components/BookCard.tsx` — Props 変更、useBook 削除
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx` — Props 変更、useBook 削除
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx` — Props 変更、useBook 削除
  - `workspaces/app/src/features/book/components/BookListItem.tsx` — 同様に修正
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx` — 同様に修正
- **レギュレーション注意点**: API レスポンスの構造は変更しない。クライアント側のデータ受け渡しのみ変更

---

### 施策 3: vendor-admin チャンクの遅延読み込み修正

- **対象メトリクス**: TBT, FCP
- **期待される改善**: 初期ロード JS を 4.2MB 削減。TBT -200ms、FCP -1s 程度
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ（admin 以外）
- **具体的な作業内容**:
  1. Vite の manualChunks 設定を見直し、vendor-admin が main entry の静的 import に含まれないようにする
  2. admin 関連モジュールが client/src/index.tsx から静的に import されていないか確認
  3. 必要なら admin パッケージの import を完全に `() => import(...)` 形式の動的 import に変更
  4. ビルド後 manifest.json で vendor-admin が main entry の `imports` から消えたことを確認
- **対象ファイル**:
  - `workspaces/client/vite.config.ts` — manualChunks 設定の修正
  - `workspaces/client/src/index.tsx` — admin import のチェック
  - `workspaces/client/dist/.vite/manifest.json` — ビルド結果の確認
- **レギュレーション注意点**: 管理画面 (`/admin`) の機能は維持すること

---

### 施策 4: CLS 修正 — 画像プレースホルダーとフォント設定

- **対象メトリクス**: CLS
- **期待される改善**: CLS を 0.49 → 0.1 以下に。CLS ウェイト 25点中 19.5点失点 → 5点以下
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:

  **A. 画像の条件付きレンダリング廃止**:
  1. 全カード/リストコンポーネントで `{imageUrl != null && <Image>}` パターンを廃止
  2. 代わりに、画像ロード前でも固定サイズの空 `<div>` や `<img>` 要素を常にレンダリング
  3. 各コンポーネントの `_ImgWrapper` に明示的な `width`/`height` を設定済みのものはそのまま維持、ないものは追加

  **B. useImage フックの改善**:
  1. `useImage` の canvas 処理を簡略化。サーバーが既に resize をサポートしているので、`/api/v1/images/{id}?w=XXX&h=YYY` を直接 `<img src>` に使う
  2. canvas → dataURL 変換を廃止し、直接画像 URL をセット（img.decode() + canvas ピクセル操作が不要に）
  3. これにより画像表示までの遅延が 100ms+ 短縮

  **C. Suspense fallback の改善**:
  1. `fallback={null}` → サイズ確保された skeleton コンポーネントを設定
  2. 各カードごとにコンテンツサイズ分の placeholder を返す

  **D. フォント設定**:
  1. `GlobalStyle.ts` に `@font-face` 宣言を追加（`font-display: swap` 付き）
  2. 不要な WOFF フォントプリロードを削減（使うウェイトのみに絞る）
  3. `server/index.html` の 9 個のフォントプリロードを必要なもの（Regular, Bold 程度）に削減

- **対象ファイル**:
  - `workspaces/app/src/foundation/hooks/useImage.ts` — canvas 処理廃止
  - `workspaces/app/src/foundation/components/Image.tsx` — HTML width/height 属性追加
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx` — 条件付きレンダリング修正
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx` — 同上
  - `workspaces/app/src/features/book/components/BookCard.tsx` — 同上
  - `workspaces/app/src/features/book/components/BookListItem.tsx` — 同上
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx` — 同上
  - `workspaces/app/src/pages/BookDetailPage/index.tsx` — grid auto → 固定幅
  - `workspaces/app/src/foundation/styles/GlobalStyle.ts` — @font-face 追加
  - `workspaces/server/index.html` — フォントプリロード削減
- **レギュレーション注意点**: VRT で画像サイズやレイアウトが変わらないこと。useImage の object-fit:cover ロジックはサーバーサイドリサイズで代替

---

### 施策 5: 不要ライブラリの除去（lodash, moment-timezone, jQuery）

- **対象メトリクス**: TBT, FCP
- **期待される改善**: バンドルサイズ -150KB 程度。TBT -100ms
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. **lodash** → ネイティブ配列メソッド
     - `_.map()` → `Array.map()`（TopPage lines 43, 59, 75）
     - `_.clamp()` → `Math.min(Math.max(...))`
     - `_.floor()` → `Math.floor()`
  2. **moment-timezone** → ネイティブ Date
     - `moment().day()` → `new Date().getDay()`（TopPage line 21）
     - `getDayOfWeekStr` ヘルパーの moment 依存を除去
  3. **jQuery** → ネイティブ DOM API
     - `$('body').css('overflow', 'hidden')` → `document.body.style.overflow = 'hidden'`
     - `DialogContentAtom.ts` lines 14, 16 の2箇所のみ
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx` — lodash, moment 除去
  - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts` — jQuery 除去
  - `workspaces/app/package.json` — lodash, moment-timezone, jquery 依存削除
  - その他 lodash/moment を使っている箇所を grep で特定して修正

---

### 施策 6: preloadImages のブロッキング廃止

- **対象メトリクス**: TBT, FCP
- **期待される改善**: FCP -5s（最悪ケース）、TBT -500ms+
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `index.tsx` の `await preloadImages()` を非 blocking に変更（await を外す、またはハイドレーション後に実行）
  2. `preloadImages.ts` の 200+ 画像リンク作成をバッチ化、または完全に削除
  3. `registerServiceWorker()` も hydrate 後に実行するか、Promise.race で短いタイムアウトを設定
  4. 理想: `hydrateRoot` を先に実行し、その後で非同期に preload
- **対象ファイル**:
  - `workspaces/client/src/index.tsx` — await 順序変更
  - `workspaces/client/src/utils/preloadImages.ts` — ロジック簡略化 or 削除
- **レギュレーション注意点**: SW register は必須（採点サーバーが SW 起動を待つ）。register 自体は残すが、hydrate をブロックしないように

---

### 施策 7: Service Worker の軽量化（jimp 除去）

- **対象メトリクス**: TBT, LCP
- **期待される改善**: SW バンドル 641KB → 50KB 程度。画像表示の遅延短縮
- **優先度**: 中
- **実装難易度**: 中〜高
- **影響範囲**: 全画像リクエスト
- **具体的な作業内容**:
  1. JPEG XL → BMP 変換（jimp + @jsquash/jxl）をサーバーサイドに移動
  2. サーバーの画像配信で JPEG XL の代わりに WebP/AVIF を返すようにする
  3. SW からは jimp と @jsquash/jxl の依存を削除
  4. SW を薄いキャッシュプロキシにリファクタ
- **対象ファイル**:
  - `workspaces/client/src/serviceworker/index.ts` — jimp/jxl 変換ロジック削除
  - `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts` — 削除
  - `workspaces/server/src/routes/image/index.ts` — 画像フォーマット変換の拡充
  - `workspaces/client/package.json` — jimp, @jsquash/jxl 依存削除
- **レギュレーション注意点**: 漫画ページ画像の難読化は維持すること。配信フォーマットの変更は問題ないが、画像が推察できる状態にならないこと

---

### 施策 8: SSR の API 呼び出し並列化

- **対象メトリクス**: FCP, LCP
- **期待される改善**: TTFB -100ms〜300ms
- **優先度**: 低
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `routes/ssr/index.tsx` の3つの sequential `await` を `Promise.all` に変更
  2. releases, features, rankings を並列取得
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` — lines 23-43 を Promise.all 化

---

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 推定効果 |
|------|------|--------------------|----------|--------|----------|
| 1 | 施策 2: N+1 API 解消 | LCP, SI | **極大** | 低 | LCP 数十秒→数秒 |
| 2 | 施策 1: ImageSrc.ts 外部化 + Three.js 除去 | TBT, FCP, LCP | **極大** | 中 | バンドル -12.8MB |
| 3 | 施策 3: vendor-admin 遅延読み込み | TBT, FCP | 大 | 低 | バンドル -4.2MB |
| 4 | 施策 4: CLS 修正 | CLS | 大 | 中 | CLS 0.49→0.1 |
| 5 | 施策 5: 不要ライブラリ除去 | TBT, FCP | 中 | 低 | バンドル -150KB |
| 6 | 施策 6: preloadImages 非 blocking | TBT, FCP | 中 | 低 | FCP -2〜5s |
| 7 | 施策 7: SW 軽量化 | TBT, LCP | 中 | 中〜高 | SW -590KB |
| 8 | 施策 8: SSR 並列化 | FCP | 小 | 低 | TTFB -100ms |

## 次のステップ

1. **施策 2（N+1 API 解消）から着手を推奨** — 最も簡単で LCP への効果が最大。コード変更は props の受け渡し変更のみ
2. 次に **施策 1（ImageSrc.ts）** と **施策 3（vendor-admin）** を並行実施
3. その後 **施策 4（CLS）** で残りの失点を回収
4. 実装後は perf-measure で再計測して効果を確認
