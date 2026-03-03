# 改善施策提案

**計測日時**: 2026-03-03 19:54
**現在の推定スコア**: 12 / 100 点（ページランディング、4ページ平均）
**提案日時**: 2026-03-03 20:10

## 現状の課題サマリー

全メトリクスがほぼゼロ点で合計失点88.2点。根本原因は3つ：
1. **SW Jitter遅延**（全リクエスト500-1500ms加算）が全メトリクスを壊滅的に悪化
2. **巨大バンドル**（ImageSrc.ts 12.8MB + three.js + MUI全量）がTBT/FCPを破壊
3. **未最適化アセット**（14MB SVG、9本WOFFフォント計29MB、全量プリロード）がLCPを破壊

## 改善施策一覧

### 施策 1: Service Worker の Jitter 遅延の除去

- **対象メトリクス**: 全メトリクス（FCP, LCP, SI, TBT, CLS）
- **期待される改善**: 全リクエストから500-1500msの遅延が消える。画像・JS・CSSすべてに影響するため、LCPが数十秒単位で改善される見込み。
- **優先度**: 高
- **実装難易度**: 低（1行変更）
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/src/serviceworker/jitter.ts` の遅延を除去：
     ```typescript
     export async function jitter(): Promise<void> {
       // 遅延を除去
     }
     ```
  2. または `workspaces/client/src/serviceworker/index.ts` の `await jitter()` 行を削除
- **対象ファイル**:
  - `workspaces/client/src/serviceworker/jitter.ts`
  - `workspaces/client/src/serviceworker/index.ts`
- **レギュレーション注意点**: SW自体は削除しない。register必須。Jitter除去はレギュレーション上問題なし。

### 施策 2: ImageSrc.ts（12.8MB）の外部ファイル化 + three.js 除去

- **対象メトリクス**: TBT, FCP, LCP, SI
- **期待される改善**: JSバンドルから12.8MBが消え、パース時間が大幅短縮。three.js（約600KB min）も不要になる。TBTが500ms以上改善、FCP/LCPも数秒改善の見込み。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ（バンドルに含まれるため）
- **具体的な作業内容**:
  1. `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` のBase64をデコードしてSVGファイルに書き出す
  2. SVGをWebPに変換して軽量化（sharp等で数十KB程度に圧縮可能）
  3. `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` を簡素化：three.js WebGLレンダリングを廃止し `<img src="/assets/hero-image.webp">` に置換
  4. `workspaces/app/package.json` から `three` と `@types/three` を削除
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts`（削除）
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx`（大幅簡素化）
  - `workspaces/app/package.json`（three.js 削除）
- **レギュレーション注意点**: HeroImageの見た目をVRT差異3%以内で維持。aspect-ratio: 16/9 を保持。

### 施策 3: preloadImages() のブロッキング廃止

- **対象メトリクス**: FCP, LCP
- **期待される改善**: `await preloadImages()` がReact hydrationを最大5秒ブロックしている。除去でFCP/LCPが5秒改善。
- **優先度**: 高
- **実装難易度**: 低（1行削除）
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/src/index.tsx` の `await preloadImages();`（12行目）を削除
  2. `workspaces/client/src/utils/preloadImages.ts` は削除可能
  3. `workspaces/client/vite.config.ts` の `process.env.PATH_LIST` 定義も不要になるが、残しても害はない
- **対象ファイル**:
  - `workspaces/client/src/index.tsx`
  - `workspaces/client/src/utils/preloadImages.ts`（削除可能）

### 施策 4: フォントプリロード削減 + WOFF2 変換

- **対象メトリクス**: FCP, LCP, CLS
- **期待される改善**: 9本のWOFFフォント（計29MB）が全てプリロードされている。実際に使用しているウェイト（Regular, Bold）のみに絞りWOFF2に変換することで、フォント転送量を90%以上削減。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 使用中のfont-weightを調査（Regular, Bold のみ使用と推定）
  2. `NotoSansJP-Regular.woff` と `NotoSansJP-Bold.woff` をWOFF2に変換
  3. 不要な7フォントファイル（Thin, ExtraLight, Light, Medium, SemiBold, ExtraBold, Black）を削除
  4. `workspaces/server/index.html` から不要な7つの `<link rel="preload">` を削除、残りをWOFF2に変更
  5. `@font-face` に `font-display: swap` を追加
- **対象ファイル**:
  - `workspaces/server/index.html`（preloadタグ修正）
  - `workspaces/client/assets/NotoSansJP-*.woff`（不要分削除、WOFF2変換）

### 施策 5: cyber-toon.svg（14MB）プリロード廃止と最適化

- **対象メトリクス**: FCP, LCP
- **期待される改善**: フッターでのみ使用される14MB SVGがプリロードされている。プリロード削除 + 画像最適化で初期ロード14MB削減。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/index.html` 22行目の `<link as="image" ... href="/assets/cyber-toon.svg" rel="preload" />` を削除
  2. SVGをWebP/PNGに変換して軽量化（フッターロゴなので小さいサイズで十分）
  3. フッターの `<img>` に `loading="lazy"` を追加
- **対象ファイル**:
  - `workspaces/server/index.html`
  - `workspaces/client/assets/cyber-toon.svg`（変換後ファイルで置換）
  - フッターコンポーネント

### 施策 6: Cache-Control ヘッダの修正

- **対象メトリクス**: LCP, FCP, SI
- **期待される改善**: 全レスポンスに `Cache-Control: private, no-store` が設定されキャッシュが一切効かない。静的アセットに適切なキャッシュヘッダを設定すれば再訪時やSW経由のリソース読み込みが高速化。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/cacheControlMiddleware.ts` を修正：
     - 静的アセット（`/assets/`, Viteビルド成果物）: `Cache-Control: public, max-age=31536000, immutable`
     - 画像（`/images/`）: `Cache-Control: public, max-age=86400`
     - API: `Cache-Control: no-cache`
     - HTML: `Cache-Control: no-cache`
  2. `transformJpegXLToBmp.ts` のレスポンスヘッダも `no-store` → 適切な値に
- **対象ファイル**:
  - `workspaces/server/src/middlewares/cacheControlMiddleware.ts`
  - `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts`
- **レギュレーション注意点**: `POST /api/v1/initialize` 後にキャッシュが残る問題に注意。画像IDベースのパスなら問題なし。

### 施策 7: lodash, moment-timezone, jQuery の除去

- **対象メトリクス**: TBT, FCP
- **期待される改善**: 3ライブラリで数百KBのバンドル削減。moment-timezoneのタイムゾーンデータだけで約500KB。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. **lodash**: `_.map()` → `Array.map()`、`_.floor()` → `Math.floor()`、`_.clamp()` → `Math.min(Math.max(...))`
     - `workspaces/app/src/pages/TopPage/index.tsx`: 3箇所の `_.map()` を `.map()` に
     - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`: `_.floor()`, `_.clamp()` を標準APIに
  2. **moment-timezone**: 曜日取得のみ使用 → `new Date().getDay()` で代替
     - `workspaces/app/src/pages/TopPage/index.tsx`
     - `workspaces/app/src/lib/date/getDayOfWeekStr.ts`
  3. **jQuery**: `$('body').css('overflow')` → `document.body.style.overflow`
     - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts`
- **対象ファイル**:
  - 上記の各ファイル + `workspaces/app/package.json`（依存削除）

### 施策 8: @mui/icons-material の全量インポート廃止

- **対象メトリクス**: TBT, FCP
- **期待される改善**: `import * as Icons from '@mui/icons-material'` が数千アイコンを全量バンドル。個別インポートに変更でバンドルサイズ数百KB〜1MB削減。
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/app/src/features/icons/components/SvgIcon.tsx` の `import * as Icons` を個別インポートに変更
  2. 使用されているアイコン名を特定して個別に import
  3. またはMUIアイコンをSVGインラインに置換（さらに軽量）
- **対象ファイル**:
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx`

### 施策 9: useImage フックの Canvas 画像処理廃止

- **対象メトリクス**: LCP, TBT
- **期待される改善**: 全画像で Image→Canvas→toDataURL('image/png') という重い処理を実行中。URL直接返却に変更でTBT改善、LCP画像の表示高速化。
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ（画像表示箇所すべて）
- **具体的な作業内容**:
  1. `workspaces/app/src/foundation/hooks/useImage.ts` を簡素化：画像URLを直接返す
  2. object-fit: cover はCSSで対応
  3. サーバー側画像ルートでWebP配信に対応
- **対象ファイル**:
  - `workspaces/app/src/foundation/hooks/useImage.ts`
  - 呼び出し元コンポーネント群

### 施策 10: useInterval(rerender, 0) の廃止

- **対象メトリクス**: TBT
- **期待される改善**: 0msインターバルで無限再レンダリングがメインスレッドを常時ブロック。ResizeObserverに置換でTBT大幅改善。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: エピソードページ
- **具体的な作業内容**:
  1. `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx` 38行目の `useInterval(rerender, 0)` を削除
  2. `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx` 104行目も同様
  3. `ResizeObserver` ベースのカスタムフックに置換
- **対象ファイル**:
  - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`
  - `workspaces/app/src/features/viewer/components/ComicViewerCore.tsx`
- **レギュレーション注意点**: E2Eテストでのページ送り・スクロール動作が正常であること。

### 施策 11: zstd 圧縮を gzip/brotli に置換

- **対象メトリクス**: FCP, LCP
- **期待される改善**: 非標準のzstd圧縮をSW経由でデコードしている。標準のgzip/brotliに変更でブラウザが直接デコードでき高速化。SWバンドルからfzstd（数十KB）も削除できる。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/middlewares/compressMiddleware.ts` をHonoの `compress` ミドルウェアに置換
  2. `workspaces/client/src/serviceworker/zstdFetch.ts` を標準fetchに変更
  3. `workspaces/client/src/serviceworker/index.ts` の `zstdFetch as fetch` を標準 `fetch` に
  4. `@oneidentity/zstd-js`, `fzstd` 依存を削除
- **対象ファイル**:
  - `workspaces/server/src/middlewares/compressMiddleware.ts`
  - `workspaces/client/src/serviceworker/zstdFetch.ts`
  - `workspaces/client/src/serviceworker/index.ts`

### 施策 12: SW 画像パイプライン最適化（JXL→BMP 廃止）

- **対象メトリクス**: LCP, TBT
- **期待される改善**: JXLデコード + Jimp BMP変換という非効率なパイプラインを廃止。WebP直接配信でSW内の重いデコード処理を省略。SWバンドル（641KB）からJimp/jsquash（大部分）を除去できる。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 一般画像: `getImageUrl.ts` でリクエストフォーマットを `jxl` → `webp` に変更
  2. 漫画ページ画像: 難読化維持のためJXLを続けるが、BMP変換をCanvas APIベースの軽量処理に変更
  3. Jimp依存をSWから除去
- **対象ファイル**:
  - `workspaces/app/src/lib/image/getImageUrl.ts`
  - `workspaces/client/src/serviceworker/transformJpegXLToBmp.ts`
  - `workspaces/client/src/serviceworker/index.ts`
- **レギュレーション注意点**: 漫画ページ画像は推察不能な状態で配信必須。暗号化/難読化を維持すること。

### 施策 13: CLS 改善 - 画像サイズ明示

- **対象メトリクス**: CLS
- **期待される改善**: CLS 0.26〜0.43の主因は画像ロード後のレイアウトシフト。width/height属性やaspect-ratioの明示でCLSを0.1以下に改善可能。
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 画像コンポーネントに width/height をHTML属性として出力
  2. カードコンポーネントに aspect-ratio を明示
  3. フォントの `font-display: swap` 設定
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Image.tsx`等
  - 各カードコンポーネント

### 施策 14: サーバー側画像処理の効率化

- **対象メトリクス**: LCP, SI
- **期待される改善**: 毎リクエストimage-jsでデコード→リサイズ→エンコードを実行。sharpに統一 + キャッシュ追加でレスポンス時間短縮。
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/server/src/routes/image/index.ts` でimage-js → sharp統一
  2. globbyによる動的ファイル探索を除去
  3. メモリキャッシュ導入
- **対象ファイル**:
  - `workspaces/server/src/routes/image/index.ts`

### 施策 15: unicode-collation-algorithm2 の遅延読み込み

- **対象メトリクス**: TBT, FCP
- **期待される改善**: アプリ起動時に `ucaInit()` が同期実行。検索ページでのみ必要なため遅延読み込みにするか、`Intl.Collator` で代替。
- **優先度**: 低
- **実装難易度**: 低
- **影響範囲**: 全ページ（初期化コスト削減）
- **具体的な作業内容**:
  1. `workspaces/app/src/setup.ts` からimportを削除
  2. 必要時のみ初期化するか `Intl.Collator` で代替
- **対象ファイル**:
  - `workspaces/app/src/setup.ts`
  - `workspaces/app/src/lib/filter/isContains.ts`

### 施策 16: Node Polyfills の最小化

- **対象メトリクス**: TBT, FCP
- **期待される改善**: buffer, events, process, stream, util, path の6モジュールをポリフィル中。image-encryptのdecryptに最低限必要なもの（buffer程度）に絞る。
- **優先度**: 低
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/client/vite.config.ts` の `nodePolyfills` include を最小限に
  2. image-encrypt のブラウザ互換性を確認
- **対象ファイル**:
  - `workspaces/client/vite.config.ts`
  - `workspaces/client/vite.sw.config.ts`

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 |
|------|------|--------------------|----------|--------|
| 1 | 施策1: SW Jitter除去 | 全メトリクス | 極大 | 低 |
| 2 | 施策2: ImageSrc外部化+three.js除去 | TBT,FCP,LCP | 大 | 低 |
| 3 | 施策3: preloadImages廃止 | FCP,LCP | 大 | 低 |
| 4 | 施策5: cyber-toon.svgプリロード廃止 | FCP,LCP | 大 | 低 |
| 5 | 施策4: フォントプリロード削減+WOFF2 | FCP,LCP,CLS | 大 | 低 |
| 6 | 施策6: Cache-Control修正 | LCP,FCP,SI | 中 | 低 |
| 7 | 施策7: lodash/moment/jQuery除去 | TBT,FCP | 中 | 低 |
| 8 | 施策8: MUI icons個別インポート | TBT,FCP | 中 | 低 |
| 9 | 施策9: useImage Canvas処理廃止 | LCP,TBT | 大 | 中 |
| 10 | 施策13: CLS画像サイズ明示 | CLS | 中 | 低 |
| 11 | 施策10: useInterval(0)廃止 | TBT | 中 | 中 |
| 12 | 施策11: zstd→gzip/brotli | FCP,LCP | 中 | 中 |
| 13 | 施策12: SW画像パイプライン最適化 | LCP,TBT | 中 | 中 |
| 14 | 施策14: サーバー画像処理効率化 | LCP,SI | 中 | 中 |
| 15 | 施策15: unicode-collation遅延化 | TBT,FCP | 小 | 低 |
| 16 | 施策16: Node Polyfills最小化 | TBT,FCP | 小 | 中 |

## 次のステップ

1. **施策1〜5を最初に一括実施を推奨**（全て難易度:低、合計1-2時間）
   - SW Jitter除去、ImageSrc外部化、preloadImages廃止、SVGプリロード廃止、フォント削減
   - バンドル13MB+削減、アセット43MB+削減、リクエスト遅延除去
   - スコアは12点 → 30-50点程度に大幅改善が見込まれる
2. 施策6〜8を続けて実施（Cache-Control, ライブラリ除去, MUIアイコン）
3. 施策9〜14（中難易度の最適化）で残りのスコアを積み上げ
4. 各施策の実装後は perf-measure で再計測して効果を確認し、次の施策を調整する
