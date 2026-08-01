# AYANAS Print V2

AYANAS Print V2 は、kintone専用の帳票印刷プラグインです。

PrintCreatorに依存せず、AYANAS独自の帳票印刷システムとして開発します。

---

# 主な機能

## Version 1.0

- 受注票（A4横）
- Code39バーコード
- 印刷
- PDF保存
- 仕立／悉皆レイアウト自動切替

## Version 1.1

- 納品書
- 自動改ページ
- 明細30行以上対応

## Version 1.2

- 請求書
- 締日集計
- 複数納品書対応

## Version 2.0

- バーコードラベル
- インボイス
- 外注伝票
- 海外インボイス

---

# 開発環境

- kintone
- cli-kintone
- Node.js
- JavaScript (ES6)
- HTML5
- CSS3

---

# ディレクトリ構成

```
AYANAS_Print_V2
│
├── manifest.json
├── package.json
├── README.md
│
├── js
│   ├── desktop.js
│   ├── record.js
│   ├── template.js
│   ├── table.js
│   ├── format.js
│   ├── barcode.js
│   ├── printAction.js
│   └── print.js
│
├── html
│   ├── config.html
│   └── print.html
│
├── css
│   ├── desktop.css
│   └── print.css
│
├── image
│   ├── icon.png
│   └── logo.png
│
└── lib
    └── JsBarcode.all.min.js
```

---

# 開発方針

本プロジェクトはPrintCreatorの代替ではなく、

**AYANAS専用帳票システム**

として開発する。

受注票・納品書・請求書・インボイスなど全帳票を共通エンジンで管理する。

---

# ライセンス

Copyright © AYANAS

Private Project