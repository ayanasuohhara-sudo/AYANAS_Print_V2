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

```bash
npm install
npm run pack
```

## アーキテクチャ

```
desktop.js → Record.get() → Layout.resolve() → Preview.open() → 印刷
```

## Version

68
