# AYANAS Print 帳票 SDK ガイド

Version 2.0 / V3.0 準備

新しい帳票を **10 分以内** に追加するための手順書です。

---

## 目次

1. [新しい帳票追加方法](#1-新しい帳票追加方法)
2. [report_registry 登録方法](#2-report_registry-登録方法)
3. [Definition 作成方法](#3-definition-作成方法)
4. [Template 作成方法](#4-template-作成方法)
5. [Record 作成方法](#5-record-作成方法)
6. [Preview 起動方法](#6-preview-起動方法)
7. [Barcode 利用方法](#7-barcode-利用方法)
8. [Config 利用方法](#8-config-利用方法)

---

## 1. 新しい帳票追加方法

### 全体フロー

```
kintone レコード
  ↓ Record.getXxxData()
帳票データ { header, details, summary }
  ↓ Preview.open(data)
Layout.resolve() → ReportRegistry.get(reportType) + Definition
  ↓ layout.template.render(data, config, layout)
HTML 文字列
  ↓ 別ウィンドウ表示 + Barcode.draw()
印刷プレビュー
```

### 追加チェックリスト（10 分）

| # | 作業 | ファイル |
|---|------|----------|
| 1 | 雛形をコピー | `js/templates/template_base.js` → `xxx_template.js` |
| 2 | Definition 作成 | `js/reports/xxx_definition.js` |
| 3 | Record 追加 | `js/record.js` に `getXxxData()` |
| 4 | Registry 登録 | `js/report_registry.js` に `register()` |
| 5 | Layout 紐付け | `js/layout.js` の `REPORT_DEFINITIONS` |
| 6 | manifest 追加 | `manifest.json` の JS 読み込み順 |
| 7 | CSS（任意） | `css/print.css` に `.report-xxx` |

**修正不要なファイル:** `preview.js` / `desktop.js` / `barcode.js`

---

## 2. report_registry 登録方法

`js/report_registry.js` に `ReportRegistry.register()` を 1 件追加します。

```javascript
ReportRegistry.register({
    reportType: 'invoice',          // 帳票種別 ID（一意）
    title: '請求書',                 // 表示名（buttonLabel 省略時に使用）
    template: InvoiceTemplate,      // テンプレートモジュール
    pageClass: 'report-invoice',    // CSS クラス（Definition と合わせる）
    barcodeField: 'manage_no',      // バーコード対象フィールド
    paperSize: 'A4',
    orientation: 'portrait',
    buttonLabel: '請求書印刷',       // 任意: ボタンラベル
    appIds: [99],                   // 任意: 対象 kintone アプリ ID
    default: false,                 // 任意: フォールバック帳票（1 件のみ）
    configDefaults: {               // 任意: 帳票固有の設定上書き
        barcode_type: 'CODE39',
        barcode_visible: '1',
    },
});
```

### ルーティング規則

| 条件 | 選ばれる帳票 |
|------|-------------|
| `appIds` に現在のアプリ ID が含まれる | 該当帳票 |
| 上記に該当なし | `default: true` の帳票 |

### API

```javascript
ReportRegistry.register(definition)       // 帳票登録
ReportRegistry.get(reportType)            // 帳票定義取得
ReportRegistry.resolveReportType(appId)   // アプリ ID → reportType
```

---

## 3. Definition 作成方法

`js/reports/xxx_definition.js` に帳票固有の設定を集約します。  
**テンプレートに固定値を書かない** — ラベル・列・用紙はすべて Definition で管理します。

### 最小構成

```javascript
(() => {
    'use strict';

    const InvoiceDefinition = {
        title: '請求書',
        paper: 'A4',
        orientation: 'portrait',
        barcodeField: 'manage_no',
        pageClass: 'report-invoice',
        columns: [
            { field: 'manage_no', title: '管理番号', width: 80 },
            { field: 'client_name', title: 'お客様名', width: 140 },
        ],
    };

    window.InvoiceDefinition = InvoiceDefinition;
})();
```

### プロパティ一覧

| プロパティ | 必須 | 説明 |
|-----------|------|------|
| `title` | ✅ | 帳票タイトル |
| `paper` | ✅ | 用紙サイズ（`A4` / `A5`） |
| `orientation` | ✅ | 印刷方向（`landscape` / `portrait`） |
| `barcodeField` | ✅ | バーコード対象（`manage_no` → 内部で `header.manage_no` に変換） |
| `pageClass` | ✅ | body タグ CSS クラス |
| `header` | — | ヘッダー行定義 |
| `columns` | — | 明細列定義 |
| `detailTable` | — | 明細テーブル設定 |
| `summary` | — | 集計行定義 |
| `company` | — | 会社情報（納品書など） |

### 列定義（columns）

```javascript
{
    field: 'item_name',     // データフィールド名
    title: '商品名',         // 列ヘッダー
    width: 140,             // 列幅（px）
    format: 'money',        // 任意: date / money
    source: 'header',       // 任意: header / detail（デフォルト detail）
    className: 'num',       // 任意: CSS クラス
    colspan: 2,             // 任意: 列結合
}
```

### Layout への紐付け

`js/layout.js` の `REPORT_DEFINITIONS` に追加:

```javascript
const REPORT_DEFINITIONS = {
    order: OrderDefinition,
    delivery: DeliveryDefinition,
    invoice: InvoiceDefinition,   // ← 追加
};
```

---

## 4. Template 作成方法

### 雛形のコピー

```bash
cp js/templates/template_base.js js/templates/invoice_template.js
```

### 共通インターフェース

全テンプレートは以下を満たす必要があります。

```javascript
render(data, config, layout) → HTML 文字列
```

`TemplateInterface.create()` を使うと自動検証されます。

### 禁止事項

| 禁止 | 理由 |
|------|------|
| DOM 操作 | Template は HTML 文字列のみ返す |
| `window.print()` | 印刷は Preview 側が担当 |
| `Barcode.draw()` | バーコード描画は Preview 側が担当 |
| 固定ラベル・列名 | Definition から読み取る |

### 雛形の構造

```
template_base.js
├── getDefinition(layout)   … layout.definition を取得
├── buildHeader()           … ヘッダー HTML 生成
├── buildDetail()           … 明細 HTML 生成
├── buildSummary()          … 集計 HTML 生成
└── render()                … 上記を組み合わせて HTML 返却
```

### 実装例（render 部分）

```javascript
const InvoiceTemplate = TemplateInterface.create('InvoiceTemplate', (data, config, layout) => {
    Common.assertFormatLoaded();
    Validation.assertDetailReportData(data);

    const definition = getDefinition(layout);
    const { header, details, summary } = data;
    const reportTitle = Common.getTitle(layout, config, definition.title);

    return Common.buildDocumentHtml({
        title: reportTitle,
        bodyClass: Common.getBodyClass(layout),
        content: `
    <h1>${Common.esc(reportTitle)}</h1>
    ${buildHeader(definition, header, config)}
    ${buildDetail(definition, details, header)}
    ${buildSummary(definition, summary)}`,
    });
});

window.InvoiceTemplate = InvoiceTemplate;
```

### バーコード SVG の埋め込み

HTML 内に `<svg id="barcode">` を置くだけ。描画は Preview が行います。

```javascript
const barcodeHtml = definition.header?.showBarcode
    ? '<svg id="barcode" class="barcode"></svg>'
    : '';
```

---

## 5. Record 作成方法

`js/record.js` に帳票専用のデータ取得関数を追加します。

### データ形式

```javascript
{
    header: {
        manage_no: '...',
        order_date: '...',
        // ...
    },
    details: [
        { rowNo: 1, item_code: '...', item_name: '...', unit_price: 100, qty: 1, amount: 100 },
    ],
    summary: {
        count: 1,
        totalCount: 1,
        totalQty: 1,
        totalAmount: 100,
    },
}
```

### 追加例

```javascript
Record.getInvoiceData = () => {
    try {
        return buildStandardReportData(getCurrentRecord());
    } catch (error) {
        wrapRecordError(error, 'Record.getInvoiceData');
    }
};
```

### Record.get() へのルーティング追加

```javascript
Record.get = () => {
    const appId = kintone.app.getId();
    if (appId === DELIVERY_APP_ID) return Record.getDeliveryData();
    if (appId === INVOICE_APP_ID)  return Record.getInvoiceData();  // ← 追加
    return Record.getOrderData();
};
```

### 制約

- HTML 生成禁止
- DOM 操作禁止
- `Format.js` 利用禁止（生データを返す）

---

## 6. Preview 起動方法

### 自動起動（desktop.js）

レコード詳細画面の印刷ボタンから自動実行されます。**修正不要**。

```javascript
const data = Record.get();
Preview.open(data);
```

### Preview.open() の内部処理

```
1. loadPluginConfig()          … プラグイン設定読込
2. Layout.resolve(data, config) … 帳票種別・テンプレート決定
3. layout.template.render()    … HTML 生成（帳票種別判定なし）
4. window.open()               … 別ウィンドウ表示
5. Barcode.draw()              … バーコード描画
```

### Layout.resolve() 戻り値

```javascript
{
    reportType,      // 帳票種別
    title,           // タイトル
    template,        // テンプレートモジュール
    pageClass,       // CSS クラス
    barcodeField,    // バーコードフィールドパス
    paperSize,       // 用紙サイズ
    orientation,     // 印刷方向
    definition,      // 帳票定義オブジェクト
    company,         // 会社情報（任意）
    configDefaults,  // 設定上書き（任意）
}
```

### 手動起動（デバッグ用）

```javascript
Preview.initialize(pluginBaseUrl);
Preview.open(Record.getInvoiceData());
```

---

## 7. Barcode 利用方法

### 役割分担

| モジュール | 担当 |
|-----------|------|
| Template | `<svg id="barcode">` を HTML に埋め込む |
| Preview | バーコード値を取得し `Barcode.draw()` を呼ぶ |
| Barcode | SVG 要素へ JsBarcode で描画 |

### Template 側（HTML 埋め込み）

```html
<svg id="barcode" class="barcode"></svg>
```

### Preview 側（自動処理）

```javascript
const barcodeValue = Common.getValueByPath(data, layout.barcodeField);
Barcode.draw(svgElement, barcodeValue, config);
```

### バーコード種類

`config.barcode_type` で切り替え（Config 画面で設定）:

| 値 | 形式 |
|----|------|
| `CODE39` | Code 39（デフォルト） |
| `CODE128` | Code 128 |
| `EAN13` | EAN-13 |

### 表示 ON/OFF

`config.barcode_visible` が `'0'` の場合、Template 側で SVG を出力しなければ非表示になります。

```javascript
Common.isBarcodeVisible(config)  // true / false
```

### 帳票固有のデフォルト

Registry の `configDefaults` で上書き可能:

```javascript
configDefaults: {
    barcode_type: 'CODE39',
    barcode_visible: '1',
}
```

---

## 8. Config 利用方法

### 設定項目

| キー | 説明 | 値 |
|------|------|-----|
| `report_title` | 帳票タイトル | 任意文字列 |
| `barcode_type` | バーコード種類 | `CODE39` / `CODE128` |
| `barcode_visible` | バーコード表示 | `1`（表示）/ `0`（非表示） |
| `print_orientation` | 印刷方向 | `landscape` / `portrait` |
| `paper_size` | 用紙サイズ | `A4` / `A5` |

### Template での参照

```javascript
Template.render(data, config, layout)
//                    ^^^^^^ プラグイン設定
```

### 優先順位（Preview 内部）

```
Definition（paper / orientation / title）
  ↓ 上書き
プラグイン Config（paper_size / print_orientation / report_title）
  ↓ 上書き
Registry configDefaults（帳票固有デフォルト）
```

### Template で Config を使う例

```javascript
// タイトル: layout → config → definition の順で解決
const title = Common.getTitle(layout, config, definition.title);

// バーコード表示判定
if (Common.isBarcodeVisible(config)) { /* SVG 出力 */ }

// 日付・金額フォーマット（Format.js は Template のみ使用可）
Format.formatDate(header.order_date)
Format.formatMoney(detail.amount)
```

### 設定画面

`html/config.html` + `js/config.js` で管理。  
新帳票追加時に Config 項目を増やす必要は **ありません**（Definition + Registry で足りる場合）。

---

## 付録: manifest.json 読み込み順

```json
[
  "lib/JsBarcode.all.min.js",
  "js/format.js",
  "js/utils/validation.js",
  "js/utils/common.js",
  "js/utils/dom.js",
  "js/record.js",
  "js/reports/order_definition.js",
  "js/reports/xxx_definition.js",
  "js/templates/template_interface.js",
  "js/templates/xxx_template.js",
  "js/report_registry.js",
  "js/layout.js",
  "js/barcode.js",
  "js/preview.js",
  "js/desktop.js"
]
```

**ルール:** Definition → Template → Registry → Layout の順で読み込む。

---

## 付録: 帳票追加 完全例（請求書）

### 1. Definition

`js/reports/invoice_definition.js`

### 2. Template

`js/templates/template_base.js` をコピー → `invoice_template.js`

### 3. Record

`Record.getInvoiceData()` を `record.js` に追加

### 4. Registry

```javascript
ReportRegistry.register({
    reportType: 'invoice',
    title: '請求書',
    template: InvoiceTemplate,
    pageClass: 'report-invoice',
    barcodeField: 'manage_no',
    paperSize: 'A4',
    orientation: 'portrait',
    buttonLabel: '請求書印刷',
    appIds: [99],
});
```

### 5. Layout

```javascript
invoice: InvoiceDefinition,
```

### 6. manifest.json

Definition と Template の JS を追加

---

*AYANAS Print V2.0 — 帳票 SDK*
