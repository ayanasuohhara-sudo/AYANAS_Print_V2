# App19 税抜合計が数量を掛けない不具合

調査・修正: 2026-11-27（Asia/Tokyo）  
対象例: 納品番号 **N20261126-735**

---

## 症状

納品書の **税抜合計（`subtotal`）** が明細の **単価合計** になっており、**数量×単価（金額）** になっていなかった。

---

## 根本原因

App19 フォーム CALC:

| フィールド | 誤 | 正 |
|---|---|---|
| `subtotal` | `SUM(unit_price)` | **`SUM(amount)`** |
| `amount` | `unit_price * qty` | 維持 |

---

## 請求書（App35）

`InvoiceCalc.calculateSummary` は `Σ amount`。App35 ヘッダは NUMBER。**修正不要。**

---

## ステータス

- [x] 原因特定・本番 CALC 修正（revision 286）
- [x] N20261126-735 再計算（5510→8300）
- [x] 直近500件の qty>1 不一致を再計算
- [x] 請求プラグイン確認（amount 基準）

詳細: `docs/APP19_SUBTOTAL_SUM_AMOUNT_PROD_FIX.md`
