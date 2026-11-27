# 社内オペレーション再構成 — 実装報告（§24）

実装日: 2026-10-05（リポジトリ版 `CAYANAS_INTERNAL_OPS` 1.0.0）

---

## 1. 調査した現在仕様（変更前）

| 対象 | 内容 |
|------|------|
| **App34** | `_tmp_app34_export/hokan_move.js` — 1件スキャンで `location_status` のみ PUT（出発/到着の区別なし） |
| **App84（旧）** | `factory_inbound_*` / `factory_sorting_*` / `factory_work_*` — 加工内容・App13 分類・現 `work_status` から次ボタンを決定、工場入庫時に `location_status` / `process_status` / `work_status` を自動更新 |
| **App85** | `store_work_*` — 店舗しみ抜き等（今後未使用、ファイルは残置） |
| **App30** | `kanryou.js` — submit 時 `barcode_input` で App16 を検索し `process_status=完了`・`delivery_status=納品待ち` のみ（**`work_status` 未設定**） |
| **App78** | `inbound_unified_*` — 海外戻りで `process_status=海外戻り`・`location_status=本社`・`overseas_in_date`（旧は `work_status` なし） |
| **App74** | `wasai_config.js` 入庫 — `和裁士戻り`・本社 + **`work_status=仕上げ中`**（`pickDropdownValue` で選択肢確認） |
| **App16 export** | ZIP テンプレートに `process_status` / `location_status` / `delivery_status` はレイアウト上存在。**`work_status` フィールドは export JSON 内に未検出**（本番 kintone で要確認） |

新規コードは **「検品仕上中」** を設定しない（レガシー `overseas_com.js` / 旧 factory UI は残存）。

---

## 2. App16 で必要な選択肢変更（kintone 管理画面）

| フィールド | 作業 |
|------------|------|
| **`work_status`** | フィールドが無ければ **ドロップダウン新規追加**。正式 7 値: 振り分け待ち、丸洗い待ち、**丸洗い中・乾燥**、しみ抜き待ち、しみ抜き中、**仕上げ中**、**仕上げ完了**。**仕上げ待ちは使用しない** |
| **`process_status`** | 工場作業中、店舗作業中、海外戻り、和裁士戻り、完了 等（既存維持） |
| **`delivery_status`** | 未納品、納品待ち、納品済（既存維持） |
| **`location_status`** | 本社、工場、店舗（社内移動で使用） |

「検品仕上中」が選択肢に残っていても **新 JS からは書き込まない**。

---

## 3. 新規ファイル

| ファイル | 役割 |
|----------|------|
| `customize/internal_ops_config.js` | 共通定数・`DISABLE_LEGACY_APP84` |
| `customize/barcode_batch_core.js` | 一覧・重複排除・削除 |
| `customize/barcode_batch_ui.js` | 共通 CSS |
| `customize/location_inbound_engine.js` | App34 PUT ルール |
| `customize/location_inbound_desktop.js` | App34 UI |
| `customize/internal_work_engine.js` | App84 PUT（work のみ） |
| `customize/internal_work_desktop.js` | App84 UI |
| `customize/complete_register_engine.js` | App30 PUT |
| `customize/complete_register_desktop.js` | App30 UI |
| `scripts/test_location_inbound_engine.js` | App34 単体テスト |
| `scripts/test_internal_work_engine.js` | App84 単体テスト |
| `scripts/test_complete_register_engine.js` | App30 単体テスト |
| `docs/INTERNAL_OPS_SETUP.md` | 登録手順 |
| `docs/INTERNAL_OPS_IMPLEMENTATION_REPORT.md` | 本報告 |

---

## 4. 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `customize/factory_inbound_desktop.js` | `DISABLE_LEGACY_APP84` で即 return |
| `customize/factory_sorting_desktop.js` | 同上 |
| `customize/factory_work_desktop.js` | 同上 |
| `customize/factory_portal_layout.js` | 同上 |
| `customize/inbound_unified_config.js` | `ORDER.workStatus` / `ORDER_WORK.finishInProgress` |
| `customize/inbound_unified_engine.js` | 海外戻り App16 PUT に `work_status=仕上げ中`（失敗時 work なし再試行） |
| `customize/wasai_config.js` | 和裁士入庫時 `work_status=仕上げ中`（既存 `pickDropdownValue`） |

---

## 5. 無効化する旧ファイル（kintone 登録から外す／残しても no-op）

**App84:** `order_line_classifier.js` 以降の旧 factory 系は **`internal_ops_config.js` を先頭**に置けば UI は無効。登録整理推奨。

**App34:** `hokan_move.js` / `locatinal.js` → **新 `location_inbound_*.js` に差替**

**App30:** `kanryou.js` / `kanryou1.js` の即 submit PUT → **`complete_register_*.js` に差替**

**App85:** 新方式では登録しない。`store_work_*` はリポジトリに残置。

---

## 6. App34 新仕様

- 到着拠点のみ操作。入庫先（本社・工場・店舗）選択 → 連続バーコード → 一覧 → **一括入庫**
- 各行: 管理番号、顧客名、お客様名、着物種類、現在地、工程、作業、納品、結果、削除
- 一括前に **再 GET**。成功分は一覧から除去、失敗のみ残し理由表示
- **変更可:** `location_status`；未完了かつ工場/店舗入庫時のみ `process_status` 連携
- **変更不可:** `work_status`, `delivery_status`
- 完了品（`process_status=完了` または `work_status=仕上げ完了`）は **`location_status` のみ**

---

## 7. App84 新仕様

- **社内作業ステータス管理**（工場・店舗共通）
- 作業ステータスを **手動選択**（6 値: 仕上げ待ち **なし**、仕上げ完了は **選択不可** → App30）
- 連続バーコード → 一覧（変更後作業ステータス列）→ 一括 PUT
- **変更可:** `work_status` のみ
- **変更不可:** `location_status`, `process_status`, `delivery_status`
- 工程順序の強制なし

---

## 8. App30 新仕様

- 連続バーコード → 一覧 → **一括完了登録**（旧 1 件 submit 方式から移行）
- PUT: `process_status=完了`, `work_status=仕上げ完了`, `delivery_status=納品待ち`
- **`location_status` は変更しない**

---

## 9. App78 海外戻りへの変更

`applyOverseasLine` の App16 PUT に **`work_status=仕上げ中`** を追加。  
kintone がフィールド/選択肢エラーを返した場合は **work なしで再 PUT**（コンソール warn）。

---

## 10. App74 和裁士戻りへの変更

`wasai_config.js` 入庫モード: 既存どおり `process_status=和裁士戻り`（候補から pick）・`location_status=本社` + **`work_status=仕上げ中`**（フィールドと選択肢がある場合のみ）。

**国内外注戻り（App78 domestic）:** `work_status` 自動変更 **なし**（既存維持）。

---

## 11. ステータス連携表

| トリガー | location | process | work | delivery |
|----------|----------|---------|------|----------|
| App34 工場入庫（未完了） | 工場 | 工場作業中 | 維持 | 維持 |
| App34 店舗入庫（未完了） | 店舗 | 店舗作業中 | 維持 | 維持 |
| App34 本社入庫（未完了） | 本社 | 維持 | 維持 | 維持 |
| App34 任意入庫（完了品） | 選択先 | 維持 | 維持 | 維持 |
| App84 一括 | 維持 | 維持 | **選択値** | 維持 |
| App30 完了 | 維持 | 完了 | 仕上げ完了 | 納品待ち |
| App78 海外戻り | 本社 | 海外戻り | 仕上げ中（可） | 維持 |
| App74 和裁士入庫 | 本社 | 和裁士戻り | 仕上げ中（可） | 維持 |

---

## 12. 各アプリの PUT フィールド

| App | フィールド |
|-----|------------|
| 34 | `location_status`（+ 条件付き `process_status`） |
| 84 | `work_status` |
| 30 | `process_status`, `work_status`, `delivery_status` |

---

## 13. JS 登録順

**App34:** `internal_ops_config.js` → `barcode_batch_core.js` → `barcode_batch_ui.js` → `location_inbound_engine.js` → `location_inbound_desktop.js`

**App84:** `internal_ops_config.js` → `barcode_batch_core.js` → `barcode_batch_ui.js` → `internal_work_engine.js` → `internal_work_desktop.js`  
（旧 factory 系を残す場合も **config が先**）

**App30:** `internal_ops_config.js` → `barcode_batch_core.js` → `barcode_batch_ui.js` → `complete_register_engine.js` → `complete_register_desktop.js`

**App78:** 既存 + `inbound_unified_engine.js` 更新分を反映

**App74:** 既存 wasai 系（`wasai_config.js` 更新分）

---

## 14. kintone スペース設定

| App | スペース要素 ID |
|-----|-----------------|
| 34 | `location_inbound_space`（無い場合 `message_space` にフォールバック） |
| 84 | `internal_work_space` |
| 30 | `complete_register_space` |

---

## 15. テスト結果

| テスト | 結果 |
|--------|------|
| `node scripts/test_location_inbound_engine.js` | **PASS** |
| `node scripts/test_internal_work_engine.js` | **PASS** |
| `node scripts/test_complete_register_engine.js` | **PASS** |
| `node scripts/test_factory_inbound_engine.js` 等 | レガシー engine は未変更のため **PASS 想定**（ローカル実行済み） |

**kintone 実機**（§23 シナリオ）は本番 App16 フィールド整備後に実施してください。

---

## 16. App85 を無効化する手順

1. App85 の JavaScript カスタマイズから `store_work_*.js` を **外す**（またはアプリ自体を運用から除外）
2. App84 に **新 internal work JS のみ**登録
3. 旧 `store_work_*` / App85 アプリ本体は **削除せず**「旧・未使用」として保管
4. App84 新方式の実機テスト完了後に削除判断

---

## 17. 既存機能への影響

- **App84 旧 UI:** config 先読みで無効。誤って旧 JS のみ登録すると旧動作が復活するため **登録順に注意**
- **`work_status` 未整備の App16:** App30/84/78/74 の PUT が API エラー — **先にフィールド・選択肢を追加**
- **「丸洗い中」参照:** 旧 `factory_inbound_config.js` はレガシー。新方式は **「丸洗い中・乾燥」** のみ UI 提供
- **`overseas_com.js` / App29 系:** 引き続き「検品仕上中」を設定する可能性 — 本再構成の対象外
- **App16 export に work_status 無し:** 本番と export の差分あり。本番を正とする

---

## 18. 実機確認手順

1. App16 に `work_status` と上記選択肢を用意
2. App34/84/30 にスペース ID を配置し JS を登録（§13）
3. 旧 App34/30 JS を無効化
4. **App34:** 未完了品を工場入庫 → App16 で location=工場、process=工場作業中、work 不変
5. **App34:** App30 完了済み品を店舗入庫 → location のみ変化
6. **App84:** しみ抜き中を選択し複数スキャン → work のみ更新
7. **App30:** 一括完了 → process=完了、work=仕上げ完了、delivery=納品待ち、location 不変
8. **App78:** 海外戻り 1 件 → 本社・海外戻り・仕上げ中（選択肢あり時）
9. **App74:** 和裁士入庫 → 和裁士戻り・本社・仕上げ中
10. 10 件連続・重複・意図的競合（他端末更新）で部分失敗表示を確認

---

詳細手順: [INTERNAL_OPS_SETUP.md](./INTERNAL_OPS_SETUP.md)
