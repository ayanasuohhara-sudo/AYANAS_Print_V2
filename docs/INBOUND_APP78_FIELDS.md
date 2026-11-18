# App78 フォーム — エクスポート照合（06_入庫管理）

**App ID**: 78  
**最新ソース**: `06_入庫管理 (1).zip`（2026-10 再エクスポート）  
**配置**: `_tmp_app78_export/01/template.json`

---

## 照合結果: **設計コードと一致**

前回 ZIP で不一致だった4件は **すべて修正済み**。

| コード | ラベル |
|--------|--------|
| `inbound_batch_no` | 入庫番号 |
| `inbound_date` | 入庫日 |
| `inbound_operator` | ユーザー選択 |
| `inbound_status` | 入庫状態 |
| `barcode_input` | バーコード入力 |
| `line_count` | 読取件数 |
| `success_count` | 成功件数 |
| `error_count` | エラー件数 |
| `confirmed_at` | 確定日時 |
| `inbound_remarks` | 備考 |
| `message_space` / `action_space` | スペース（要素 ID 一致） |

### サブテーブル `inbound_lines`

| コード | ラベル |
|--------|--------|
| `manage_no` | 管理番号 |
| `inbound_route` | 入庫ルート |
| `line_result` | 処理結果 |
| `error_message` | エラー内容 |
| `order_record_id` | App16レコードID |
| `source_outbound_app` | 出庫元アプリ |
| `source_outbound_record_id` | 出庫元レコードID |
| `source_outbound_line_id` | 出庫元明細ID |
| `customer_code` | 顧客コード |
| `customer_name` | 顧客名 |
| `client_name` | お客様名 |
| `kimono_type` | 着物種類 |
| `kimono_spec` | 着物仕様 |
| `processing_summary` | 加工内容 |
| `outbound_date` | 出庫日 |
| `destination_code` | 出庫先コード |
| `destination_name` | 出庫先名 |
| `scheduled_inbound_date` | 入庫予定日 |
| `scanned_at` | 読取日時 |
| `applied_at` | 入庫反映日時 |

---

## kintone 上で手動確認（エクスポートに含まれない）

| フィールド | 選択肢 |
|-----------|--------|
| `inbound_status` | 下書き / **入庫確定** / 取消 |
| `inbound_route` | 国内外注 / 海外外注 / **和裁士** |
| `line_result` | 待機 / 確定成功 / エラー |
| `source_outbound_app` | 外注出庫 / 海外外注出庫 / **和裁士出庫** |

---

## 関連 App・前提

| App | ID | 備考 |
|-----|-----|------|
| 総合入庫 | **78** | 本アプリ |
| 受注明細 | 16 | |
| 外注出庫 | 27 | `outsource_detail.line_in_date` |
| 海外外注出庫 | 28 | |
| 和裁士出庫 | 74 | 検品は 74 のみ |

**JS**: 未登録 → 実装可（`INBOUND_UNIFIED_APP_SETUP.md` §7）

---

## 履歴

| エクスポート | 差分 |
|-------------|------|
| `06_入庫管理.zip` | `文字列__1行inbound_batch_no`, `ユーザー選択`, `source_outbound_ap`, `文字列__1行_` |
| **`06_入庫管理 (1).zip`** | **上記解消・設計どおり** |
