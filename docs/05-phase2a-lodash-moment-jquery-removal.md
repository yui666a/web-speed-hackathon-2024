# Phase 2a: lodash/moment-timezone/jQuery の除去

**実施日**: 2026-03-17
**ベースラインスコア**: 15.75 / 100（2026-03-16_2345 計測）
**結果スコア**: 28.75 / 100（2026-03-17_0000 計測）
**改善幅**: +13.0 点

## 実施内容

### lodash の除去

**対象ファイル 1**: `workspaces/app/src/pages/TopPage/index.tsx`
- `_.map(featureList, ...)` → `featureList.map(...)`
- `_.map(rankingList, ...)` → `rankingList.map(...)`
- `_.map(release.books, ...)` → `release.books.map(...)`
- `import _ from 'lodash'` を削除

**対象ファイル 2**: `workspaces/app/src/pages/EpisodeDetailPage/internal/ComicViewer.tsx`
- `_.floor(...)` → `Math.floor(...)`
- `_.clamp(value, min, max)` → `Math.min(Math.max(value, min), max)`
- `import _ from 'lodash'` を削除

### moment-timezone の除去

**対象ファイル 1**: `workspaces/app/src/lib/date/getDayOfWeekStr.ts`
- 引数の型を `moment.Moment` → `Date` に変更
- `date.day()` → `date.getDay()`
- `import type moment from 'moment-timezone'` を削除

**対象ファイル 2**: `workspaces/app/src/pages/TopPage/index.tsx`
- `getDayOfWeekStr(moment())` → `getDayOfWeekStr(new Date())`
- `import moment from 'moment-timezone'` を削除

**対象ファイル 3**: `workspaces/server/src/routes/ssr/index.tsx`
- `getDayOfWeekStr(moment())` → `getDayOfWeekStr(new Date())`
- `import moment from 'moment-timezone'` を削除

### jQuery の除去

**対象ファイル**: `workspaces/app/src/foundation/atoms/DialogContentAtom.ts`
- `$('body').css('overflow', 'hidden')` → `document.body.style.overflow = 'hidden'`
- `$('body').css('overflow', 'scroll')` → `document.body.style.overflow = 'scroll'`
- `import $ from 'jquery'` を削除

## 計測結果

| ページ | Before | After | 差分 |
|--------|--------|-------|------|
| ホーム | 11 | 21 | **+10** |
| 作者詳細 | 17 | 30 | **+13** |
| 作品詳細 | 15 | 29 | **+14** |
| エピソード | 20 | 35 | **+15** |
| **平均** | **15.75** | **28.75** | **+13.0** |

### メトリクス別の変化

| メトリクス | Before 失点 | After 失点 | 改善 |
|-----------|------------|------------|------|
| TBT | 18.0点 | **7.6点** | **-10.4点** (最大の改善) |
| CLS | 21.8点 | 18.9点 | -2.9点 |
| LCP | 25.0点 | 25.0点 | 0 |
| FCP | 9.8点 | 9.7点 | -0.1点 |
| SI | 9.7点 | 10.0点 | +0.3点 |

### バンドルサイズの変化

| チャンク | Before | After |
|---------|--------|-------|
| client (main) | 18.8 MB (gzip 12.5 MB) | **4,912 KB (gzip 2,715 KB)** |
| vendor-admin | 4.2 MB (gzip 790 KB) | **316 KB (gzip 106 KB)** |
| vendor-react | 168 KB (gzip 56 KB) | 168 KB (gzip 56 KB) |
| index (entry) | 87 KB (gzip 25 KB) | 87 KB (gzip 25 KB) |

※ Docker 環境でのビルドでは tree shaking がより効果的に動作し、lodash/moment/jQuery 以外の不要コードも除去された模様

## 考察

- **TBT の大幅改善が主因**: lodash (528 KB), moment-timezone (4.2 MB), jQuery (88 KB) の除去により、メインスレッドの JS パース・実行時間が大幅に短縮
- Docker ビルド環境ではローカルビルドと異なるバンドルサイズになった。おそらく NODE_ENV=production が正しく設定され、tree shaking が効いている
- CLS も若干改善（Phase 1 の Spacer 修正の効果が TBT 改善により顕在化した可能性）
- LCP は依然 0 点。バンドルサイズ削減だけでは解消できない — N+1 API 問題や SSR データ再利用が必要

## 次のステップ

残りの Phase 2 施策に進む：
- 施策 2: 画像プレースホルダー確保（CLS 改善）
- 施策 6: N+1 API 解消（LCP 改善）
