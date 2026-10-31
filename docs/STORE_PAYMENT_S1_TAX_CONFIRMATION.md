# 店舗入金 S1 — 税計算確認依頼（アプリ作成前）

- **作成**: 2026-11-01（Asia/Tokyo）
- **理由**: 実装指示により、税計算が未確定の場合は **S1 アプリ作成前に確認** する

---

## 調査結果

| ソース | 内容 |
|--------|------|
| App16 | `amount = unit_price * qty`（**税抜**）。税フィールドなし |
| App19 | `tax = subtotal * 0.1`, `total = subtotal + tax`（CALC。端数関数なし） |
| 印刷プラグイン `js/core.js` | `calcTaxFromSubtotal`: **`Math.round(subtotal * 0.1)`** |
| 納品テンプレ `js/templates/delivery.js` | 同様に **`Math.round(subtotal * 0.10)`** |
| スマレジ | 税率は店舗設定。**税丸めは店舗ごとに** 四捨五入 / 切り捨て / 切り上げ（API: `taxRounding` 0/1/2） |

→ 社内 kintone 印刷は **受注（小計）単位・税率10%・四捨五入** で統一。  
→ スマレジ実機の丸め設定は本リポジトリからは確認できない。

---

## 採用したい暫定仕様（ご確認ください）

```text
税抜合計 ex = Σ App16.detail_table.amount（受注単位）
消費税   tax = Math.round(ex * 0.10)   // 四捨五入・円
税込合計 in  = ex + tax
```

- 入金・残額・充当の正は **税込 `in`**
- 一部入金での引き取りは原則禁止（管理者の「未収入金引き渡し承認」のみ例外）
- 返金は **マイナス金額の別レコード** + `related_refund_of`
- スマレジと 1 円差が出た場合は `pos_transaction_id` とメモで突合し、必要なら後続で `pos_gross_amount` を追加

`TAX_ROUNDING` は `store_payment_config.js` で `round` / `floor` / `ceil` 切替可能にしてあります。

---

## お願い（返信で指定）

1. 上記 **四捨五入（印刷プラグイン同型）** で S1 アプリ作成に進めてよいか  
2. 違う場合: **切り捨て / 切り上げ** のどちらにするか（スマレジ管理画面「設定 → 税率 → 税丸め」）  
3. 税計算の単位: **受注合計に対して 1 回**でよいか（明細ごと税計算はしない）

ご承認後に:

1. kintone に「店舗入金管理」アプリを作成  
2. `STORE_PAYMENT_APP_ID` を設定  
3. （本番 JS 反映は **別途承認後**）

---

## 既にリポジトリへ入れたもの（アプリ未作成）

| ファイル | 内容 |
|----------|------|
| `customize/store_payment_config.js` | 定数・税設定 |
| `customize/store_payment_engine.js` | 税込・残額・バリデーション |
| `customize/store_payment_numbering.js` | 入金番号採番 |
| `customize/store_payment_desktop.js` | S1 画面ガード |
| `customize/store_payment.css` | 样式 |
| `scripts/test_store_payment_s1.js` | 単体テスト |
| `docs/STORE_PAYMENT_S1_FIELDS.json` | フィールド定義案 |
