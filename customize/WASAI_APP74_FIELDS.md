# App74（08_和裁士出庫）実フォーム — エクスポート照合

ソース: `08_和裁士出庫.zip`（2026-10 エクスポート）

## ヘッダー（JS が参照するコード）

| ラベル | フィールドコード | 備考 |
|--------|------------------|------|
| 出庫日 | **`日ship_date`** | 設計上の `ship_date` ではない（将来リネーム推奨） |
| 入庫予定日 | `return_date` | POST 時未入力なら出庫日をコピー |
| 和裁士コード | `wasai_code` | |
| 和裁士氏名 | `wasai_name` | |
| 伝票状態 | `outbound_status` | 選択肢: 下書き / **出庫確定** / 取消 |
| 出庫番号 | `outbound_no` | 空なら JS で `O-` + 連番 |

## 出庫明細 `wasai_outbound_lines`

| 注意 | コード |
|------|--------|
| 対象明細件数 | **`eligible_line_coun`**（`eligible_line_count` の誤記） |
| 着物仕様 | `kimono_spec`（選択肢: 袷, sample2 等） |
| `kimono_type` 列 | **フォームに無し** |

## 支払対象加工 `wasai_payment_item_snapshots`

| ラベル | 設計コード | **実コード** |
|--------|-----------|-------------|
| 管理番号 | manage_no | **`manage_no_0`** |
| 取引価格 | transaction_price | **`transaction_price_0`** |
| 支払率 | payment_rate | **`payment_rate_0`** |
| 行支払基準額 | line_base_payment_amount | 同一 |

JS は上記実コードに合わせて POST します。
