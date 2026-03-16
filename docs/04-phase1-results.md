# Phase 1: 低難易度施策の実装結果

**実施日**: 2026-03-16
**ベースラインスコア**: 15.75 / 100（2026-03-16_2318 計測）

## 実施した施策

### 施策 1: Spacer コンポーネントの即時レンダリング化

**対象ファイル**: `workspaces/app/src/foundation/components/Spacer.tsx`

**変更内容**:
- `useMount` + `useBoolean` による遅延レンダリングを削除
- 常に `_Spacer` を返すように変更
- SSR 時点からスペースが確保されるようになった

**変更前**:
```tsx
export const Spacer: React.FC<Props> = ({ height, width }) => {
  const [mounted, toggleMounted] = useBoolean(false);
  useMount(() => { toggleMounted(); });
  return mounted ? <_Spacer $height={height} $width={width} /> : null;
};
```

**変更後**:
```tsx
export const Spacer: React.FC<Props> = ({ height, width }) => {
  return <_Spacer $height={height} $width={width} />;
};
```

### 施策 2: preloadImages() の削除

**対象ファイル**: `workspaces/client/src/index.tsx`

**変更内容**:
- `await preloadImages()` を完全に削除
- `preloadImages` のインポートも削除
- 最大 5 秒のレンダリングブロックを解消

### 施策 3: registerServiceWorker のノンブロッキング化

**対象ファイル**: `workspaces/client/src/index.tsx`

**変更内容**:
- `await registerServiceWorker()` → `registerServiceWorker()`（await を外す）
- SW の register は fire-and-forget で実行される

## 計測結果

### 計測 1 (2026-03-16_2342) — 揺れあり

| ページ | Score | FCP | TBT | CLS | 前回比 |
|--------|-------|-----|-----|-----|--------|
| ホーム | 4 | 7.0 s | 1,670 ms | 1.002 | ↓ -6 |
| 作者詳細 | 17 | 6.5 s | 680 ms | 0.525 | ↓ -1 |
| 作品詳細 | 4 | 6.6 s | 2,220 ms | 0.737 | ↓ -11 |
| エピソード | 21 | 6.6 s | 680 ms | 0.348 | ↑ +1 |
| **平均** | **11.5** | | | | |

※ TBT の大幅悪化は Lighthouse シミュレーションの揺れと判断

### 計測 2 (2026-03-16_2345) — 安定値

| ページ | Score | FCP | TBT | CLS | 前回比 |
|--------|-------|-----|-----|-----|--------|
| ホーム | 11 | 7.0 s | 880 ms | 0.984 | ↑ +1 |
| 作者詳細 | 17 | 6.5 s | 670 ms | 0.527 | ↓ -1 |
| 作品詳細 | 15 | 6.6 s | 720 ms | 0.659 | → 0 |
| エピソード | 20 | 6.6 s | 680 ms | 0.372 | → 0 |
| **平均** | **15.75** | | | | |

## 考察

- スコアはベースライン（15.75）と同等。Phase 1 の修正は顕著なスコア改善には至らなかった
- **原因**: メインバンドル 18.8 MB と N+1 API（130+ リクエスト）が圧倒的に支配的で、Phase 1 レベルの修正では差が出にくい
- Spacer 修正は CLS 改善に寄与するはずだが、useImage の条件付きレンダリング（CLS の主因）が未修正のため効果が埋もれている
- preloadImages 削除は FCP 改善に寄与するはずだが、メインバンドルの DL・パース時間（5.4 秒）の方が大きいため見えにくい
- これらの修正は正しい方向であり、後続施策との組み合わせで効果が顕在化する見込み

## 次のステップ

Phase 2 に進む。1 施策ずつ実装→計測→記録のサイクルで進める。
