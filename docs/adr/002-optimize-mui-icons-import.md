# ADR-002: MUI アイコンのワイルドカードインポートを個別インポートに変更

## ステータス
承認済み

## コンテキスト
`workspaces/app/src/features/icons/components/SvgIcon.tsx` にて `import * as Icons from '@mui/icons-material'` というワイルドカードインポートが使用されていた。`@mui/icons-material` パッケージには数千個のアイコンコンポーネントが含まれており、このインポート方法ではバンドラ（tsup/esbuild）がツリーシェイキングを行えず、全アイコン（約 2-3MB）がメインバンドルに含まれてしまっていた。

実際にアプリケーション内で使用されているアイコンは以下の 6 個のみであり、残りの数千個は完全に不要なコードだった。

加えて、tsup の設定で `treeshake: false` となっているため、名前付きインポートに変更しても効果がない。各アイコンの個別エントリポイント（deep import）を使うことで、バンドラの設定に依存せずに不要なコードを排除できる。

## 決定
ワイルドカードインポートを廃止し、各アイコンの個別モジュールパスからの deep import に変更する。

### Before
```typescript
import * as Icons from '@mui/icons-material';
const Icon = Icons[type];
```

### After
```typescript
import ArrowBack from '@mui/icons-material/ArrowBack';
import Close from '@mui/icons-material/Close';
import Favorite from '@mui/icons-material/Favorite';
import FavoriteBorder from '@mui/icons-material/FavoriteBorder';
import NavigateNext from '@mui/icons-material/NavigateNext';
import Search from '@mui/icons-material/Search';

const IconMap = { ArrowBack, Close, Favorite, FavoriteBorder, NavigateNext, Search } as const;
const Icon = IconMap[type];
```

コンポーネントの `type` プロパティの型は `keyof typeof Icons`（全アイコン名）から `keyof typeof IconMap`（使用する 6 アイコン名のみ）に変更される。呼び出し元は全て上記 6 アイコンのみを使用しているため、型互換性に問題はない。

## 影響

### パフォーマンス
- メインバンドルから約 2-3MB の不要な JavaScript が削除される
- `@mui/icons-material` のバレルファイル（index.js）を読み込まなくなるため、モジュール解決も高速化
- 6 個の個別アイコンモジュール（各数 KB）のみがバンドルに含まれる

### 使用アイコン一覧

| アイコン名 | 使用ファイル | 用途 |
|-----------|-------------|------|
| `ArrowBack` | `routes.tsx` | トップへ戻るボタン |
| `Search` | `CoverSection.tsx` | 検索リンク |
| `Favorite` | `FavButton.tsx` | お気に入り済み状態 |
| `FavoriteBorder` | `FavButton.tsx` | お気に入り未登録状態 |
| `NavigateNext` | `RankingCard.tsx` | ランキング詳細への遷移矢印 |
| `Close` | `Dialog.tsx` | ダイアログ閉じるボタン |

### VRT への影響
- 各アイコンの SVG 出力は同一のため、VRT（Visual Regression Test）への影響はなし
- コンポーネントの props インターフェースも実質的に変更なし（使用されていない型が削除されただけ）
