# App78 — 06_入庫管理（総合入庫）

**環境 URL**: `https://o5nppg7kb4ly.cybozu.com/k/78/`  
**App ID**: **78**（確定）  
**JS**: `customize/inbound_unified_*.js` + `wasai_config.js`（下記登録順）

設計詳細: [INBOUND_UNIFIED_APP_SETUP.md](./INBOUND_UNIFIED_APP_SETUP.md) / [INBOUND_UNIFIED_APP_FORM.md](./INBOUND_UNIFIED_APP_FORM.md)

---

## フォーム照合チェックリスト

kintone **設定 → フォーム** でフィールドコードが **完全一致** していること。

### ヘッダー（必須）

| フィールド名 | コード | 種類 | 必須 | 選択肢 |
|-------------|--------|------|------|--------|
| 入庫番号 | `inbound_batch_no` | 文字列1行 | 任意 | — |
| 入庫日 | `inbound_date` | 日付 | **必須** | 初期値: 当日推奨 |
| 入庫担当者 | `inbound_operator` | ユーザー選択 | 任意 | 初期値: 作成者 |
| 入庫状態 | `inbound_status` | ドロップダウン | **必須** | **下書き / 入庫確定 / 取消** |
| バーコード入力 | `barcode_input` | 文字列1行 | 任意 | — |
| 読取件数 | `line_count` | 数値 | 任意 | 0 |
| 成功件数 | `success_count` | 数値 | 任意 | 0 |
| エラー件数 | `error_count` | 数値 | 任意 | 0 |
| 確定日時 | `confirmed_at` | 日時 | 任意 | — |
| 備考 | `inbound_remarks` | 文字列複数行 | 任意 | — |
| メッセージ | `message_space` | **スペース** | — | **要素 ID = `message_space`** |
| 操作 | `action_space` | **スペース** | — | **要素 ID = `action_space`** |

### サブテーブル `inbound_lines`（必須）

| フィールド名 | コード | 種類 | 必須 | 選択肢 |
|-------------|--------|------|------|--------|
| 管理番号 | `manage_no` | 文字列1行 | **必須** | — |
| 入庫ルート | `inbound_route` | ドロップダウン | **必須** | **国内外注 / 海外外注 / 和裁士** |
| 処理結果 | `line_result` | ドロップダウン | **必須** | **待機 / 確定成功 / エラー** |
| エラー内容 | `error_message` | 文字列1行 | 任意 | — |
| App16レコードID | `order_record_id` | 文字列1行 | 任意 | — |
| 出庫元アプリ | `source_outbound_app` | ドロップダウン | 任意 | **外注出庫 / 海外外注出庫 / 和裁士出庫**（表示名＝保存値） |
| 出庫元レコードID | `source_outbound_record_id` | 文字列1行 | 任意 | — |
| 出庫元明細ID | `source_outbound_line_id` | 文字列1行 | 任意 | — |
| 顧客コード | `customer_code` | 文字列1行 | 任意 | — |
| 顧客名 | `customer_name` | 文字列1行 | 任意 | — |
| お客様名 | `client_name` | 文字列1行 | 任意 | — |
| 着物種類 | `kimono_type` | 文字列1行 | 任意 | — |
| 仕様 | `kimono_spec` | 文字列1行 | 任意 | — |
| 加工内容 | `processing_summary` | 文字列複数行 | 任意 | — |
| 出庫日 | `outbound_date` | 日付 | 任意 | — |
| 出庫先コード | `destination_code` | 文字列1行 | 任意 | — |
| 出庫先名 | `destination_name` | 文字列1行 | 任意 | — |
| 入庫予定日 | `scheduled_inbound_date` | 日付 | 任意 | — |
| 読取日時 | `scanned_at` | 日時 | 任意 | — |
| 入庫反映日時 | `applied_at` | 日時 | 任意 | — |

### 任意（SETUP 拡張列 — 無くても JS v1 可）

海外・監査用: `scheduled_arrival_date`, `carton_no`, `snapshot_process_status`, `snapshot_location_status`, `snapshot_overseas_status`, `outsource_processing_summary` 等（[SETUP §3.1](./INBOUND_UNIFIED_APP_SETUP.md)）

---

## 関連 App ID（JS 実装時）

| App | ID | 備考 |
|-----|-----|------|
| 受注明細 | 16 | |
| 外注出庫 | 27 | **`outsource_detail.line_in_date` 追加済みか要確認** |
| 海外外注出庫 | 28 | |
| 和裁士出庫 | 74 | 検品は従来どおり 74 のみ |
| 総合入庫 | **78** | 本アプリ |

---

## エクスポート照合結果

**済（最新）**: `06_入庫管理 (1).zip` → **[INBOUND_APP78_FIELDS.md](./INBOUND_APP78_FIELDS.md)** — **フィールドコードは設計と一致**

ドロップダウン選択肢のみ kintone 画面で要確認。

---

## JS 実装前の最終確認

- [ ] 上表のコードが App78 で一致
- [ ] `inbound_status` が **入庫確定**（「確定済」ではない）
- [ ] `inbound_route` に **和裁士** がある
- [ ] `source_outbound_app` に **和裁士出庫** がある
- [ ] App27 `line_in_date` 追加済み
- [ ] App16 選択肢: 外注戻り / 本社 / 和裁士戻り 等
- [ ] JavaScript カスタマイズ **未登録**

## JavaScript 登録（App78 のみ・PC）

| 順 | ファイル |
|----|----------|
| 1 | `customize/wasai_config.js` |
| 2 | `customize/inbound_unified_config.js` |
| 3 | `customize/inbound_unified_engine.js` |
| 4 | `customize/inbound_unified_desktop.js` |

**適用**: すべてのユーザー / デスクトップ
