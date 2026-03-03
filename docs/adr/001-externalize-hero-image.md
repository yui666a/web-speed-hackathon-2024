# ADR-001: ヒーロー画像のインラインbase64を外部アセットに移行

## ステータス
承認済み

## コンテキスト
`workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` に、base64 エンコードされた PNG 画像（約12.8MB）がインラインで埋め込まれていた。この画像はトップページの HeroImage コンポーネントで Three.js の `TextureLoader` に渡されるヒーロー画像として使用されている。

この base64 データがそのまま JavaScript バンドルに含まれるため、メインの client チャンクサイズが約 18.8MB（gzip: 12.5MB）と非常に大きくなっていた。これにより以下の問題が発生していた：

- JS ファイルのダウンロード時間が極端に長い
- JavaScript のパースと実行に多大な時間がかかる（TBT の悪化）
- First Contentful Paint (FCP) と Largest Contentful Paint (LCP) が大幅に遅延
- base64 エンコードによりバイナリデータより約33%サイズが増加

## 決定
base64 データを外部 PNG ファイルとして分離し、URL 参照に切り替える。

具体的な変更内容：
1. `ImageSrc.ts` の base64 データをデコードし、`workspaces/client/assets/hero.png`（9.6MB）として保存
2. `HeroImage.tsx` で `ImageSrc.ts` の import を削除し、`/assets/hero.png` の URL 定数に置き換え
3. Three.js の `TextureLoader.load()` は URL 文字列を直接受け付けるため、コード変更は最小限
4. 不要になった `ImageSrc.ts` ファイルを削除

## 影響

### パフォーマンス改善
- **バンドルサイズ**: 約 18.8MB → 推定 6.0MB（base64 の 12.8MB 分が削減）
- **TBT**: JS パース量の大幅減少により改善（配点ウェイト30%）
- **FCP**: メインチャンクのダウンロード・パース完了が早まるため改善
- **LCP**: ページ全体のレンダリング開始が早まるため改善
- **画像自体**: ブラウザが通常の画像として並列ダウンロード・キャッシュ可能に

### トレードオフ
- ヒーロー画像の読み込みに追加の HTTP リクエストが1件発生するが、JS バンドルサイズ削減の恩恵が圧倒的に大きい
- 画像はブラウザキャッシュが効くため、2回目以降のアクセスではさらに高速化

### リスク
- 既存の `build:copy` ステップ（`cp -r ./assets ./dist/assets`）により、ビルド時に自動的に dist に含まれるため追加設定不要
- Three.js TextureLoader は URL からの読み込みを標準でサポートしており、動作上の問題なし
- この画像は漫画ページ画像ではないため、難読化レギュレーションの対象外
