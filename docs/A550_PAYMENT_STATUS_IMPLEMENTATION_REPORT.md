# A550 店舗入金管理簡略化 — 実装報告（本番未適用）

- **実装日**: 2026-11-14（Asia/Tokyo）
- **本番適用**: **未実施**（別途承認後）
- **過去データ一括更新**: **未実施**（調査のみ）

---

## 1. 実装サマリ

| 項目 | 内容 |
|------|------|
| App16 フィールド | `store_payment_status`（未入金／一部入金／入金済み、初期 未入金）仕様＋dry-run スクリプト |
| 一覧 UI | インライン変更・絞り込みバー（A550 のみ編集） |
| 納品／引き取り判定 | App97 残額 → **App16 入金状況**。一部入金≠入金済み。管理者例外維持 |
| App97 | アプリ・履歴は残置。通常業務の登録誘導を整理 |
| 印刷・ポータル | App16 状況表示優先。ポータル v1.7.0 |
| App21 / App35 | **変更なし** |

---

## 2. 変更ファイル

### 新規
- `customize/store_payment_status.js`
- `customize/store_payment_status_desktop.js`
- `customize/store_payment_status.css`
- `docs/APP16_STORE_PAYMENT_STATUS_FIELD_SPEC.md`
- `docs/STORE_PAYMENT_STATUS_FIELDS.json`
- `docs/A550_PAYMENT_STATUS_3STATE_PLAN.md`（既存方針）
- `docs/A550_PAYMENT_STATUS_MIGRATION_INVESTIGATION.md` / `.json`
- `scripts/_app16_store_payment_status_field_dry.js`
- `scripts/investigate_a550_payment_status_migration.js`
- `scripts/test_store_payment_status.js`
- `customize/backups/a550_payment_status_2026-11-14T03-50-24/`（既存 JS バックアップ）

### 更新
- `customize/store_pickup_shared.js` / `store_pickup_api.js`
- `customize/store_payment_config.js` / `store_payment_api.js`
- `customize/store_deadline_config.js` / `store_deadline_pickup.js`
- `customize/floor_portal_config.js`（v1.7.0）
- `js/store_print_payment.js` / `js/store_print_bundle.js`
- `js/templates/store_order.js` / `store_delivery.js`
- `scripts/test_store_pickup_shared.js` / `test_store_pickup_complete.js`
- `docs/A550_PAYMENT_SIMPLIFICATION_INVESTIGATION.md`

### 非変更
- `customize/payment_create.js`（App21）
- App35 関連
- App97 データ削除なし

---

## 3. 判定ルール（実装）

| App16 入金状況 | 納品・引き取り |
|----------------|----------------|
| 入金済み | 可能 |
| 一部入金 | **不可**（管理者例外可） |
| 未入金（空欄含む） | **不可**（管理者例外可） |

メッセージは店舗受注一覧での更新を案内（App97 登録を要求しない）。

---

## 4. テスト結果

```
node scripts/test_store_payment_status.js     → All passed
node scripts/test_store_pickup_shared.js      → All passed
node scripts/test_store_pickup_complete.js    → All passed（管理者例外含む）
node scripts/test_store_print_payment.js      → All passed
node scripts/test_store_payment_s1.js         → All passed
node scripts/investigate_a550_payment_status_migration.js → mock OK
node scripts/_app16_store_payment_status_field_dry.js     → DRY-RUN OK
```

---

## 5. 過去データ移行調査

モック結果（本番読取は未接続）:

| 候補 | 件数（mock） |
|------|-------------|
| 入金済み | 1 |
| 一部入金 | 1 |
| 未入金 | 1 |
| 法人スキップ | 1 |
| 判定不能 | 0 |

詳細: `docs/A550_PAYMENT_STATUS_MIGRATION_INVESTIGATION.md`  
**一括 PUT は別承認後。**

---

## 6. 本番適用時の手順（承認後）

1. App16 にフィールド追加（`STORE_PAYMENT_STATUS_FIELDS.json`）
2. 一覧ビューに列追加＋必要ならビュー絞り込み
3. App16 JS/CSS 読込順: `store_payment_status.js` → `store_payment_status_desktop.js`（+ `.css`）
4. App92 / App97 / App19: `store_payment_status.js` を pickup 系より先に追加し、`store_pickup_shared.js` / `store_pickup_api.js` 等を更新版へ
5. App87 ポータル v1.7.0
6. 印刷プラグイン bundle 更新
7. 限定 E2E → 一般公開
8. （別承認）移行候補の一括更新

---

## 7. 安全対策チェック

- [x] App21 / App35 非変更
- [x] 法人レコードは編集不可・空
- [x] A550 以外のゲート対象外
- [x] 変更履歴: kintone 標準履歴＋納品済変更時確認ダイアログ
- [x] 複数明細: 受注単位ステータス（合計ベース）
- [x] 納品済の入金状況変更は確認ダイアログ
- [x] App97 履歴・アプリ削除なし
