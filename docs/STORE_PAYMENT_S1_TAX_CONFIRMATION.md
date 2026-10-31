# 店舗入金 S1 — 税計算仕様（確定）

- **確定**: 2026-11-01（Asia/Tokyo）
- **S1 App ID**: **97**（店舗入金管理）

---

## 確定仕様

```text
税抜合計 ex = Σ App16.detail_table.amount（受注単位）
消費税   tax = Math.round(ex * 0.10)   // 四捨五入・円
税込合計 in  = ex + tax
```

| 項目 | 値 |
|------|-----|
| 税率 | 10%（`TAX_RATE = 0.1`） |
| 端数 | `Math.round`（`TAX_ROUNDING = 'round'`） |
| 計算単位 | **受注合計に対して 1 回**（明細ごと税計算はしない） |
| 入金・残額の正 | **税込 `in`** |
| 設定箇所 | `customize/store_payment_config.js` |

根拠: 印刷プラグイン `js/core.js` `calcTaxFromSubtotal` および納品テンプレ `js/templates/delivery.js` と同型。社内帳票との 1 円差を避ける。

---

## 調査結果（参照）

| ソース | 内容 |
|--------|------|
| App16 | `amount = unit_price * qty`（**税抜**）。税フィールドなし |
| App19 | `tax = subtotal * 0.1`, `total = subtotal + tax`（CALC。端数関数なし） |
| 印刷プラグイン `js/core.js` | `calcTaxFromSubtotal`: **`Math.round(subtotal * 0.1)`** |
| 納品テンプレ `js/templates/delivery.js` | 同様に **`Math.round(subtotal * 0.10)`** |
| スマレジ | 税率は店舗設定。**税丸めは店舗ごとに** 四捨五入 / 切り捨て / 切り上げ（API: `taxRounding` 0/1/2） |

---

## スマレジ突合（未解決・運用前確認）

本リポジトリからはスマレジ実機の `taxRounding` を読めない。

- S1 内部・印刷帳票は **四捨五入で固定**
- 店舗 POS が切り捨て/切り上げの場合は 1 円差が発生し得る
- 差分は `pos_transaction_id` とメモで突合。必要なら `TAX_ROUNDING` を `floor` / `ceil` に変更
- 本番運用開始前にスマレジ管理画面「設定 → 税率 → 税丸め」を目視確認すること

---

## 関連ポリシー（確定済み）

- 一部入金での引き取りは原則禁止（管理者の「未収入金引き渡し承認」のみ例外）
- 返金は **マイナス金額の別レコード** + `related_refund_of`
- 取消は履歴残置（物理削除しない）
