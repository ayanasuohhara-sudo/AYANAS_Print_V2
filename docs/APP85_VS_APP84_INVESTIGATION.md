# App85 / App84 調査報告

- **調査日**: 2026-11-02（Asia/Tokyo）
- **範囲**: 調査のみ。**店舗専用ポータルへの App85 追加は行っていない**
- **本番確認**: kintone API（App16 セッション経由）

---

## 1. App85 — 正式名と現状

| 項目 | 結果 |
|------|------|
| 本番アプリ | **不存在**（`The app (ID: 85) not found. The app may have been deleted.`） |
| docs／旧セットアップ上の名称 | **「店舗入庫・ステータス管理」**（しみ抜き作業 V1） |
| リポジトリ上の呼称 | 店舗しみ抜き作業／`store_work_*`（App85・残置） |
| 本番 JS・レコード | 確認不可（アプリ自体なし） |
| 使用状況 | **未使用（削除済）**。正規ルートからも除外済み |

### 設計されていた機能（残置コード・docs）

ソース: `customize/store_work_*.js` / `docs/STORE_WORK_SETUP.md`

- 対象: **店舗のしみ抜き**に特化（App84 と JS・スペース非共有）
- UI: バーコード読取 → 開始／完了操作
- App16 更新（想定）:
  - しみ抜き開始: `work_status` → **しみ抜き中**（条件: 店舗／旧しみ抜き待ち dual-read）
  - しみ抜き完了・工場へ: `location_status` → **工場**、`work_status` → **仕上げ中**
- **更新しない**: `process_status` / `delivery_status`
- 登録予定 JS（当時）: `order_line_classifier` → `store_work_config` → `engine` → `desktop`
- スペース ID: `store_work_space`

現行の社内オペ方針（`docs/INTERNAL_OPS_SETUP.md`）:

> App85 は **使用しない**（旧 `store_work_*` は残置、App84 から参照しない）。

---

## 2. App84 — 正式名と現状

| 項目 | 結果 |
|------|------|
| 正式アプリ名（本番） | **`08_社内作業登録`** |
| App ID | **84** |
| 役割 | 社内作業ステータス管理（**`work_status` のみ** PUT） |
| 本番 JS | `work_status_labels` → `internal_ops_config` → `barcode_batch_*` → `internal_work_engine` → `internal_work_desktop` |
| レコード数 | **3**（最新作成: 2026-10-25 UTC／Asia/Tokyo 10-26 頃） |
| ナビ／ポータル | バナー・フロアポータルで「社内作業登録」として App84 を案内 |

### 現在の機能

- バーコード連続読取 → 一覧 → 選択した `work_status` を一括 PUT
- **工程・納品・場所は変更しない**（`internal_work_engine` = `work_status` のみ）
- 仕上げ完了は App30 担当（App84 の選択対象外）
- 旧 factory_* UI は `DISABLE_LEGACY_APP84: true` で無効

---

## 3. App85 と App84 の違い

| 観点 | App85（旧・削除済） | App84（現行） |
|------|---------------------|---------------|
| 正式名 | 店舗入庫・ステータス管理（docs） | **08_社内作業登録** |
| 本番 | **なし** | **稼働** |
| 主目的 | 店舗しみ抜き専用フロー | 工場・店舗共通の作業ステータス更新 |
| 更新フィールド | `work_status` ＋（完了時）`location_status` | **`work_status` のみ** |
| 場所移動 | しみ抜き完了で **工場へ** | しない（場所は App34） |
| 対象商品 | しみぬき系（classifier） | 管理番号一般（顧客種別分岐なし） |
| JS 系統 | `store_work_*` | `internal_work_*` + `internal_ops_*` |
| ポータル | 追加しない方針 | ショートカット「社内作業登録」 |

補足: しみ抜きの作業状態そのものは、現行では **App84 で `work_status=しみ抜き中` 等を付ける**運用に統合されている。店舗→工場の**現物移動**は **App34**。

---

## 4. 店舗専用ポータルへの追加可否

| 判断 | 内容 |
|------|------|
| **App85 を追加しない** | 本番アプリが存在しない。追加してもリンク切れになる |
| 本調査での変更 | **なし**（ポータル・ナビ未改修） |
| 代替 | 作業ステータスは **App84**、入庫・移動は **App34**、完了は **App30** |

将来 App85 相当を復活させる場合は、新 App ID・ACL・`store_work_*` の現行 9 値追随・ポータル追加を **別承認**で行うこと。

店舗ポータル構成の確定案: `docs/STORE_PORTAL_COMPOSITION.md`（App85 非掲載・App84 を作業メニューへ）。

---

## 5. 参照

- `docs/INTERNAL_OPS_SETUP.md`
- `docs/STORE_WORK_SETUP.md`（旧 App85）
- `docs/INTERNAL_OPS_IMPLEMENTATION_REPORT.md` §16 App85 無効化
- `docs/APP16_WORK_STATUS_CUTOVER_REPORT.md`（85 不存在確認）
- `customize/store_work_*.js`（残置）
- `customize/internal_work_*.js` / `internal_ops_config.js`（App84 正本）
