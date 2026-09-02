# AYANAS Print V3

kintone 帳票印刷専用プラグイン。

## 機能

- 受注票印刷
- 納品書印刷
- 請求書印刷
- 見積書印刷（テンプレート準備中）
- インボイス印刷（テンプレート準備中）

請求書作成・確定などの業務処理は **AYANAS Invoice**（`C:\CAYANAS_Invoice`）を使用してください。

## ビルド

**main のままパックすると version 66 の zip ができます。** 必ず次のブランチでパックしてください。

```bash
git fetch origin
git checkout cursor/matsuba-summary-invoice-3f3f
```

`manifest.json` の `"version"` が **68** であることを確認してから:

```bash
npm install
npm run pack
```

- `private.ppk` は **いま kintone に入っている version 66 と同じ鍵** を使う
- 別の鍵でパックすると別プラグインになり、元の Print は 66 のまま残る
- できた `plugin.zip` を kintone システム管理 → プラグイン → 読み込む

パック中に `パックするプラグイン version: 68` と出ない zip は読み込まないでください。

## アーキテクチャ

```
desktop.js → Record.get() → Layout.resolve() → Preview.open() → 印刷
```

## Version

68
