# 改善施策提案

**計測日時**: 2026-03-16 22:47
**現在の推定スコア**: 約 11 / 100 点（ページランディング）
**提案日時**: 2026-03-16 23:00

## 現状の課題サマリー

4ページ平均 10.5点。失点 89.3点のうち LCP 25点（全損）、TBT 22.3点、CLS 22.3点が主要。
vendor-admin チャンク (351KB) がメインエントリの静的依存に含まれ、全ページでロードされている。

## 改善施策

### 施策: vendor-admin チャンクの静的依存を排除

- **対象メトリクス**: TBT, FCP
- **期待される改善**: 全ページで vendor-admin (351KB, gzip: 119KB) のダウンロード・パースが不要に。TBT -100ms 程度、FCP 改善
- **優先度**: 高
- **実装難易度**: 低〜中
- **影響範囲**: 全ページ（admin 以外）

#### 問題の原因（2つ）

**manifest.json で確認済み**: `src/index.tsx` の `imports` に `_vendor-admin-DV0yvp0x.js` が含まれている。

**原因1: @emotion パッケージの振り分け**

`vite.config.ts` の `manualChunks` で `@emotion` パッケージを全て `vendor-admin` に振り分けているが、`styled-components` が `@emotion/is-prop-valid` と `@emotion/unitless` に依存しているため静的依存が発生。

→ 対応済み: `@emotion/is-prop-valid` と `@emotion/unitless` を除外条件に追加。

**原因2: SvgIcon.tsx の @mui/icons-material 個別 import（根本原因）**

`SvgIcon.tsx` が `@mui/icons-material` から6つのアイコンを静的 import しており、`@mui` は vendor-admin に振り分けるルールがあるため、メインアプリから vendor-admin への静的依存が発生：

```
client.js → ClientApp → SvgIcon → @mui/icons-material/Favorite → vendor-admin.js
```

SvgIcon は全ページで使用されるため、@emotion の除外だけでは vendor-admin の静的依存は解消されない。

#### 修正内容

**Step 1: @emotion 除外（実施済み）**

```typescript
if (id.includes('@wsh-2024/admin') || id.includes('node_modules/@mui') || id.includes('node_modules/@chakra-ui')) {
  return 'vendor-admin';
}
if (id.includes('node_modules/@emotion') && !id.includes('@emotion/is-prop-valid') && !id.includes('@emotion/unitless')) {
  return 'vendor-admin';
}
```

**Step 2: SvgIcon.tsx から MUI 依存を完全除去**

MUI のコンポーネント (`<Icon style={...}>`) をやめ、使用する6アイコンの SVG path データを直接埋め込み、ネイティブ `<svg>` + `<path>` で描画する。

```typescript
// Before
import Favorite from '@mui/icons-material/Favorite';
// ... 6 imports
const Icon = IconMap[type];
return <Icon style={{ color, height, width }} />;

// After
const IconPaths: Record<string, string> = {
  ArrowBack: 'M20 11H7.83l5.59-5.59L12 4l-8 8 ...',
  Favorite: 'm12 21.35-1.45-1.32C5.4 15.36 ...',
  // ... 計6種
};
return (
  <svg viewBox="0 0 24 24" width={width} height={height} fill={color}>
    <path d={IconPaths[type]} />
  </svg>
);
```

- **対象ファイル**:
  - `workspaces/client/vite.config.ts` — @emotion 振り分け修正（Step 1、実施済み）
  - `workspaces/app/src/features/icons/components/SvgIcon.tsx` — MUI → インライン SVG path（Step 2）

#### 検証方法

1. `pnpm run build` (Docker rebuild) でビルド
2. `dist/.vite/manifest.json` の `src/index.tsx` → `imports` に `vendor-admin` が含まれないことを確認
3. `/admin` ページが正常に動作することを確認
4. 各ページのアイコン表示が変わらないことを確認

- **レギュレーション注意点**: アイコンの見た目が変わらないようにする（VRT 対応）。admin 画面の機能は維持。
