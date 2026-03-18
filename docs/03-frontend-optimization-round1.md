# 03. フロントエンド最適化 Round 1

Vite 移行後のクライアントバンドルに残る主要ボトルネックに対する5つの施策。

## 施策一覧

| # | 施策 | 主な効果 | 対象メトリクス |
|---|------|---------|--------------|
| 1 | ヒーロー画像: Three.js 完全削除 | バンドル -12.8MB + three.js 除去, 画像 9.6MB→289KB | TBT, LCP, FCP |
| 2 | SvgIcon: MUI icons 完全排除 | @mui/icons-material バンドル除去 | TBT, FCP |
| 3 | カード系コンポーネント: N+1 リクエスト解消 | API リクエスト数削減, Suspense 除去 | LCP, TBT |
| 4 | Vite チャンク分割: @emotion 依存の修正 | メインエントリから admin チャンクへの静的依存を排除 | TBT, FCP |
| 5 | インフラ: Node.js 更新 + Dockerfile キャッシュ改善 | ランタイム性能向上, ビルド高速化 | 全般 |

---

## 施策 1: ヒーロー画像 — Three.js 完全削除

### 背景

トップページの `HeroImage` コンポーネントは、`ImageSrc.ts` に base64 エンコードされた PNG（約 12.8MB）をインライン保持し、Three.js の `WebGLRenderer` + カスタムシェーダーで描画していた。

問題点：
- base64 データ 12.8MB が JS バンドルに含まれる（バンドル全体の約 68%）
- `three` パッケージ本体もバンドルに含まれる
- WebGL セットアップ → シェーダーレンダリング → `canvas.toDataURL()` → `<img>` に反映、という多段処理で CPU を占有
- シェーダーは単純なテクスチャ表示のみで、視覚的エフェクトはなし

### 変更内容

Three.js による WebGL レンダリングを完全に削除し、静的な `<img>` タグに置き換えた。

1. 元の base64 PNG をデコード → JPEG に変換し `workspaces/client/public/hero.jpg`（289KB）として配置
2. `HeroImage.tsx` を ~100 行から ~20 行に簡素化（`<img src="/hero.jpg">` のみ）
3. `ImageSrc.ts` を削除
4. `three` / `@types/three` を `package.json` から除去

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `workspaces/app/src/pages/TopPage/internal/HeroImage.tsx` | Three.js → 静的 `<img>` に置換 |
| `workspaces/app/src/pages/TopPage/internal/ImageSrc.ts` | 削除 |
| `workspaces/app/package.json` | `three`, `@types/three` を除去 |
| `workspaces/client/public/hero.jpg` | 新規 (289KB) |
| `pnpm-lock.yaml` | three 関連の依存を除去 |

### 期待効果

| 指標 | 改善 |
|------|------|
| JS バンドルサイズ | -12.8MB (base64) + three.js 本体の除去 |
| 画像転送量 | 9.6MB (PNG) → 289KB (JPEG) |
| TBT | JS パース・WebGL 処理の削減 |
| LCP/FCP | バンドルダウンロード・パース完了が早まる |

### リスク

- Three.js シェーダーのエフェクトが失われるため、**VRT（スクリーンショット差異 3% 以内）の通過確認が必要**
- 元のシェーダーは単純なテクスチャマッピングだったため、視覚的な差異は最小限と判断

---

## 施策 2: SvgIcon — MUI icons 完全排除

### 背景

`SvgIcon.tsx` は `@mui/icons-material` からワイルドカード import (`import * as Icons`) していた。

```typescript
// 変更前
import * as Icons from '@mui/icons-material';
const Icon = Icons[type];
return <Icon style={{ color, height, width }} />;
```

実際に使用されているアイコンは 6 種のみ（ArrowBack, Search, Close, NavigateNext, Favorite, FavoriteBorder）だが、ワイルドカード import により **MUI icons の全アイコン定義**がバンドルに含まれていた。

### 変更内容

MUI のコンポーネントをやめ、使用する 6 アイコンの **SVG path データを直接埋め込み**。ネイティブ `<svg>` + `<path>` で描画する方式に変更した。

```typescript
// 変更後
const IconPaths: Record<string, string> = {
  ArrowBack: 'M20 11H7.83l5.59-5.59L12 4l-8 8 ...',
  Search: '...',
  // ... 計6種
};

return (
  <svg viewBox="0 0 24 24" width={width} height={height} fill={color}>
    <path d={IconPaths[type]} />
  </svg>
);
```

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `workspaces/app/src/features/icons/components/SvgIcon.tsx` | MUI → インライン SVG path |
| `workspaces/app/package.json` | `@mui/icons-material` は残存（admin が使用） |
| `pnpm-lock.yaml` | 変更なし（admin 経由で残る） |

### 期待効果

- メインクライアントバンドルから MUI icons の全アイコン定義を除去
- `<svg>` ネイティブ要素のため、MUI のコンポーネントレイヤー（React コンポーネント + スタイル計算）が不要に
- TBT / FCP の改善

---

## 施策 3: カード系コンポーネント — N+1 リクエスト解消

### 背景

トップページの各カードコンポーネント（`BookCard`, `FeatureCard`, `RankingCard`）は、親から `bookId` のみを受け取り、各自が `useBook({ params: { bookId } })` で個別に API を叩いていた。

```
TopPage
├── FeatureCard  bookId="xxx" → useBook() → GET /api/v1/books/xxx
├── FeatureCard  bookId="yyy" → useBook() → GET /api/v1/books/yyy
├── RankingCard  bookId="aaa" → useBook() → GET /api/v1/books/aaa
├── RankingCard  bookId="bbb" → useBook() → GET /api/v1/books/bbb
└── BookCard     bookId="ccc" → useBook() → GET /api/v1/books/ccc
    ...
```

親の `useFeatureList()` / `useRankingList()` / `useRelease()` のレスポンスには `book` オブジェクトが既に含まれているにもかかわらず、子コンポーネントが重複して取得する **N+1 問題** が発生していた。各カードは `Suspense` でラップされ、個別リクエスト完了までフォールバック (`null`) を表示していた。

### 変更内容

1. 各カードの props を `bookId: string` から `book: { ... }` オブジェクトに変更
2. 親コンポーネント（`TopPage`）から既に取得済みの `book` データを直接渡す
3. 各カードから `useBook()` hook の呼び出しを削除
4. 不要になった `Suspense` ラッパー (`*WithSuspense`) を削除

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `workspaces/app/src/features/book/components/BookCard.tsx` | `bookId` → `book` props, `useBook()` 削除, `Suspense` 削除 |
| `workspaces/app/src/features/book/components/BookListItem.tsx` | 同上（`Suspense` は元々なし） |
| `workspaces/app/src/features/feature/components/FeatureCard.tsx` | 同上 |
| `workspaces/app/src/features/ranking/components/RankingCard.tsx` | 同上 |
| `workspaces/app/src/features/episode/components/EpisodeListItem.tsx` | 未使用 `useEpisode` import 削除 |
| `workspaces/app/src/pages/TopPage/index.tsx` | `bookId={...book.id}` → `book={...book}` に変更 |

### 期待効果

| 指標 | 改善 |
|------|------|
| API リクエスト数 | ピックアップ 4 + ランキング 10 + 本日更新 N → **0** 件削減 |
| LCP | データ取得待ちの Suspense フォールバック（空白）がなくなる |
| TBT | 個別 fetch + React サスペンド/再レンダリングの CPU コスト削減 |

### 注意点

- `BookCard`, `FeatureCard`, `RankingCard` がトップページ以外で使われている場合は、そちらの呼び出し元も `book` オブジェクトを渡すように修正が必要
- `BookListItem` は `SearchPage` 等でも使われる可能性があり、呼び出し元の確認が必要

---

## 施策 4: Vite チャンク分割 — @emotion 依存の修正

### 背景

Vite の `manualChunks` 設定で `@emotion` パッケージをすべて `vendor-admin` チャンクに振り分けていた。しかし、`styled-components` が内部で `@emotion/is-prop-valid` と `@emotion/unitless` を使用しているため、メインエントリから `vendor-admin` チャンクへの**静的依存**が発生していた。

```
client.js → styled-components → @emotion/is-prop-valid → vendor-admin.js
```

この結果、`/admin` 以外のページでも `vendor-admin` チャンク（~4.2MB）のロードがトリガーされる可能性があった。

### 変更内容

`@emotion/is-prop-valid` と `@emotion/unitless` を `vendor-admin` チャンクの振り分けから除外。

```typescript
// workspaces/client/vite.config.ts
if (id.includes('node_modules/@emotion')
    && !id.includes('@emotion/is-prop-valid')
    && !id.includes('@emotion/unitless')) {
  return 'vendor-admin';
}
```

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `workspaces/client/vite.config.ts` | `@emotion` チャンク振り分けに除外条件を追加 |

### 期待効果

- `/admin` 以外のページで `vendor-admin` チャンクがロードされなくなる
- メインページの初期ロード JS サイズが ~4.2MB 削減される可能性

---

## 施策 5: インフラ — Node.js 更新 + Dockerfile 改善

### 背景

`.tool-versions` で Node.js 20.11.1 が指定されていた。Dockerfile は `COPY . .` → `pnpm install` → `pnpm build` のシンプルな構成で、ソースコード変更のたびに `pnpm install` からやり直しになっていた。

### 変更内容

#### Node.js バージョン更新

`.tool-versions` を `nodejs 20.11.1` → `nodejs 22.22.0` に更新。

V8 エンジンの改善によるランタイム性能向上（特に SSR レンダリング速度）を期待。

#### Dockerfile レイヤーキャッシュ最適化

`package.json` を先にコピーして `pnpm install` し、その後にソースコードをコピーする multi-stage COPY に変更。

```dockerfile
# 変更前
COPY . .
RUN pnpm install
RUN pnpm build

# 変更後
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY workspaces/client/package.json workspaces/client/
COPY workspaces/server/package.json workspaces/server/
# ... 各 workspace の package.json
RUN pnpm install
RUN cd node_modules/.pnpm/better-sqlite3@.../better-sqlite3 \
    && npx --yes prebuild-install -r napi \
    || npx --yes node-gyp rebuild --release
COPY . .
RUN pnpm build
```

ソースコード変更時に `pnpm install` レイヤーのキャッシュが効くようになる。

### 変更ファイル

| ファイル | 変更 |
|---------|------|
| `.tool-versions` | `nodejs 20.11.1` → `nodejs 22.22.0` |
| `Dockerfile` | multi-stage COPY + better-sqlite3 明示的リビルド |

### 期待効果

- Node.js 22 の V8 改善によるサーバーサイド処理の高速化
- Docker ビルド時間の短縮（ソース変更時に依存インストールをスキップ）

### 注意点

- Node.js メジャーバージョン変更のため、依存ライブラリの互換性確認が必要
- 採点環境の Node.js バージョンとの整合性を確認すること
