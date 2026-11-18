# App35 invoice_balance_desktop.js 1.1.3 本番反映報告

反映日時: 2026-11-18 15:03 JST（Asia/Tokyo）  
対象: App35（`10_請求書作成`）  
変更: `invoice_balance_desktop.js` **1.1.2 → 1.1.3**  
`payment_create.js` は **2.0.17 のまま未変更**

---

## 内容

個別請求作成（および一括）が「処理中...」のまま固着する不具合の修正。

- `BulkInvoiceCreate.run` 一時ラップが `InvoiceUtils.kintoneApi` のコールバック（success/fail）を転送するよう修正
- hang 時に `kintone.api` が戻らない二次障害も、run が settle することで解消

詳細原因: `docs/APP35_INDIVIDUAL_INVOICE_STUCK_INVESTIGATION.md`

---

## 実施結果

| 項目 | 結果 |
|---|---|
| バックアップ | `customize/backups/app35_balance_113_2026-11-18T06-03-59/` |
| customize revision | 41 → **42** |
| 読み込み順 | `app_nav_banner_config` → `app_nav_banner` → `payment_create` → `invoice_balance_desktop`（維持） |
| 本番 balance 版 | **1.1.3**（hasCallbacks あり） |
| 本番 payment 版 | 2.0.17 |
| hang 回帰 | `runIndividual` 存在しない顧客 → **約即時 rejected**（timeout なし） |
| `kintone.api` 復元 | **true**（run 後 native に復帰） |

証跡 JSON:  
`/opt/cursor/artifacts/app35_balance_113_prod_deploy_report.json`  
`customize/backups/app35_balance_113_2026-11-18T06-03-59/REPORT.json`

---

## 未実施（意図的）

- 実顧客での請求書新規作成（データ作成を伴う本番操作は今回の回帰確認では未実施）
- ロールバックはバックアップ `files/prod_invoice_balance_desktop.js`（1.1.2）で可能
