# 改善施策提案

**計測日時**: 2026-03-03 01:23
**現在の推定スコア**: 5 / 100 点（ページランディング・ホームページのみ）
**提案日時**: 2026-03-03 02:00

## 現状の課題サマリー

全メトリクスがほぼゼロ点で、合計失点は94.6点。最大の原因は総転送サイズ38MB超の巨大バンドルと未最適化アセットである。
`ImageSrc.ts`（12.8MBのBase64 SVGインライン）、9本のWOFFフォント全量プリロード、three.js/lodash/moment-timezone/jQuery/`@mui/icons-material`の全量バンドル、
そしてService Workerでの500-1500msのJitter遅延が複合的にFCP 15.5秒、LCP 90.6秒、TBT 1,580msを引き起こしている。

## 改善施策一覧

### 施策 1: 巨大なインライン画像データ（ImageSrc.ts）の外部ファイル化

- **対象メトリクス**: LCP, FCP, SI, TBT
- **期待される改善**: JSバンドルサイズが12.8MB以上削減され、パース・コンパイル時間が大幅に短縮。LCPとFCPへの効果が極めて大きい。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ（バンドルに含まれるため）
- **具体的な作業内容**:
  1. `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` のBase64データをデコードしてSVGファイルに書き出す（例: `workspaces/client/assets/hero-image.webp` に変換して配置）
  2. SVGの場合はWebPやAVIFに変換して最適化（sharp等で変換、数十KB程度に圧縮可能）
  3. `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` を修正し、three.jsによるWebGLレンダリングを廃止。単純に `<img src="/assets/hero-image.webp">` に置換
  4. three.js の依存をappのpackage.jsonから削除
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts`（削除）
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx`（大幅簡素化）
  - `workspaces/app/package.json`（three.js 削除）
- **レギュレーション注意点**: VRTでHeroImageの見た目が一致するよう、元画像と同等のビジュアルを維持すること。aspect-ratio: 16/9 を保持すること。

### 施策 2: Service Worker の Jitter 遅延の除去

- **対象メトリクス**: LCP, FCP, SI, TBT（全メトリクス）
- **期待される改善**: 全リクエストに500-1500msのランダム遅延が追加されており、これを除去することで全体のロード時間が大幅に短縮。特にリクエストが多数並列発行されるホームページでは数十秒規模の改善が見込まれる。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/src/serviceworker/jitter.ts` の `jitter()` 関数を遅延なし（即resolve）に変更
     ```typescript
     export async function jitter(): Promise<void> {
       // 遅延を除去
     }
     ```
  2. もしくは `workspaces/client/src/serviceworker/index.ts` の `onFetch` 関数から `await jitter()` 呼び出しを削除
- **対象ファイル**:
  - `workspaces/client/src/serviceworker/jitter.ts`
  - `workspaces/client/src/serviceworker/index.ts`
- **レギュレーション注意点**: Service Worker自体は削除してはいけない（register必須）。Jitter関数の遅延を除去するだけなのでレギュレーション違反にはならない。

### 施策 3: 不要フォントのプリロード削減とWOFF2への変換

- **対象メトリクス**: FCP, LCP, SI
- **期待される改善**: 9本のWOFFフォント（合計数十MB相当）を全てプリロードしている。実際に使用しているウェイトのみに絞り、WOFF2に変換することでフォント関連の転送量を90%以上削減可能。FCP改善に直結。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 実際に使用されているfont-weightを調査（コードベースでは `normal` と `bold` のみ使用 → Regular と Bold のみ必要）
  2. `NotoSansJP-Regular.woff` と `NotoSansJP-Bold.woff` をWOFF2形式に変換（`woff2_compress` やオンラインツールで変換）
  3. 不要な7ファイル（Thin, ExtraLight, Light, Medium, SemiBold, ExtraBold, Black）を削除
  4. `workspaces/server/index.html` から不要フォントの `<link rel="preload">` を削除し、残すフォントもWOFF2に変更
  5. `font-display: swap` を@font-face定義に追加してFOIT回避
- **対象ファイル**:
  - `workspaces/server/index.html`（preloadタグ修正）
  - `workspaces/client/assets/NotoSansJP-*.woff`（不要分削除、WOFF2変換）
  - GlobalStyleまたはindex.htmlに `@font-face` 定義を追加（font-display: swap）
- **レギュレーション注意点**: Regular/Boldのフォントは残すこと。CLS（フォントスワップによるレイアウトシフト）に注意し、`font-display: optional` の方がCLSには有利な場合もあるが、VRTとの差異に注意。

### 施策 4: `@mui/icons-material` の全量インポート廃止

- **対象メトリクス**: TBT, FCP, LCP
- **期待される改善**: `import * as Icons from '@mui/icons-material'` が全アイコン（数千個）をバンドルに含めている。実際に使用しているアイコンは数個（Search, ArrowBack等）のみ。バンドルサイズが数百KB〜1MB削減される。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/app/src/features/icons/components/SvgIcon.tsx` を修正し、`import * as Icons` ではなく個別アイコンのインポートに変更。
  2. 使用箇所を調査: `SvgIcon` の `type` propに渡されているアイコン名を特定（Search, ArrowBack 等）
  3. 個別インポートに変更:
     ```typescript
     import SearchIcon from '@mui/icons-material/Search';
     import ArrowBackIcon from '@mui/icons-material/ArrowBack';
     ```
  4. あるいはMUIアイコン自体を廃止し、SVGインラインアイコンに置換する（さらに軽量化）
- **対象ファイル**:
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx`
- **レギュレーション注意点**: アイコンの見た目が変わらないこと。VRT差異3%以内を確認。

### 施策 5: lodash, moment-timezone, jQuery の除去

- **対象メトリクス**: TBT, FCP
- **期待される改善**: 3ライブラリ合計で数百KBのバンドルサイズ削減。特にmoment-timezoneはタイムゾーンデータが非常に大きい（約500KB gzip前）。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. **lodash の除去**: `_.map()` → `Array.map()`、`_.floor()` → `Math.floor()`、`_.clamp()` → `Math.min(Math.max(...))` に置換
     - `workspaces/app/src/pages/TopPage/index.tsx`: `_.map(featureList, ...)` → `featureList?.map(...)` 等
     - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`: `_.floor()` → `Math.floor()`、`_.clamp()` → 自前実装
  2. **moment-timezone の除去**: `moment()` は曜日取得のみに使用。`new Date().getDay()` で代替可能。
     - `workspaces/app/src/pages/TopPage/index.tsx`: `moment()` → `new Date()`
     - `workspaces/app/src/lib/date/getDayOfWeekStr.ts`: moment型を `Date` 型に変更
     - `workspaces/server/src/routes/ssr/index.tsx`: サーバー側のmoment使用も同様に置換
  3. **jQuery の除去**: `$('body').css(...)` → `document.body.style.overflow = ...` に変更
     - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts`: jQuery不使用に
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`
  - `workspaces/app/src/lib/date/getDayOfWeekStr.ts`
  - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts`
  - `workspaces/server/src/routes/ssr/index.tsx`
  - `workspaces/app/package.json`（依存削除）
- **レギュレーション注意点**: 曜日の計算結果が元と同じであること（タイムゾーンに注意。日本時間での曜日判定を維持）。

### 施策 6: 画像プリロード処理（preloadImages）の廃止または最適化

- **対象メトリクス**: LCP, FCP, TBT
- **期待される改善**: `preloadImages()` がシード画像の全リスト（数十〜数百枚）をfetchPriority: highで一括プリロードし、完了まで5秒待機してからReactの描画が始まる。これを廃止することでFCP/LCPが5秒以上改善される。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/src/index.tsx` から `await preloadImages()` の呼び出しを削除（またはコメントアウト）
  2. Vite設定（`workspaces/client/vite.config.ts`）の `process.env.PATH_LIST` の定義は残しても問題ないが、不要なら除去
  3. 必要であれば、ファーストビューに見える画像のみをHTML内で `<link rel="preload">` として指定する（選択的プリロード）
- **対象ファイル**:
  - `workspaces/client/src/index.tsx`
  - `workspaces/client/src/utils/preloadImages.ts`（削除可能）
  - `workspaces/client/vite.config.ts`（PATH_LIST関連の除去は任意）
- **レギュレーション注意点**: なし。Service Workerのregisterは別関数なので影響なし。

### 施策 7: cyber-toon.svg のプリロード廃止と最適化

- **対象メトリクス**: FCP, LCP
- **期待される改善**: `index.html` でSVGロゴ（推定14MB）をプリロードしている。これはフッターでのみ使用されるため、プリロードを削除し、遅延読み込みにすることでFCPが改善。さらにSVGをWebP/PNG等に変換して軽量化。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/index.html` の `<link as="image" ... href="/assets/cyber-toon.svg" rel="preload" />` を削除
  2. SVGファイルをWebPまたはPNGに変換して軽量化（sharpやsvgo + rsvg等で変換。フッターロゴなので200x程度の小さいサイズで十分）
  3. `workspaces/app/src/foundation/components/Footer.tsx` の `<img src="/assets/cyber-toon.svg">` を最適化済みファイルに差し替え、`loading="lazy"` を追加
- **対象ファイル**:
  - `workspaces/server/index.html`
  - `workspaces/client/assets/cyber-toon.svg`（変換後のファイルで置換）
  - `workspaces/app/src/foundation/components/Footer.tsx`
- **レギュレーション注意点**: フッターロゴの見た目を維持すること。VRT差異3%以内。

### 施策 8: useImage フック内のCanvasによるクライアントサイド画像処理の廃止

- **対象メトリクス**: LCP, TBT
- **期待される改善**: `useImage` フックが全画像に対して (1) Imageオブジェクトでデコード (2) Canvasに描画 (3) toDataURL('image/png') でBase64変換 という重い処理を行っている。これを通常の `<img src>` に置換することでTBTとLCPを大幅に改善。
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ（画像表示箇所すべて）
- **具体的な作業内容**:
  1. `workspaces/app/src/foundation/hooks/useImage.ts` を簡素化し、画像URLを直接返すように変更:
     ```typescript
     export const useImage = ({ height, imageId, width }: { height: number; imageId: string; width: number }) => {
       return getImageUrl({ format: 'webp', height, imageId, width });
     };
     ```
  2. サーバー側の画像ルート（`workspaces/server/src/routes/image/index.ts`）で `image-js` の代わりに `sharp` のみ使用して効率化（既にsharpベースのコンバーターがあるが、メインのリサイズ処理で`image-js`のImageクラスを使用している）
  3. 画像フォーマットを `jpg` から `webp` または `avif` に変更してファイルサイズ削減
  4. サーバー側でCache-Controlヘッダを設定（後述の施策9と連携）
- **対象ファイル**:
  - `workspaces/app/src/foundation/hooks/useImage.ts`
  - `workspaces/server/src/routes/image/index.ts`（`image-js` → `sharp` に統一）
  - 全てのuseImage呼び出し元（FeatureCard, RankingCard, BookCard, BookListItem, EpisodeListItem, AuthorDetailPage, BookDetailPage）
- **レギュレーション注意点**: 画像の見た目を維持すること。object-fit: coverの挙動をCSSで実現すること。

### 施策 9: Cache-Control ヘッダの修正

- **対象メトリクス**: LCP, FCP, SI
- **期待される改善**: 現在 `Cache-Control: private, no-store` が全レスポンスに設定されており、一切キャッシュされない。静的アセット（JS, CSS, フォント, 画像）に適切なキャッシュヘッダを設定することで、再訪時やSW経由での再読込を高速化。
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/cacheControlMiddleware.ts` を修正:
     - 静的アセット（`/assets/`, Viteビルド成果物）には `Cache-Control: public, max-age=31536000, immutable`
     - 画像（`/images/`）には `Cache-Control: public, max-age=86400`
     - APIレスポンスには `Cache-Control: no-cache` または短いmax-age
     - HTMLは `Cache-Control: no-cache`
  2. Service Workerの `transformJpegXLToBmp` のレスポンスにも `Cache-Control: no-store` → 適切な値に変更
- **対象ファイル**:
  - `workspaces/server/src/middlewares/cacheControlMiddleware.ts`
  - `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts`
- **レギュレーション注意点**: `POST /api/v1/initialize` でDBリセット後にキャッシュが残らないよう注意。画像IDが変われば新しい画像が取得されるため、パスベースキャッシュなら問題ない。

### 施策 10: useInterval(rerender, 0) の廃止

- **対象メトリクス**: TBT
- **期待される改善**: ComicViewerとComicViewerCoreで `useInterval(rerender, 0)` が使用されており、0msインターバルで無限再レンダリングが発生している。これがメインスレッドを大量にブロックしTBTを悪化させる。ResizeObserverに置換することで不要な再レンダリングを排除。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: エピソードページ
- **具体的な作業内容**:
  1. `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx` の `useInterval(rerender, 0)` を削除
  2. `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx` の `useInterval(rerender, 0)` を削除
  3. 代わりに `ResizeObserver` を使用してコンテナサイズ変更時のみ再レンダリングするカスタムフック（`useContainerSize`）を実装
  4. ComicViewerCore内のgetScrollToLeftの `2 ** 12` ループ（4096回の無意味な繰り返し）を1回に削減
- **対象ファイル**:
  - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`
  - `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx`
- **レギュレーション注意点**: スクロール・リサイズ動作が元と同等であること。E2Eテストでのページ送り等が正常に動作すること。

### 施策 11: Node Polyfills の最小化

- **対象メトリクス**: TBT, FCP
- **期待される改善**: `vite-plugin-node-polyfills` が buffer, events, process, stream, util, path の6モジュールをポリフィルしている。image-encrypt の decrypt 機能で本当に必要なものだけに絞る（おそらくbufferのみ必要、または完全に不要にできる可能性がある）。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/vite.config.ts` の `nodePolyfills` プラグインの `include` を最小限に（できれば完全除去）
  2. image-encrypt の decrypt 関数がブラウザネイティブAPIで動作するか確認し、Node依存を除去
  3. Service Worker用の `workspaces/client/vite.sw.config.ts` も同様に最適化
- **対象ファイル**:
  - `workspaces/client/vite.config.ts`
  - `workspaces/client/vite.sw.config.ts`
  - `workspaces/image-encrypt/src/decrypt.ts`（Node依存の除去）
- **レギュレーション注意点**: 画像の難読化（decrypt）機能は必須。ブラウザで正常にdecryptできることを確認。

### 施策 12: Service Worker の画像処理パイプライン最適化（JXL→BMP の廃止）

- **対象メトリクス**: LCP, TBT
- **期待される改善**: 現在の画像配信パイプラインは「サーバーでJXLエンコード → SW内でJXLデコード＋Jimpで BMP変換 → ブラウザで表示」という極めて非効率な経路。WebPで直接配信すればSW内の重いデコード処理を省略でき、ページ内の画像表示が大幅に高速化される。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ（漫画ページ画像以外の一般画像）
- **具体的な作業内容**:
  1. `workspaces/app/src/lib/image/getImageUrl.ts` でリクエストするフォーマットを `jxl` ではなく `webp` に変更（漫画ページ以外）
  2. `workspaces/app/src/features/viewer/components/ComicViewerPage.tsx` の漫画ページは難読化のためJXLを維持するが、SW内での変換をJimp（BMP）からより軽量な方法に変更検討
  3. `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts` からJimp依存を除去し、Canvas APIやImageBitmap APIを使った軽量変換に置換
  4. `workspaces/client/src/serviceworker/index.ts` の PQueue の concurrency を 5 → 10 以上に増加
- **対象ファイル**:
  - `workspaces/app/src/lib/image/getImageUrl.ts`
  - `workspaces/app/src/features/viewer/components/ComicViewerPage.tsx`
  - `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts`
  - `workspaces/client/src/serviceworker/index.ts`
  - `workspaces/client/package.json`（jimp依存の削除検討）
- **レギュレーション注意点**: 漫画ページ画像は推察できない状態（難読化済み）で配信する必要がある。JXL形式での配信は難読化手段の一つであるため、エピソードページの漫画画像は適切な難読化を維持すること。

### 施策 13: サーバー側画像処理の効率化（image-js → sharp 統一 + キャッシュ）

- **対象メトリクス**: LCP, SI
- **期待される改善**: 画像リクエストのたびにimage-jsでデコード→sharp系でリサイズ→エンコードという処理を行っている。sharpに統一しメモリキャッシュを追加することでレスポンス時間を大幅短縮。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/routes/image/index.ts` で `image-js` の `Image` クラスを使用せず、sharp のパイプラインで decode → resize → encode を一貫して行う
  2. `globby` による動的ファイル探索をやめ、拡張子付きのパスを直接構築する（毎リクエストのglob検索を回避）
  3. 変換済み画像のメモリキャッシュまたはディスクキャッシュを導入
  4. `workspaces/server/package.json` から `image-js` 依存を削除
- **対象ファイル**:
  - `workspaces/server/src/routes/image/index.ts`
  - `workspaces/server/package.json`
- **レギュレーション注意点**: 変換後の画像品質が維持されること。

### 施策 14: CLS 改善 - 画像とコンテナのサイズ明示

- **対象メトリクス**: CLS
- **期待される改善**: CLS 0.735 の原因は画像が非同期ロードされた後にレイアウトシフトが発生すること。width/height属性やaspect-ratioの明示でCLSを大幅に改善可能。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/app/src/foundation/components/Image.tsx` のImageコンポーネントに `width` と `height` をHTML属性としても出力する（現在はCSS経由のみ）
  2. 各カードコンポーネント（FeatureCard, RankingCard, BookCard等）で画像コンテナにaspect-ratioまたは固定サイズを明示
  3. HeroImage セクションに `aspect-ratio: 16/9` と `min-height` を設定してシフト防止
  4. フォントの `font-display: swap` または `optional` を設定してFOIT/FOUTによるCLSを抑制
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Image.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/pages/TopPage/internal/CoverSection.tsx`
- **レギュレーション注意点**: VRT差異3%以内。既存レイアウトのサイズ感を変えないこと。

### 施策 15: unicode-collation-algorithm2 の遅延読み込みまたは除去

- **対象メトリクス**: TBT, FCP
- **期待される改善**: `setup.ts` で初期化時に `ucaInit()` が同期的に実行され、大きなUnicodeデータテーブルを読み込む。検索ページでのみ使用されるため、遅延読み込みに変更する。
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ（初期化コスト削減）
- **具体的な作業内容**:
  1. `workspaces/app/src/setup.ts` からimportを削除
  2. `workspaces/app/src/lib/filter/isContains.ts` 内で必要時にのみ `init()` を呼び出す（または検索ページのみで初期化）
  3. もしくは `Intl.Collator` APIで代替可能か調査（ブラウザ内蔵のUnicode正規化で十分な場合が多い）
- **対象ファイル**:
  - `workspaces/app/src/setup.ts`
  - `workspaces/app/src/lib/filter/isContains.ts`
  - `workspaces/app/package.json`（可能であれば依存削除）
- **レギュレーション注意点**: 検索機能の結果が同等であること。

### 施策 16: zstd 圧縮ミドルウェアの標準的なgzip/brotliへの置換

- **対象メトリクス**: FCP, LCP
- **期待される改善**: 現在のzstd圧縮はService Worker経由でのみデコード可能であり、標準のブラウザデコードが使えない。gzipまたはbrotliに変更することで、SW不要でブラウザが直接デコードでき、レスポンス処理が高速化。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/compressMiddleware.ts` をHonoの組み込み `compress` ミドルウェアに置換（gzip/brotli対応）
  2. `workspaces/client/src/serviceworker/zstdFetch.ts` のzstdデコード処理を削除し、通常のfetchに変更
  3. `workspaces/client/src/serviceworker/index.ts` の `zstdFetch` を標準 `fetch` に置換
  4. `@oneidentity/zstd-js` と `fzstd` 依存を削除
- **対象ファイル**:
  - `workspaces/server/src/middlewares/compressMiddleware.ts`
  - `workspaces/client/src/serviceworker/zstdFetch.ts`
  - `workspaces/client/src/serviceworker/index.ts`
  - `workspaces/server/package.json`
  - `workspaces/client/package.json`
- **レギュレーション注意点**: Service Workerのregisterは維持すること。圧縮方式の変更はレギュレーション上問題なし。

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 |
|------|------|--------------------|----------|--------|
| 1 | 施策 2: Service Worker Jitter遅延の除去 | 全メトリクス | 大 | 低 |
| 2 | 施策 1: ImageSrc.ts (12.8MB) の外部ファイル化 + three.js除去 | LCP, FCP, TBT | 大 | 低 |
| 3 | 施策 6: preloadImages()の廃止 | LCP, FCP | 大 | 低 |
| 4 | 施策 7: cyber-toon.svg プリロード廃止と最適化 | FCP, LCP | 大 | 低 |
| 5 | 施策 3: 不要フォントのプリロード削減 + WOFF2 | FCP, LCP, CLS | 大 | 低 |
| 6 | 施策 9: Cache-Controlヘッダの修正 | LCP, FCP, SI | 中 | 低 |
| 7 | 施策 5: lodash, moment-timezone, jQuery除去 | TBT, FCP | 中 | 低 |
| 8 | 施策 4: @mui/icons-material 全量インポート廃止 | TBT, FCP | 中 | 低 |
| 9 | 施策 14: CLS改善 - 画像サイズ明示 | CLS | 中 | 低 |
| 10 | 施策 8: useImage フックの簡素化 | LCP, TBT | 大 | 中 |
| 11 | 施策 10: useInterval(rerender, 0) の廃止 | TBT | 中 | 中 |
| 12 | 施策 12: SW画像処理パイプライン最適化 | LCP, TBT | 中 | 中 |
| 13 | 施策 15: unicode-collation-algorithm2 遅延読み込み | TBT, FCP | 小 | 低 |
| 14 | 施策 16: zstd → gzip/brotli 置換 | FCP, LCP | 中 | 中 |
| 15 | 施策 13: サーバー側画像処理効率化 | LCP, SI | 中 | 中 |
| 16 | 施策 11: Node Polyfills最小化 | TBT, FCP | 小 | 中 |

## 次のステップ

1. **施策 2（Jitter除去）、施策 1（ImageSrc外部化+three.js除去）、施策 6（preloadImages廃止）を最初に実施を推奨** - 3つ合わせて実装1時間以内で完了でき、バンドルサイズ13MB以上の削減とリクエスト遅延の除去により、スコアが5点→20-30点程度に大幅改善が見込まれる
2. 続いて施策 3, 7, 9（フォント・SVG・キャッシュ）を実施 - FCP/LCPのさらなる改善
3. 施策 4, 5, 8（ライブラリ除去・画像処理改善）で残りのTBT/バンドルサイズを最適化
4. 各施策の実装後は `perf-measure` で再計測して効果を確認し、次の施策の優先度を調整する
