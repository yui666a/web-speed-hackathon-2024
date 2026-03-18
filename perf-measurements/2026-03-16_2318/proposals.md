# 改善施策提案

**計測日時**: 2026-03-16 23:18
**現在の推定スコア**: 約 16 / 100 点（ページランディング）
**提案日時**: 2026-03-16 23:30

## 現状の課題サマリー

全4ページで LCP が 127〜138 秒（Lighthouse シミュレーション）で完全に 0 点。メインバンドル 18.8 MB が全てのボトルネックの起点。ホームページでは books API が 130 件以上個別リクエストされる N+1 問題があり、CLS は Spacer の遅延レンダリングと useImage の条件付きレンダリングで 0.38〜1.04 と壊滅的。

## 改善施策一覧

### 施策 1: Spacer コンポーネントの即時レンダリング化

- **対象メトリクス**: CLS
- **期待される改善**: CLS を全ページで大幅改善（各ページで Spacer が数箇所〜十数箇所使用されており、全てが初回レンダリング時に null を返してシフトを引き起こしている）
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `Spacer.tsx` から `useMount` + `useBoolean` による遅延レンダリングを削除
  2. 常に `_Spacer` を返すように変更（`mounted` 状態管理を削除）
  3. SSR でも正しくスペースが確保されるようになる
- **対象ファイル**:
  - `workspaces/app/src/foundation/components/Spacer.tsx`
- **レギュレーション注意点**: デザイン変更なし。VRT への影響は軽微（スペースが SSR 時点から存在するため、むしろ安定化する方向）

---

### 施策 2: useImage の条件付きレンダリング廃止（画像プレースホルダー確保）

- **対象メトリクス**: CLS
- **期待される改善**: 画像表示時のレイアウトシフトを防止。BookCard, FeatureCard, RankingCard 等 8 箇所以上で効果あり
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 各カードコンポーネントで `{imageUrl != null && <Image ... />}` パターンを廃止
  2. 代わりに `_ImgWrapper` を常にレンダリングし、imageUrl が null の場合は空の状態で固定サイズを確保
  3. Image コンポーネントに HTML の `width`/`height` 属性を追加して、CSS 読み込み前からサイズを予約
- **対象ファイル**:
  - `workspaces/app/src/features/book/components/BookCard.tsx` (lines 47-50)
  - `workspaces/app/src/features/book/components/BookListItem.tsx` (lines 44-47)
  - `workspaces/app/src/features/episode/components/EpisodeListItem.tsx` (lines 45-48)
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx` (lines 58-61)
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx` (lines 55-58)
  - `workspaces/app/src/pages/BookDetailPage/index.tsx` (lines 69-71)
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx` (lines 46-49)
  - `workspaces/app/src/foundation/components/Image.tsx`
- **レギュレーション注意点**: VRT 差分に注意。ロード中に空白領域が見えるがレイアウト自体は変わらない

---

### 施策 3: preloadImages() の削除またはノンブロッキング化

- **対象メトリクス**: FCP, LCP, SI
- **期待される改善**: FCP を最大 5 秒短縮。現在 `await preloadImages()` が最大 5 秒間レンダリングをブロックしている
- **優先度**: 高
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `index.tsx` の `await preloadImages()` を削除（または非同期で fire-and-forget に変更）
  2. 必要なら、本当に必要な画像（ヒーロー画像など）だけ個別にプリロードする
- **対象ファイル**:
  - `workspaces/client/src/index.tsx` (line 12)
  - `workspaces/client/src/utils/preloadImages.ts`
- **レギュレーション注意点**: 画像の初期表示がやや遅れる可能性があるが、機能的には問題なし

---

### 施策 4: ルートベースのコード分割（React.lazy）

- **対象メトリクス**: TBT, FCP, LCP, SI
- **期待される改善**: メインチャンクを大幅に削減。現在全5ページが1つのバンドルに含まれており、不要なページのコードがパース・実行されている。three.js（TopPage のみ）, @react-spring（BookDetailPage のみ）等がページ単位で分離される
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `routes.tsx` で各ページコンポーネントを `React.lazy()` でインポート
  2. 各ルートを `<Suspense>` で囲む（既に各ページに Suspense があるので統合可能）
  3. Vite が自動的にページごとのチャンクを生成する
- **対象ファイル**:
  - `workspaces/app/src/routes.tsx`
  - `workspaces/app/src/pages/TopPage/index.tsx`（export 確認）
  - `workspaces/app/src/pages/BookDetailPage/index.tsx`
  - `workspaces/app/src/pages/EpisodeDetailPage/index.tsx`
  - `workspaces/app/src/pages/AuthorDetailPage/index.tsx`
  - `workspaces/app/src/pages/SearchPage/index.tsx`
- **レギュレーション注意点**: SSR との兼ね合いに注意。React.lazy は SSR では動作しないため、サーバーサイドでは同期インポートを維持するか、SSR 対応の lazy loading（loadable-components 等）を使う必要がある

---

### 施策 5: 重いライブラリの除去・軽量化

- **対象メトリクス**: TBT, FCP, SI
- **期待される改善**: メインバンドルから推定 600 KB+ (gzip) を削減
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:

  **5a. lodash → ネイティブメソッド**
  - `TopPage/index.tsx`: `_.map()` → `Array.map()`
  - `EpisodeDetailPage/internal/ComicViewer.tsx`: `_.floor()` → `Math.floor()`, `_.clamp()` → `Math.min(Math.max())`

  **5b. moment-timezone → ネイティブ Date**
  - `TopPage/index.tsx`: `moment().day()` → `new Date().getDay()` で曜日取得
  - `getDayOfWeekStr()` 関数を dayOfWeek マッピングに置き換え

  **5c. jQuery → DOM API**
  - `DialogContentAtom.ts`: `$('body').css('overflow', ...)` → `document.body.style.overflow = ...`

  **5d. three.js → Canvas 2D API or 静的画像**
  - `TopPage/internal/HeroImage.tsx`: WebGL シェーダーでの画像エフェクト → CSS filter/Canvas 2D/静的画像に置き換え
  - これは最も影響が大きいが実装難易度も高い。VRT の差異 3% 以内に収める必要あり

- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx` (lodash, moment)
  - `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` (three.js)
  - `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx` (lodash)
  - `workspaces/app/src/foundation/atoms/DialogContentAtom.ts` (jQuery)
- **レギュレーション注意点**: three.js の置き換えは VRT に影響する可能性が高い。シェーダーエフェクトの再現度に注意

---

### 施策 6: N+1 API 問題の解消（books 個別 fetch の廃止）

- **対象メトリクス**: LCP, SI, TBT
- **期待される改善**: ホームページで 130+ 個別リクエスト → 3 リクエスト（features, rankings, releases）に削減。レスポンスに完全な book データが既に含まれているため、クライアント側で個別 fetch を省略できる
- **優先度**: 高
- **実装難易度**: 中
- **影響範囲**: 主にホームページ。他のページにも BookCard 等があれば影響
- **具体的な作業内容**:
  1. 親コンポーネント（TopPage）で取得した features/rankings/releases レスポンスに含まれる book データを子コンポーネントに props で渡す
  2. BookCard, FeatureCard, RankingCard で `useBook()` hook を呼ばず、props から book データを受け取る
  3. あるいは SWR の `fallback` オプションでキャッシュをプリポピュレートする
- **対象ファイル**:
  - `workspaces/app/src/pages/TopPage/index.tsx`
  - `workspaces/app/src/features/book/components/BookCard.tsx`
  - `workspaces/app/src/features/feature/components/FeatureCard.tsx`
  - `workspaces/app/src/features/ranking/components/RankingCard.tsx`
  - `workspaces/app/src/features/book/hooks/useBook.ts`
- **レギュレーション注意点**: API レスポンスの型に注意。既存の GetFeatureListResponse 等に book の完全データが含まれていることを確認済み

---

### 施策 7: SSR データのクライアント再利用（SWR cache hydration）

- **対象メトリクス**: LCP, FCP, SI
- **期待される改善**: サーバーで取得したデータをクライアントで再利用し、初期 API 呼び出しを完全に省略。SSR HTML にはデータが `<script id="inject-data">` で埋め込まれているが、クライアント側で読み込まれていない
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `index.tsx` で `<script id="inject-data">` から JSON を読み取る
  2. SWRConfig の `fallback` プロパティにマッピングして渡す
  3. SWR が fallback データを使い、初期レンダリング時にデータが即座に利用可能になる
- **対象ファイル**:
  - `workspaces/client/src/index.tsx` (SWRConfig)
  - `workspaces/server/src/routes/ssr/index.tsx` (inject-data の中身確認)
- **レギュレーション注意点**: なし

---

### 施策 8: フォント最適化（WOFF → WOFF2 + 使用ウェイト限定 + font-display）

- **対象メトリクス**: FCP, CLS, LCP
- **期待される改善**: フォントの読み込みサイズを削減し、レンダーブロッキングを防止。9 ウェイト → 2〜3 ウェイト、WOFF → WOFF2 で 50%+ サイズ削減。font-display: swap でテキストの早期表示
- **優先度**: 中
- **実装難易度**: 中
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. 実際に使われているフォントウェイトを調査（Regular, Bold, Medium 程度のはず）
  2. 不要なウェイトの preload を削除
  3. WOFF ファイルを WOFF2 に変換
  4. @font-face 宣言に `font-display: swap` を追加
  5. preload は実際に使うウェイト（2〜3）のみに限定
- **対象ファイル**:
  - `workspaces/server/index.html` (lines 13-21)
  - フォントファイル（`/assets/NotoSansJP-*.woff`）
  - CSS ファイルまたは styled-components のグローバルスタイル（@font-face 宣言）
- **レギュレーション注意点**: フォントウェイト削減で一部テキストの太さが変わる可能性あり。VRT 差分 3% 以内を確認

---

### 施策 9: registerServiceWorker のノンブロッキング化

- **対象メトリクス**: FCP, LCP
- **期待される改善**: SW 登録待ちによるレンダリングブロック解消。ただし採点サーバーが SW 起動を待ち合わせるため、register 自体は必須
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ
- **具体的な作業内容**:
  1. `await registerServiceWorker()` を `registerServiceWorker()` に変更（await 外す）
  2. SW の register は fire-and-forget で問題ない（採点サーバーは SW の ready を待つため、register が完了していれば OK）
- **対象ファイル**:
  - `workspaces/client/src/index.tsx` (line 11)
- **レギュレーション注意点**: SW を register すること自体は必須（レギュレーション #4）。await を外すだけで register はされる

---

### 施策 10: SVG ロゴの最適化

- **対象メトリクス**: FCP, LCP, SI
- **期待される改善**: 14 MB の SVG ロゴを最適化すれば帯域を大幅に節約
- **優先度**: 中
- **実装難易度**: 低
- **影響範囲**: 全ページ（ヘッダーに表示）
- **具体的な作業内容**:
  1. SVG ロゴファイルを特定し、svgo で最適化
  2. 不要なメタデータ・パスの簡略化
  3. 必要に応じて PNG/WebP に変換（ロゴが単純な場合）
- **対象ファイル**:
  - SVG ロゴファイル（要調査）
  - `workspaces/server/index.html`（preload リンク）
- **レギュレーション注意点**: ロゴのデザインを変えないこと。VRT 差分に注意

---

## 施策の優先順位

| 順位 | 施策 | 主な対象メトリクス | 期待改善 | 難易度 |
|------|------|--------------------|----------|--------|
| 1 | 施策 1: Spacer 即時レンダリング | CLS (25点) | 大 | 低 |
| 2 | 施策 3: preloadImages 削除 | FCP/LCP/SI (45点) | 大 | 低 |
| 3 | 施策 9: SW ノンブロッキング化 | FCP/LCP (35点) | 中 | 低 |
| 4 | 施策 5a-c: lodash/moment/jQuery 除去 | TBT (30点) | 中 | 低〜中 |
| 5 | 施策 2: 画像プレースホルダー確保 | CLS (25点) | 大 | 中 |
| 6 | 施策 6: N+1 API 解消 | LCP/SI (35点) | 大 | 中 |
| 7 | 施策 4: ルートベースコード分割 | TBT/FCP (40点) | 大 | 中 |
| 8 | 施策 7: SSR データ再利用 | LCP/FCP/SI (45点) | 中 | 中 |
| 9 | 施策 8: フォント最適化 | FCP/CLS (35点) | 中 | 中 |
| 10 | 施策 5d: three.js 除去 | TBT (30点) | 大 | 高 |
| 11 | 施策 10: SVG ロゴ最適化 | FCP/LCP/SI (45点) | 中 | 低 |

## 次のステップ

1. **施策 1 → 3 → 9** の低難易度グループから着手を推奨（CLS + FCP を即効で改善）
2. 次に **施策 5a-c → 2 → 6** の中難易度グループ（TBT + CLS + LCP を改善）
3. 最後に **施策 4 → 7 → 8** のアーキテクチャ変更グループ（全体的な底上げ）
4. 各グループ実装後は perf-validate でレギュレーション確認、perf-measure で効果測定
