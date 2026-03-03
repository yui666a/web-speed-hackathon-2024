# 02. バンドラー移行: tsup → Vite

クライアントビルドを tsup (esbuild) から Vite (Rollup) に移行した記録。

## 背景

元の tsup 設定は意図的にパフォーマンスが悪い構成だった：

```typescript
// workspaces/client/tsup.config.ts (削除済み)
{
  format: 'iife',
  minify: false,
  treeshake: false,
  splitting: false,
  sourcemap: 'inline',
}
```

この結果、**約 120MB の単一 IIFE バンドル**が生成されていた。

## 移行で得られた効果

| 項目 | tsup (移行前) | Vite (移行後) |
|------|-------------|--------------|
| バンドル形式 | IIFE 単一ファイル | ESM + コードスプリッティング |
| tree shaking | 無効 | 有効 |
| minify | 無効 | 有効 (esbuild) |
| 出力サイズ (合計) | ~120 MB | ~25 MB (gzip: ~14 MB) |
| AdminApp | 常にバンドル | 動的 import で分離 (~4.2 MB) |
| Service Worker | IIFE | ESM (`type: 'module'`) |

### チャンク内訳

| チャンク | サイズ | gzip | 備考 |
|---------|--------|------|------|
| `client-[hash].js` | 18,797 KB | 12,525 KB | メインアプリ (まだ大きい) |
| `vendor-admin-[hash].js` | 4,198 KB | 790 KB | /admin 時のみロード |
| `index-[hash].js` | 2,076 KB | 360 KB | 動的 import チャンク |
| `vendor-react-[hash].js` | 168 KB | 56 KB | React/ReactDOM/SWR |
| `index-[hash].js` (entry) | 87 KB | 25 KB | エントリポイント |
| `serviceworker.global.js` | 641 KB | 197 KB | Service Worker |

## 変更したファイル一覧

### 新規作成

| ファイル | 内容 |
|---------|------|
| `workspaces/client/vite.config.ts` | メイン Vite 設定 |
| `workspaces/client/vite.sw.config.ts` | SW 用 Vite 設定 |
| `workspaces/client/src/utils/pathShim.ts` | path-browserify の軽量代替 |
| `workspaces/server/src/utils/viteManifest.ts` | manifest.json からアセットパスを解決 |

### 修正

| ファイル | 内容 |
|---------|------|
| `workspaces/client/package.json` | deps 変更, ビルドスクリプト変更 |
| `workspaces/client/src/index.tsx` | jQuery/side-effects 削除, AdminApp 動的 import |
| `workspaces/client/src/utils/preloadImages.ts` | path-browserify → 文字列操作 |
| `workspaces/client/src/utils/registerServiceWorker.ts` | `type: 'module'` 追加 |
| `workspaces/server/index.html` | script タグ → プレースホルダー化 |
| `workspaces/server/src/routes/ssr/index.tsx` | manifest からアセット注入 |
| `workspaces/server/src/routes/admin/index.ts` | 同上 |
| `Dockerfile` | native module rebuild, multi-stage COPY |

### 削除

| ファイル | 理由 |
|---------|------|
| `workspaces/client/tsup.config.ts` | Vite に置き換え |
| `workspaces/client/src/side-effects.ts` | 不要ポリフィル全削除 |

### 削除した依存 (不要ポリフィル・ライブラリ)

- `core-js`, `es5-shim`, `es6-shim`, `es7-shim`, `regenerator-runtime`
- `@webcomponents/webcomponentsjs`, `unorm`
- `jquery` → `document.getElementById` で代替
- `path-browserify` → 文字列操作で代替
- `tsup`, `esbuild-plugin-polyfill-node`

### 追加した依存

- `vite@5.4.14`, `@vitejs/plugin-react`, `vite-plugin-node-polyfills`

## 実装時にハマったポイント

### 1. Rollup の ES2024 regex `v` フラグ未対応

**症状**: `RollupError: Unknown regular expression flags.`

**原因**: Vite 5.1.4 同梱の Rollup 4.9.5 が ES2024 regex `v` フラグを認識できない。依存ライブラリの一部がこのフラグを使っている。

**解決**: Vite を 5.4.14 にアップグレード (Rollup 4.22+ が同梱)。

```
❌ "vite": "5.1.4"   → Rollup 4.9.5  (v フラグ未対応)
✅ "vite": "5.4.14"  → Rollup 4.59.0 (v フラグ対応)
```

### 2. Node.js モジュールのブラウザ互換性エラー

**症状**: `"Buffer" is not exported by "__vite-browser-external"`

**原因**: `token-types` → `strtok3` → `file-type` が `node:buffer` を import。Vite はブラウザビルド時に Node モジュールを外部化するが、`Buffer` のエクスポートが存在しない。

**解決**: メインの `vite.config.ts` にも `vite-plugin-node-polyfills` を追加。

```typescript
plugins: [
  react(),
  nodePolyfills({
    include: ['buffer', 'events', 'process', 'stream', 'util', 'path'],
    globals: { Buffer: true, process: true },
  }),
],
```

### 3. SW の IIFE ビルドで `import.meta.url` 代入エラー

**症状**: `ERROR: Invalid assignment target` (serviceworker.global.js)

**原因**: Vite の IIFE 出力で `import.meta.url` が `(_documentCurrentScript ... || new URL(...).href)` に変換されるが、`@jsquash/jxl` の初期化コードが `import.meta.url = "https://localhost"` を試み、この変換後の式は代入のターゲットにできない。

**解決**: SW を ESM 形式で出力し、`type: 'module'` で登録するように変更。

```typescript
// vite.sw.config.ts
rollupOptions: {
  output: {
    format: 'es',   // IIFE → ES に変更
    entryFileNames: 'serviceworker.global.js',
    inlineDynamicImports: true,
  },
}
```

```typescript
// registerServiceWorker.ts
navigator.serviceWorker.register('/serviceworker.global.js', {
  type: 'module',  // 追加
  updateViaCache: 'none',
});
```

### 4. SW の `__dirname` 未定義エラー

**症状**: `ReferenceError: __dirname is not defined` (SW 評価失敗)

**原因**: jimp の依存が `__dirname` を参照。ESM モードでは `__dirname` は存在しない。

**解決**: `vite.sw.config.ts` の `define` でスタブを提供。

```typescript
define: {
  __dirname: JSON.stringify('/'),
  __filename: JSON.stringify('/serviceworker.global.js'),
}
```

### 5. Vite の manifest.json によるアセット解決

**課題**: Vite はハッシュ付きファイル名 (`client-CEfwh39K.js`) を生成するため、サーバー側で静的に `<script src="/client.global.js">` と書けない。

**解決**: `build.manifest: true` で `.vite/manifest.json` を生成し、サーバー側でエントリ名からパスを解決する仕組みを構築。

```typescript
// workspaces/server/src/utils/viteManifest.ts
getEntryAssets('src/index.tsx')
// → { scripts: ['/assets/client-CEfwh39K.js', ...], styles: [...] }
```

`index.html` はプレースホルダー (`<!-- VITE_SCRIPTS -->`, `<!-- VITE_STYLES -->`) に置き換え、SSR/admin ルートで動的に注入。

### 6. Docker での better-sqlite3 ネイティブモジュールビルド

**症状**: `Error: Could not locate the bindings file.` (サーバー起動失敗)

**原因**: pnpm install が better-sqlite3 の install スクリプト (`prebuild-install || node-gyp rebuild`) を実行しない。Alpine Linux arm64 向けのプリビルドバイナリも存在しない。

**解決**: Dockerfile で明示的にビルドを実行。

```dockerfile
RUN pnpm install
RUN cd node_modules/.pnpm/better-sqlite3@9.3.0/node_modules/better-sqlite3 \
    && npx --yes prebuild-install -r napi \
    || npx --yes node-gyp rebuild --release
```

また、package.json を先にコピーして install し、ソースを後からコピーする multi-stage 構成にして Docker キャッシュを有効活用。

## 残課題

- `client-[hash].js` がまだ 18.8 MB ある。jimp, three.js, canvaskit-wasm 等の大きなライブラリが含まれている。これらの除去・軽量代替への置き換えが次のステップ。
- `magika` が `fs/promises` を import して警告が出ている (実行時には使われないパス)。
- React hydration error #419 が発生している (SSR/クライアント間のミスマッチ、移行前から存在する可能性あり)。
