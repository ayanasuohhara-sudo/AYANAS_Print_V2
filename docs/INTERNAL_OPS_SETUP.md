# 社内オペレーション — App34 / App84 / App30

## 正規ルート

| App | 役割 |
|-----|------|
| **34** | 社内移動・到着入庫（`location_status`、未完了時 `process_status` 連携） |
| **84** | 社内作業ステータス（`work_status` のみ） |
| **30** | 完了登録（`process_status` / `work_status` / `delivery_status`） |

App85 は **使用しない**（旧 `store_work_*` は残置、App84 から参照しない）。

## work_status 運用（v1.0.1）

App16 の正式 7 値: 振り分け待ち → 丸洗い待ち → 丸洗い中・乾燥 → しみ抜き待ち → しみ抜き中 → 仕上げ中 → 仕上げ完了（App30）。  
**仕上げ待ちは使いません。** 丸洗い/しみ抜き系は「〜中・乾燥」または「〜中」のあと **仕上げ中** へ手動遷移（App84、順序強制なし）。

## App16 選択肢（kintone 側で要確認・追加）

`work_status` フィールドが無い場合は **追加**してください。

推奨値:

- 振り分け待ち、丸洗い待ち、**丸洗い中・乾燥**（旧「丸洗い中」から移行）、しみ抜き待ち、しみ抜き中、**仕上げ中**、仕上げ完了  
- **使用しない:** 仕上げ待ち（App84 選択肢にも含めない）

`process_status`: 工場作業中、店舗作業中、海外戻り、和裁士戻り 等（テンプレート export 参照）

新規コードは **「検品仕上中」** を設定しません。

## JavaScript 登録

### App34

1. `internal_ops_config.js`
2. `barcode_batch_core.js`
3. `barcode_batch_ui.js`
4. `location_inbound_engine.js`
5. `location_inbound_desktop.js`

**旧 `hokan_move.js` / `locatinal.js` は外す**

スペース要素ID: **`location_inbound_space`**

### App84

1. `internal_ops_config.js`（**先頭** — `DISABLE_LEGACY_APP84: true`）
2. `barcode_batch_core.js`
3. `barcode_batch_ui.js`
4. `internal_work_engine.js`
5. `internal_work_desktop.js`

旧 factory_* / factory_portal_layout は登録しても **即 return** します。

スペース: **`internal_work_space`**

### App30

1. `internal_ops_config.js`
2. `barcode_batch_core.js`
3. `barcode_batch_ui.js`
4. `complete_register_engine.js`
5. `complete_register_desktop.js`

**旧 `kanryou.js` の barcode 即 PUT は外す**（または complete_register のみ使用）

スペース: **`complete_register_space`**

## App78 / App74

- 海外戻り（App78 経由）: `work_status = 仕上げ中` を追加 PUT（選択肢が無い場合は kintone API エラー — 要追加）
- 和裁士戻り: `wasai_config.js` 入庫時同様
- **外注戻り**: 変更なし（`work_status` 自動設定しない）
