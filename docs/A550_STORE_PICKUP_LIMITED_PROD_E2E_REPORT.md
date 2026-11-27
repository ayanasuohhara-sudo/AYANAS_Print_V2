# 店舗引き取り管理 — 限定本番反映・E2E 完了報告

- **実施**: 2026-11-02 23:00頃（Asia/Tokyo）
- **範囲**: App16 選択肢確認／App19・34・92・97 JS/CSS 反映／App97 限定 ACL／検証ユーザー限定 E2E
- **対象データ**: A550 + PCM `P000002`（`[TEST]山田花子`）の `PK******` テスト受注のみ
- **一般公開**: **不可**（別途承認まで一般スタッフ・実顧客引き取りは行わない）

---

## 1. 本番反映結果

| 手順 | 結果 |
|------|------|
| バックアップ App16/19/34/92/97 | OK → `customize/backups/pickup_waiting_prod_2026-11-02T14-00-16/` + `ROLLBACK.md` |
| App16 `delivery_status` に「引き取り待ち」 | OK（既存済み・再デプロイ成功）`未納品 / 納品待ち / 引き取り待ち / 納品済` |
| App92 共有+UI 反映 | OK（v1.2.1 / allowlist） |
| App97 共有参照反映 | OK |
| App19 A550 納品書同期 | OK（`store_delivery_pcm.js` 維持） |
| App34 店舗到着遷移 | OK |
| App97 限定 ACL | OK（`everyone` view/add/edit = false、検証3ユーザー+Administrators+CREATOR） |
| App92 引き取り allowlist | OK（`info@` / `matsuura@` / `ayanas20126@` のみ実行可） |

デプロイ成果物: 同バックアップ配下の `deploy.json` / `delivery_status_after.json` / `app97_acl.json` / `e2e_report.json`

---

## 2. JS 読み込み順（本番確認済み）

### App19
1. `internal_ops_config.js`
2. `complete_register_engine.js`
3. `delivery_completion_guard.js`
4. `store_delivery_pcm.js` ← 既存店舗印刷カスタマイズ維持
5. `barcode_delivery.js`
6. `store_pickup_shared.js`
7. `delivery_complete_sync.js`
8. `delivery_a550_edit_guard.js`
9. `price_master_register.js`
10. `delivery_additional_item_guard.js`
11. `additional_item_engine.js`

### App34
1. `internal_ops_config.js`
2. `store_pickup_shared.js`
3. `barcode_batch_core.js`
4. `barcode_batch_ui.js`
5. `location_inbound_engine.js`
6. `location_inbound_desktop.js`

### App92
1. `store_deadline_config.js`
2. `store_deadline_engine.js`
3. `store_payment_config.js`
4. `store_payment_engine.js`
5. `store_pickup_shared.js`
6. `store_pickup_api.js`
7. `store_deadline_desktop.js`
8. `store_deadline_pickup.js`  
CSS: `store_deadline.css`

### App97
1. `store_payment_config.js`
2. `store_payment_engine.js`
3. `store_payment_numbering.js`
4. `store_pickup_shared.js`
5. `store_pickup_api.js` ← `store_payment_api.js` より前
6. `store_payment_api.js`
7. `store_payment_desktop.js`
8. `store_payment_ui.js`  
CSS: `store_payment.css`

---

## 3. E2E 成功・失敗件数

- **成功: 29 / 失敗: 0**
- 実行: `node scripts/_pickup_waiting_prod.js all`
- フィクスチャ: `PK074987A`〜`G`（App16 ids 3498–3504）

| 観点 | 結果 |
|------|------|
| 店舗完了品の納品書 → 引き取り待ち | OK |
| 工場完了品の納品書 → 納品待ち | OK |
| 工場→店舗移動 → 引き取り待ち | OK |
| App92 引き取り待ち在庫条件（納品待ち互換含む） | OK |
| バーコード読取（未入金→App97案内） | OK |
| 先払い後 App92共有引き取り → 納品済 | OK |
| 当日入金後 App97引き取り → 納品済 | OK |
| 未入金拒否 / 一部入金拒否 | OK |
| 同一 PCM 複数商品 | OK |
| 異 PCM 混入拒否 | OK |
| 二重引き取り alreadyDone | OK |
| App16 は delivery_status のみ更新・process/location/work 不変 | OK |
| 完了分は App92 在庫から除外、未入金は在庫残 | OK |
| 法人サンプル（A545 / 103126382）未変更 | OK |
| App92 検証ユーザー許可・allowlist | OK |

---

## 4. App92 在庫・KPI 表示結果

- `DELIVERY_PICKUP_WAITING` / `DELIVERY_WAITING` の両方を在庫対象に含むことを本番確認
- 先払い完了（納品済）→ `isWaitingStockAtStore === false`（除外）
- 未入金・引き取り待ち → `isWaitingStockAtStore === true`（表示対象）
- UI: v1.2.1 + バーコード引き取りパネル表示（検証ログイン）

---

## 5. App97 との整合

- 共有 `CAYANAS_StorePickup` / `CAYANAS_StorePickup_Api.completePickup` を App92・97 双方で利用
- App97 既存 UI の引き取りも「引き取り待ち」（移行中は「納品待ち」互換）を受理
- `registerPayment` 経路は非変更。引き取り完了は delivery_status→納品済のみ
- ACL: everyone 拒否を再適用（revision 13→14）

---

## 6. 法人業務への影響

- E2E 中に法人サンプル `A545 / manage_no=103126382` の delivery_status / location_status / revision は不変
- App19 法人向け納品同期ロジックは非変更（A550 分岐のみ）
- 法人納品待ち在庫の抽出条件は従来どおり

---

## 7. 残存リスク

| リスク | 内容 | 緩和 |
|--------|------|------|
| 移行互換 | 旧「納品待ち」在庫も引き取り対象 | 意図的互換。将来一括移行後にゲートを厳格化可 |
| allowlist 限定 | App92 は JS 側のみ制限（アプリ ACL 全体ではない） | 検証ユーザー以外はパネルで拒否表示 |
| App97 ACL | everyone 拒否済み。誤って開け直すと一般公開になる | 変更時は ACL 再確認 |
| テスト残データ | `PK074987*` と関連入金が残る | 削除／取消可。実顧客一括更新なし |
| ブラウザキャッシュ | 古い JS が残る可能性 | ハードリロード推奨 |

---

## 8. 一般公開の可否

**不可。**

- 一般スタッフへの App92 バーコード引き取り公開: **未承認**
- 実顧客の引き取り処理: **未承認**
- 現状は検証ユーザー（`info@ayanas.co.jp` / `matsuura@ayanas.co.jp` / `ayanas20126@gmail.com`）と App97 限定 ACL のまま運用すること

一般公開時は allowlist 解除（または店舗ロール ACL）＋ App97 ACL 見直しを別承認で実施する。

---

## 9. 復旧

`customize/backups/pickup_waiting_prod_2026-11-02T14-00-16/ROLLBACK.md` を参照。
