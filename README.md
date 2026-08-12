# AYANAS Print V2

## 概要

- kintone帳票印刷プラグイン
- 受注票印刷
- Code39バーコード対応

## ディレクトリ構成

```
CAYANAS_PRINT_V2/
├── manifest.json
├── package.json
├── private.ppk
├── README.md
├── css/
│   └── print.css
├── html/
│   └── config.html
├── image/
│   └── icon.png
├── js/
│   ├── format.js
│   ├── record.js
│   ├── template.js
│   ├── barcode.js
│   ├── preview.js
│   ├── desktop.js
│   └── config.js
└── lib/
    └── JsBarcode.all.min.js
```

## 使用方法

1. `npm install`
2. `npm run pack`
3. 生成された `plugin.zip` を kintone へアップロード

## アーキテクチャ

```
desktop.js
↓
Record.get()
↓
Template.render()
↓
Preview.open()
↓
Barcode.draw()
```

## Version

v1.0.0
