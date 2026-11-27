# App19 税抜合計 SUM(amount) 本番修正報告

反映日時: 2026-11-27 16:13 JST（Asia/Tokyo）  
対象: App19 納品書作成

---

## 変更内容

| フィールド | 変更前 | 変更後 |
|---|---|---|
| `subtotal`（税抜合計） | `SUM(unit_price)` | **`SUM(amount)`** |
| `delivery_detail.amount` | `unit_price * qty` | 変更なし |
| `tax` / `total_amount` | `subtotal*0.1` / `subtotal+tax` | 変更なし（追随） |

customize revision: **286**

---

## 報告例 N20261126-735

| | 税抜合計 | 消費税 | 税込合計 |
|---|---:|---:|---:|
| 修正前（単価合計） | 5,510 | 551 | 6,061 |
| 修正後（金額合計） | **8,300** | **830** | **9,130** |

明細: qty10×160 + qty10×150 + 3000 + 2200 = 8,300

---

## 請求書作成（App35）

- `subtotal` は **NUMBER**（プラグイン書込）。CALC バグなし
- `invoice_detail.amount` = `unit_price*qty`（CALC）で正しい
- `InvoiceCalc.calculateSummary` = **`Σ detail.amount`**（プラグイン content 9302 確認済）
- 合成テスト: amount 1600+1500 → subtotal **3100**（単価合計 310 ではない）

→ **請求作成ロジックの修正は不要**

---

## 既存データ再計算（直近500件スキャン）

`qty>1` かつ `subtotal ≠ Σ amount` だったレコードを touch 再計算:

| 納品番号 | 状態 | 修正前 → 後 |
|---|---|---|
| N20261126-735 | 未請求 | 5510 → **8300** |
| N20261030-635 | 請求済 | 107800 → **109500** |
| N20261027-619 | 請求済 | 22800 → **24300** |
| N20261020-585 | 請求済 | 43150 → **43450** |
| N20260909-433 | 請求済 | 13630 → **13890** |

請求済の請求書レコード自体は未変更（作成時は明細 amount 基準のため、通常は請求額は正しい）。

---

## 証跡

- `customize/backups/app19_subtotal_fix_2026-11-27T07-13-51/`
- スクリプト: `scripts/_app19_subtotal_sum_amount_fix.js`
