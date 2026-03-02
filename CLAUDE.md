# Web Speed Hackathon 2024 - Cyber TOON

## プロジェクト概要

Web パフォーマンス最適化コンペティション用の架空漫画サイト「Cyber TOON」。
意図的に重く作られた Web アプリを、機能・デザインを維持しつつ高速化することが目的。

採点: Lighthouse によるページランディング(100点) + ユーザーフロー(50点)の合計150点満点。

## 技術スタック

- **モノレポ**: pnpm workspaces (pnpm 8.15.4)
- **フロントエンド**: React 18, styled-components, SWR, React Router DOM 6
- **バックエンド**: Hono (Node.js), SSR対応
- **DB**: SQLite (better-sqlite3) + Drizzle ORM
- **スキーマ**: Zod + drizzle-zod
- **バンドラ**: tsup (esbuild ベース)
- **テスト**: Playwright (E2E + VRT)
- **ランタイム**: Node.js 20.11.1
- **言語**: TypeScript 5.4.2

## ワークスペース構成

```
workspaces/
├── server/        (@wsh-2024/server)  - Hono バックエンド、SSR、API
├── client/        (@wsh-2024/client)  - ブラウザエントリ (IIFE バンドル)
├── app/           (@wsh-2024/app)     - Cyber TOON メインアプリ (React)
├── admin/         (@wsh-2024/admin)   - 管理画面 (React, MUI, Chakra UI)
├── schema/        (@wsh-2024/schema)  - DB モデル & API スキーマ (Drizzle + Zod)
├── image-encrypt/ (@wsh-2024/image-encrypt) - 画像難読化 CLI
└── testing/       (@wsh-2024/testing) - E2E/VRT テスト (Playwright)
```

### 依存関係フロー

- `client` → `app`, `admin`
- `app` → `schema`, `image-encrypt`
- `admin` → `schema`, `image-encrypt`
- `server` → `schema`, `app` (SSR用)

## コマンド

```bash
# セットアップ
corepack enable pnpm && corepack use pnpm@latest
pnpm install

# ビルド & 起動
pnpm run build          # client + server を並列ビルド
pnpm run start          # サーバー起動 (localhost:8000)

# テスト
pnpm --filter "@wsh-2024/testing" exec playwright install chromium
pnpm run test           # E2E + VRT 実行
pnpm run test:debug     # デバッグモード

# リント & フォーマット
pnpm run lint           # ESLint + Prettier + tsc
pnpm run format         # 自動修正
```

## アプリケーション URL

- Web アプリ: `http://localhost:8000/`
- 管理画面: `http://localhost:8000/admin`
  - ユーザー: `administrator@example.com` / パスワード: `pa5sW0rd!`
- API ドキュメント (Swagger): `http://localhost:8000/api/v1`

## 主要ディレクトリ構造

### サーバー (`workspaces/server/src/`)
- `routes/api/` - REST API エンドポイント (authors, books, episodes, episodePages, features, images, rankings, releases, auth)
- `routes/image/` - 画像配信 (コンテントネゴシエーション対応)
- `routes/static/` - 静的ファイル配信
- `routes/admin/` - 管理画面ルート
- `repositories/` - DB アクセス層
- `database/` - Drizzle セットアップ & シード
- `image-converters/` - 画像フォーマット変換 (AVIF, WebP, JPEG, PNG, JPEG XL)
- `middlewares/` - 認証, キャッシュ制御, 圧縮

### アプリ (`workspaces/app/src/`)
- `pages/` - ページコンポーネント (TopPage, BookDetailPage, EpisodeDetailPage, AuthorDetailPage, SearchPage)
- `features/` - 機能ごとのコンポーネント (book, episode, feature, ranking, viewer, icons)
- `foundation/` - 基盤コンポーネント (Box, Button, Container, Dialog, Flex, Footer, Image, Link, Text...)
- `routes.tsx` - ルーティング定義

### スキーマ (`workspaces/schema/`)
- DB テーブル定義 (Drizzle) と API スキーマ (Zod) の共有モジュール
- モデル: User, Author, Book, Episode, EpisodePage, Image, Feature, Release, Ranking

## レギュレーション (重要)

### 絶対に守ること
1. **E2E テスト・VRT を通過させること** (スクリーンショット差異3%以内)
2. **Chrome 最新版で著しい機能落ちやデザイン差異を出さない**
3. **`POST /api/v1/initialize` で DB を初期状態にリセットできること**
4. **Service Worker を register すること** (採点サーバーが SW 起動を待ち合わせる)
5. **漫画ページ画像を推察できる状態で配信しない** (難読化必須)

### 許可されていること
- すべてのコード・ファイルを変更可能
- API レスポンスへの項目追加可能
- 外部 SaaS の無料利用可能

## ビルド設定

- **Client**: tsup → IIFE 形式, ブラウザ向け, esbuild Node polyfills, ソースマップ inline
- **Server**: tsup → CommonJS 形式, Node 18 ターゲット, ワークスペース内部バンドル

## 環境変数

| 変数 | デフォルト | 用途 |
|------|-----------|------|
| `PORT` | 8000 | サーバーポート |
| `NODE_ENV` | development | ビルドモード |
| `E2E_BASE_URL` | http://localhost:8000 | E2E テスト対象 URL |

## パフォーマンス最適化の注意点

このプロジェクトは意図的にパフォーマンスが悪く作られている。主な問題領域:
- 大量の不要な polyfill (core-js, es5/6/7-shim, regenerator-runtime)
- 重いライブラリ (three.js, canvaskit-wasm, jQuery, lodash, moment-timezone)
- 未最適化の画像 (14MB SVG ロゴ、大量の WOFF フォント)
- ミニファイ無効、ツリーシェイキング無効の tsup 設定
- 非効率な画像処理 (jimp, image-js)

採点対象ページ:
1. ホームページ (`/`)
2. 作者詳細ページ (`/authors/:id`)
3. 作品詳細ページ (`/books/:id`)
4. エピソードページ (`/books/:bookId/episodes/:episodeId`)
