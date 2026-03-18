# 改善施策提案

**計測日時**: 2026-03-03 22:15
**現在の推定スコア**: 8 / 100 点（ページランディング）
**提案日時**: 2026-03-03 22:30

## 現状の課題サマリー

全メトリクスがほぼ0点。最大の原因は **client JS バンドル 18.8MB**（うち12MBがインライン画像）によるTBT/FCP/LCPの壊滅と、**N+1 APIリクエスト**（160+件）によるLCP遅延、**CLS 0.43-0.50** の3つ。TBT(30点)とLCP(25点)の改善が最優先。

## 改善施策一覧

---

### 施策 1: ImageSrc.ts の12MB インライン画像を外部アセットに移動

- **対象メトリクス**: TBT, FCP, LCP, SI（全メトリクス改善）
- **期待される改善**: メインバンドルを 18.8MB → ~6.8MB に削減。JSパース時間が劇的に改善
- **優先度**: 最高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` の base64 PNG データを抽出
  2. デコードして PNG ファイルとして `workspaces/client/assets/` に保存
  3. `HeroImage.tsx` で `IMAGE_SRC` を外部画像URLとしてフェッチするよう変更
  4. Three.js TextureLoader は URL からの読み込みをサポートしているため、data URL → URL に変えるだけ
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` (削除)
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` (URL参照に変更)
  - `workspaces/client/assets/` (PNG ファイル追加)
- **レギュレーション注意点**: 画像自体は漫画ページではないので難読化不要

---

### 施策 2: N+1 API リクエストの解消

- **対象メトリクス**: LCP, SI, TBT
- **期待される改善**: ホームで160+リクエスト → 3リクエストに削減。LCP を大幅短縮
- **優先度**: 最高
- **実装難易度**: 低〜中
- **影響範囲**: ホームページ（最大効果）、他ページにも波及
- **具体的な作業内容**:
  1. API レスポンス（features, rankings, releases）は既にフルの book データを含んでいる
  2. TopPage で取得した book データを子コンポーネントに直接渡す
  3. `FeatureCard` を `bookId` props → `book` props（フルオブジェクト）に変更
  4. `RankingCard` を同様に変更
  5. `BookCard` を同様に変更
  6. 各カードコンポーネント内の `useBook({ params: { bookId } })` 呼び出しを削除
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx` (book オブジェクトを直接渡す)
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx` (book prop受取)
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx` (book prop受取)
  - `workspaces/app/src/features/book/components/BookCard.tsx` (book prop受取)
- **レギュレーション注意点**: APIレスポンス形式は変更不要。コンポーネントの props 変更のみ

---

### 施策 3: @mui/icons-material のワイルドカード import 修正

- **対象メトリクス**: TBT, FCP, LCP
- **期待される改善**: バンドルから ~2-3MB 削減。MUI icons の全アイコンを個別 import に変更
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `SvgIcon.tsx` の `import * as Icons from '@mui/icons-material'` を削除
  2. 実際に使用されているアイコン名を特定
  3. 使用されているアイコンのみ個別 import に変更（例: `import FavoriteIcon from '@mui/icons-material/Favorite'`）
  4. もしくは SVG を直接インラインにして MUI 依存を完全除去
- **対象ファイル**:
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx`
- **レギュレーション注意点**: アイコンの見た目が変わらないようにする（VRT 対応）

---

### 施策 4: Three.js の除去（HeroImage のリファクタリング）

- **対象メトリクス**: TBT, FCP, CLS
- **期待される改善**: ~500KB+ のバンドル削減 + HeroImage の描画遅延解消
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: ホームページ
- **具体的な作業内容**:
  1. 現在 Three.js (WebGL) で画像にシェーダー適用 → Canvas 2D API で同等効果を再現
  2. または事前にフィルタ適用済み画像をサーバー側で生成してそのまま `<img>` タグで表示
  3. WebGL レンダリング + async TextureLoader 呼び出しを完全除去
  4. これにより HeroImage の非同期レンダリングが解消し CLS も改善
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` (完全リライト)
  - `workspaces/app/package.json` (three.js 依存削除)
- **レギュレーション注意点**: ヒーロー画像の見た目を維持する必要あり（VRT 3%以内）

---

### 施策 5: SSR の API 呼び出し並列化

- **対象メトリクス**: FCP, LCP（TTFB 改善）
- **期待される改善**: TTFB を ~200-500ms 短縮（3つの逐次 API → 並列）
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `createInjectDataStr()` の3つの `await` を `Promise.all()` に変更
  2. releases, features, rankings を並列フェッチ
- **対象ファイル**:
  - `workspaces/server/src/routes/ssr/index.tsx` (createInjectDataStr 関数)
- **レギュレーション注意点**: なし

---

### 施策 6: 不要ライブラリの除去（lodash, moment-timezone, jQuery）

- **対象メトリクス**: TBT
- **期待される改善**: ~250KB のバンドル削減
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:

  **lodash (~70KB):**
  1. `TopPage/index.tsx`: `_.map()` → `Array.map()` に置換（3箇所）
  2. `EpisodeDetailPage/internal/ComicViewer.tsx`: `_.floor()` → `Math.floor()`, `_.clamp()` → `Math.min(Math.max())` に置換

  **moment-timezone (~100KB):**
  1. `getDayOfWeekStr.ts`: moment-timezone → `Intl.DateTimeFormat` または曜日配列で置換
  2. `TopPage/index.tsx` の呼び出し元を更新

  **jQuery (~80KB):**
  1. `DialogContentAtom.ts`: `$('body').css('overflow', ...)` → `document.body.style.overflow = ...` に置換

- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`
  - `workspaces/app/src/lib/date/getDayOfWeekStr.ts`
  - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts`
- **レギュレーション注意点**: なし

---

### 施策 7: CLS 改善（画像サイズ明示 + Separator 修正）

- **対象メトリクス**: CLS
- **期待される改善**: CLS を 0.43-0.50 → 0.1 以下を目標
- **優先度**: 中〜高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:

  **Image コンポーネントの HTML width/height 属性追加:**
  1. `Image.tsx` の `<img>` タグに `width` / `height` HTML 属性を付与
  2. ブラウザがレイアウト時にスペースを予約できるようにする

  **Separator コンポーネントの修正:**
  1. `Separator.tsx` の条件付きレンダリング（null → img）を解消
  2. 初期状態でもプレースホルダーの高さを確保する
  3. SSR 時にも正しいサイズでレンダリングされるよう修正

  **useImage フックの最適化:**
  1. `useImage.ts` の Canvas ベース非同期処理を見直し
  2. 画像の placeholder 表示でレイアウトシフトを防止

- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Image.tsx`
  - `workspaces/app/src/foundation/components/Separator.tsx`
  - `workspaces/app/src/foundation/hooks/useImage.ts`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
- **レギュレーション注意点**: VRT 差異3%以内を確認

---

### 施策 8: フォント最適化

- **対象メトリクス**: FCP, LCP, CLS
- **期待される改善**: フォント読み込み時間の短縮、FOIT/FOUT 防止
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 9つの Noto Sans JP ウェイトのうち、実際に使用されているウェイトのみに絞る
  2. WOFF → WOFF2 に変換（30-50% サイズ削減）
  3. `@font-face` に `font-display: swap` を追加
  4. 不要なウェイトの preload を削除
  5. サブセット化（日本語の使用文字のみ）を検討
- **対象ファイル**:
  - `workspaces/server/index.html` (preload タグ修正)
  - `workspaces/client/assets/` (フォントファイル置換)
  - CSS に `@font-face` 宣言を追加
- **レギュレーション注意点**: フォントの見た目を維持（VRT 3%以内）

---

### 施策 9: Service Worker 並列度向上

- **対象メトリクス**: LCP, SI
- **期待される改善**: リクエストのスループット向上（N+1修正後は効果限定的）
- **優先度**: 低（施策2の後なら重要度下がる）
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `PQueue` の concurrency を 5 → 20+ に変更
  2. または PQueue 自体を除去してブラウザのデフォルト並列度に任せる
- **対象ファイル**:
  - `workspaces/client/src/serviceworker/index.ts`
- **レギュレーション注意点**: SW を register する要件は維持

---

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 | 推定効果 |
|------|------|--------------------|----------|--------|----------|
| 1 | ImageSrc.ts 外部化 | TBT, FCP, LCP, SI | 極大 | 低 | バンドル -12MB |
| 2 | N+1 API 解消 | LCP, SI, TBT | 大 | 低〜中 | リクエスト 160+ → 3 |
| 3 | MUI icons ワイルドカード修正 | TBT, FCP | 大 | 低 | バンドル -2-3MB |
| 4 | Three.js 除去 | TBT, CLS | 中〜大 | 中 | バンドル -500KB + CLS改善 |
| 5 | SSR 並列化 | FCP, LCP | 中 | 低 | TTFB -200-500ms |
| 6 | 不要ライブラリ除去 | TBT | 中 | 低 | バンドル -250KB |
| 7 | CLS 改善 | CLS | 中 | 中 | CLS 0.5 → <0.1 目標 |
| 8 | フォント最適化 | FCP, CLS | 小〜中 | 中 | FCP/CLS改善 |
| 9 | SW 並列度向上 | LCP, SI | 小 | 低 | 施策2の後は効果限定 |

## 次のステップ

1. **施策 1（ImageSrc外部化）と 施策 2（N+1解消）から着手を推奨** — 最も低コストで最大効果
2. 続いて **施策 3（MUI icons）と 施策 5（SSR並列化）** — 簡単で確実な効果
3. 実装後は `perf-measure` で再計測して効果を確認
4. バンドルサイズ削減（施策1,3,4,6）で TBT 30点中 20点以上の回復を見込む
5. N+1 解消（施策2）で LCP 25点中 10-15点の改善を見込む
