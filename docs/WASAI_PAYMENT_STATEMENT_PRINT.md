# 和裁士支払明細書（App 75）印刷

## 実フィールドコード（`wasai_payment_create.js` の POST 定義＝App75 実装根拠）

### ヘッダー

| 表示項目 | フィールドコード | 備考 |
|----------|------------------|------|
| 和裁士氏名 | `wasai_name` | |
| 対象期間 From | `period_fro` または `period_from` | 実機 **`period_fro` 誤記** あり（候補両方） |
| 対象期間 To | `period_to` | |
| 入庫月（参考） | `inbound_period_ym` | From/To が空のとき表示に使用可 |
| 支払予定日 | `payment_due_date` | |
| 支払合計 | `payment_total` | 明細 `line_payment_amount` 合計と照合 |

### サブテーブル `payment_statement_lines`

| 帳票列 | フィールドコード | 作成時に書き込み |
|--------|------------------|------------------|
| 管理番号 | `manage_no` | ○ |
| 入庫日 | `inbound_date` | ○ |
| 着物種類 | `kimono_type` | ○ |
| 着物仕様 | **`kimono_spec`** | **×（作成ロジック未 POST）** |
| 加工内容 | `processing_summary` | ○（App74 行からコピー） |
| 取引価格 | `transaction_price` | ○ |
| 支払率 | `payment_rate` | ○ |
| 基本支払額 | `base_payment_amount` | ○ |
| 支払金額 | `line_payment_amount` | ○（保存値をそのまま印刷） |

**帳票に出さない（作成時に入るが印刷除外）**: `customer_name`, `client_name`, `outbound_record_id`, `outbound_line_id`, `adjustment_amount`, `eligible_line_count` 等

### 不足・未連携（フォーム追加は別タスク）

| 項目 | 状態 |
|------|------|
| `kimono_spec` | App75 明細にフィールドがあっても **支払明細作成 JS は未コピー** → 印刷はフィールドがレコードにあれば表示、なければ空 |
| `item_name` | **payment_statement_lines には無し** → 加工内容は **`processing_summary`** を使用 |

## プラグイン

- 帳票種別: `wasai_payment_statement`
- テンプレート: `js/templates/estimate.js`（`WasaiPaymentStatementTemplate`）
- App **75** 詳細 → **支払明細書 印刷**（AYANAS Print v127+）
- A4 **縦**、複数ページ、合計は最終ページのみ
- 2ページ目以降ヘッダー: 和裁士氏名・対象期間・ページ番号のみ

## 金額

- 支払金額列 = **`line_payment_amount` のみ**（再計算しない）
- ヘッダー `payment_total` ≠ 明細合計のとき **エラー**（自動補正しない）
