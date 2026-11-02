# 社内オペレーション — App34 / App84 / App30

## 正規ルート

| App | 役割 |
|-----|------|
| **34** | 社内移動・到着入庫（`location_status`、未完了時 `process_status` 連携） |
| **84** | 社内作業ステータス（`work_status` のみ） |
| **30** | 完了登録（`process_status` / `work_status` / `delivery_status`） |

App85 は **使用しない**（旧 `store_work_*` は残置、App84 から参照しない）。

## work_status 運用（v1.1.0）

App16 正式 9 値（表示順）:

1. 未着（旧「未着手」）
2. 問合せ・見積り
3. 丸洗い待ち
4. 丸洗い中・乾燥
5. しみ抜き中（旧「しみ抜き待ち」統合）
6. 修理中
7. 再直し中
8. 仕上げ中
9. 仕上げ完了（App30）

**仕上げ待ち / しみ抜き待ち / 未着手は使いません。**  
正本・dual-read は `customize/work_status_labels.js`。手順は `docs/APP16_WORK_STATUS_MIGRATION_RUNBOOK.md`。

## App16 選択肢（kintone 側）

上記 9 値。既定値は **未着**。  
**使用しない:** 仕上げ待ち、しみ抜き待ち、未着手（移行完了後は選択肢からも削除）

`process_status`: 工場作業中、店舗作業中、海外戻り、和裁士戻り 等（テンプレート export 参照）

新規コードは **「検品仕上中」** を設定しません。

## JavaScript 登録

### App34

1. `work_status_labels.js`（任意・推奨）
2. `internal_ops_config.js`
3. `barcode_batch_core.js`
4. `barcode_batch_ui.js`
5. `location_inbound_engine.js`
6. `location_inbound_desktop.js`

**旧 `hokan_move.js` / `locatinal.js` は外す**

スペース要素ID: **`location_inbound_space`**

### App84

1. `work_status_labels.js`（**先頭**）
2. `internal_ops_config.js`（`DISABLE_LEGACY_APP84: true`）
3. `barcode_batch_core.js`
4. `barcode_batch_ui.js`
5. `internal_work_engine.js`
6. `internal_work_desktop.js`

旧 factory_* / factory_portal_layout は登録しても **即 return** します。

スペース: **`internal_work_space`**

処理内容（App30 と同型）:

| モード | PUT |
|--------|-----|
| 作業登録のみ（初期） | `work_status` のみ |
| 作業登録＋保管場所変更 | `work_status` + `location_status`（工場／本社／店舗） |
| 保管場所変更のみ | `location_status` のみ |

`process` / `delivery` / `completion_date` は変更しない。納品済は更新不可。App34 の工程連動（工場作業中／店舗作業中）は行わない。

### App30

1. `work_status_labels.js`（任意・推奨）
2. `internal_ops_config.js`
3. `barcode_batch_core.js`
4. `barcode_batch_ui.js`
5. `complete_register_engine.js`
6. `complete_register_desktop.js`

**旧 `kanryou.js` の barcode 即 PUT は外す**（または complete_register のみ使用）

スペース: **`complete_register_space`**

## App78 / App74

- 海外戻り（App78 経由）: `work_status = 仕上げ中` を追加 PUT（選択肢が無い場合は kintone API エラー — 要追加）
- 和裁士戻り: `wasai_config.js` 入庫時同様
- **外注戻り**: 変更なし（`work_status` 自動設定しない）
