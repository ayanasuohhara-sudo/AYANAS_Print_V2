# A550 入金状況 — 本番適用報告

- **適用日時**: 2026-11-14（Asia/Tokyo）
- **結果**: **成功**（`VERIFY_OK`）
- **バックアップ**: `customize/backups/a550_payment_status_prod_2026-11-14T04-20-51/`（RESTORE.md あり）
- **一括データ更新**: **なし**（検証用に1件の入金状況を一時変更→復元）

---

## 1. 実施内容

| # | 作業 | 結果 |
|---|------|------|
| 1 | App16 フィールド／JS／レイアウト／ビューバックアップ | OK（23 ファイル含む） |
| 2 | `store_payment_status` 追加（未入金／一部入金／入金済み、初期 未入金） | SUCCESS |
| 3 | 既存支払フィールド重複確認 | **dupes: []** |
| 4 | App16 JS/CSS デプロイ（status 系のみ追加） | SUCCESS |
| 4b | App92 JS デプロイ（status＋改修対象のみ） | SUCCESS |
| 5 | App19 | **未変更**（`delivery_complete_sync.js` 残存確認） |
| 6 | App97 データ | **削除なし**（件数 19 のまま） |
| 7 | App21 / App35 / 法人 | **未変更** |

---

## 2. 変更したアプリ・ファイル

### App16
- フィールド: `store_payment_status`
- 追加 JS: `store_payment_status.js`, `store_payment_status_desktop.js`
- 追加 CSS: `store_payment_status.css`

### App92
- 追加: `store_payment_status.js`（先頭）
- 更新: `store_payment_config.js`, `store_pickup_shared.js`, `store_pickup_api.js`, `store_deadline_config.js`, `store_deadline_pickup.js`

### 非変更
- App19, App21, App35, App97 データ

---

## 3. 検証結果

| 項目 | 結果 |
|------|------|
| 空欄レコード | 正規化＝**未入金**、スマレジ確認対象 |
| 3パターン設定 | 未入金／一部入金／入金済みを一時設定・復元。**process/location/work/delivery 不変** |
| 入金済みゲート | 確認なしで完了可 |
| 未入金／一部入金 | 確認なし不可／`smaregiResidualConfirmed` で可 |
| 確認文 | `スマレジで残金の支払いを確認しましたか？`（複数件は対象明示） |
| PUT | `delivery_status` のみ（＝納品済） |
| 管理者例外 | 維持 |
| 法人ゲート | A550 以外は not_store_customer |
| App97 件数 | 19（削除なし） |
| App92 モジュール | status 1.1.0 / pickup 1.2.0 |

詳細 JSON: `docs/A550_PAYMENT_STATUS_PROD_VERIFY.json`

---

## 4. 復旧

問題時は `customize/backups/a550_payment_status_prod_2026-11-14T04-20-51/RESTORE.md` と保存済み customize／files から App16／App92 を戻せます。

---

## 5. 補足

- 初回デプロイ直後のゲート検証は App16 ページに pickup 未読込のため空だったが、App92 での再検証で合格。
- 過去データの入金状況一括移行は未実施（承認どおり）。
