# AYANAS 基幹システム Version 1.0 — JavaScript モジュール一覧

プラグイン **AYANAS Print V2**（`manifest.json`）の JavaScript 構成。

---

## 読み込み順序

`manifest.json` の `desktop.js` 配列順に依存関係を解決して読み込む。

---

## コア・ユーティリティ

| ファイル | 対象アプリ | 役割 |
|----------|-----------|------|
| `lib/JsBarcode.all.min.js` | 共通 | Code39 バーコードライブラリ |
| `js/format.js` | 共通 | 日付・金額フォーマット |
| `js/utils/validation.js` | 共通 | モジュール存在チェック |
| `js/utils/common.js` | 共通 | 共通ユーティリティ |
| `js/utils/dom.js` | 共通 | DOM・印刷 HTML 生成 |
| `js/record.js` | 16, 19 | kintone レコード → 帳票データ変換 |
| `js/layout.js` | 共通 | 帳票ボタンラベル等 |
| `js/barcode.js` | 共通 | バーコード描画 |
| `js/preview.js` | 共通 | 印刷プレビュー表示 |
| `js/config.js` | プラグイン設定 | プラグイン設定画面 |

---

## 帳票（印刷）

| ファイル | 対象アプリ | 役割 |
|----------|-----------|------|
| `js/reports/order_definition.js` | 16 | 受注票レイアウト定義 |
| `js/reports/delivery_definition.js` | 19 | 納品書レイアウト定義 |
| `js/templates/template_interface.js` | 共通 | テンプレート基底 |
| `js/templates/order_template.js` | 16 | 受注票 HTML 生成 |
| `js/templates/delivery_template.js` | 19 | 納品書 HTML 生成 |
| `js/templates/invoice_template.js` | 35 | 請求書テンプレート（予定） |
| `js/templates/estimate_template.js` | — | 見積テンプレート |
| `js/templates/invoice_export_template.js` | — | インボイス出力 |
| `js/templates/purchase_template.js` | — | 仕入テンプレート |
| `js/templates/label_template.js` | — | ラベルテンプレート |
| `js/report_registry.js` | 16, 19 | 帳票種別レジストリ |
| `js/desktop.js` | 16, 19 等 | 印刷ボタン配置・Preview 起動 |

---

## 請求書作成（App 35）

| ファイル | 対象アプリ | 役割 |
|----------|-----------|------|
| `js/invoice_create.js` | 35, 19, 17 | 請求コア（取込・集計・確定・取消・採番・支払期限） |
| `js/invoice_permission.js` | 35 | kintone アクセス権チェック |
| `js/batch_history.js` | 38 | 請求締め実行履歴 CRUD |
| `js/bulk_invoice_create.js` | 35 | 請求書一括作成ロジック |
| `js/invoice_index.js` | 35 | 請求一覧 UI（集計・絞込・色分け） |
| `js/invoice_desktop.js` | 35 | 画面イベント（取込・作成・確定・取消・保存） |
| `js/bulk_invoice_create_desktop.js` | 35 | 一括作成ボタン・ダイアログ |
| `js/batch_history_index.js` | 35 | 締め実行履歴一覧表示 |

---

## 入金管理（App 36）

| ファイル | 対象アプリ | 役割 |
|----------|-----------|------|
| `js/payment_create.js` | 36, 35 | 入金ロジック・請求書同期 |
| `js/payment_desktop.js` | 36 | 画面イベント（請求番号連携・保存） |

---

## 売掛一覧（App 37）

| ファイル | 対象アプリ | 役割 |
|----------|-----------|------|
| `js/receivable_create.js` | 37, 35, 36 | 売掛データ取得・集計 |
| `js/receivable_index.js` | 37 | 読取専用一覧 UI |

---

## CSS

| ファイル | 対象 | 役割 |
|----------|------|------|
| `css/print.css` | 帳票 | 印刷スタイル |
| `css/invoice_index.css` | 35 | 請求一覧・一括作成・履歴 |
| `css/receivable_index.css` | 37 | 売掛一覧スタイル |

---

## モジュール依存関係

```
invoice_desktop.js
  ├── InvoiceCreate（invoice_create.js）
  └── InvoicePermission（invoice_permission.js）

bulk_invoice_create.js
  ├── InvoiceCreate
  └── BatchHistory（batch_history.js）

payment_desktop.js
  └── PaymentCreate（payment_create.js）
        └── InvoiceCreate

receivable_index.js
  └── ReceivableCreate（receivable_create.js）
        ├── InvoiceCreate
        └── PaymentCreate

desktop.js
  ├── Record
  ├── Preview
  └── ReportRegistry
```

---

## グローバル公開オブジェクト

| オブジェクト | 定義ファイル |
|-------------|-------------|
| `InvoiceCreate` | invoice_create.js |
| `InvoicePermission` | invoice_permission.js |
| `BulkInvoiceCreate` | bulk_invoice_create.js |
| `BatchHistory` | batch_history.js |
| `PaymentCreate` | payment_create.js |
| `ReceivableCreate` | receivable_create.js |
| `Record` | record.js |
| `Preview` | preview.js |
| `ReportRegistry` | report_registry.js |

---

## 関連ドキュメント（個別アプリ）

| ファイル | 内容 |
|----------|------|
| `docs/INVOICE_APP.md` | 請求書アプリ詳細 |
| `docs/PAYMENT_APP.md` | 入金管理詳細 |
| `docs/RECEIVABLE_APP.md` | 売掛一覧詳細 |
| `docs/TEMPLATE_GUIDE.md` | 帳票テンプレート開発ガイド |

---

*最終更新: AYANAS 基幹システム Version 1.0*
