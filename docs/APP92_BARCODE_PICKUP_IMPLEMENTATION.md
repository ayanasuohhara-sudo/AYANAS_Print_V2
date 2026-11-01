# App92 バーコード引き取り / 引き取り待ち — 実装メモ

- **作成**: 2026-11-02（Asia/Tokyo）
- **状態**: コード実装 + ローカル単体テストまで。**本番フィールド変更・JS反映・実データ更新は未実施（要別途承認）**

---

## 変更箇所一覧

| アプリ | ファイル | 内容 |
|--------|----------|------|
| 共通 | `customize/store_pickup_shared.js` **新規** | 引き取り待ち判定・ゲート・PUT（納品済のみ）・カート検証 |
| 共通 | `customize/store_pickup_api.js` **新規** | barcode 読取・残高照会・`completePickup`（revision） |
| App16 | （フォーム） | **本番承認後**: `delivery_status` に選択肢「引き取り待ち」を追加。既存3値は維持。一括データ更新なし |
| App19 | `delivery_complete_sync.js` | A550 同期: 完了∧店舗∧delivery_no → **引き取り待ち**、否则 **納品待ち**。法人経路不変 |
| App19 | カスタマイズ読込 | **追加**: `store_pickup_shared.js` を sync より前に登録 |
| App34 | `internal_ops_config.js` | `DELIVERY.pickupWaiting` / `customerCode` / `deliveryNo` |
| App34 | `location_inbound_engine.js` | 店舗到着で条件充足時に `delivery_status=引き取り待ち`（法人は触らない） |
| App34 | `location_inbound_desktop.js` | customer_code / delivery_no を取得・スナップショットへ |
| App34 | カスタマイズ読込 | **追加**: `store_pickup_shared.js`（engine より前推奨） |
| App92 | `store_deadline_config/engine/desktop/css` | v1.2.0・在庫に引き取り待ち(+互換納品待ち)・メッセージ |
| App92 | `store_deadline_pickup.js` **新規** | バーコード引き取りパネル UI |
| App92 | カスタマイズ読込 | 下記読込順 |
| App97 | `store_payment_config/engine/api` | DELIVERY.pickupWaiting・PUTは status のみ・`completePickup` は共有 API 委譲。**registerPayment 非変更** |
| App97 | カスタマイズ読込 | `store_pickup_shared.js` → `store_pickup_api.js` を payment api の前後に追加 |

### App92 推奨読込順

1. `store_deadline_config.js`
2. `store_deadline_engine.js`
3. `store_payment_config.js`
4. `store_payment_engine.js`
5. `store_pickup_shared.js`
6. `store_pickup_api.js`
7. `store_deadline_desktop.js`
8. `store_deadline_pickup.js`
9. `store_deadline.css`

### App97 推奨読込順（追記）

`store_payment_config` → `store_payment_engine` → `store_payment_numbering` → **`store_pickup_shared` → `store_pickup_api`** → `store_payment_api` → UI/desktop

### App19 推奨読込順（追記）

**`store_pickup_shared.js`** → `delivery_complete_sync.js` →（既存ガード等）

---

## 状態遷移（A550）

```text
完了登録(App30) … delivery=納品待ち（従来どおり・本PR非変更）
    ↓
納品書(App19) … delivery_no 付与
  ├ location≠店舗 or 未完了 → delivery=納品待ち
  └ 完了 ∧ 店舗 ∧ noあり → delivery=引き取り待ち
    ↓
場所移動(App34) 店舗到着
  └ 完了 ∧ A550 ∧ noあり ∧ 未納品済 → delivery=引き取り待ち
    ↓
App92 / App97 引き取り（入金済）
  └ delivery=納品済 のみ（process/location/work 不変）
```

**移行互換**: 既存の「納品待ち」かつ他条件充足のレコードも引き取りゲートで受理（一括更新なし）。

---

## ローカルテスト

```bash
node scripts/test_store_pickup_shared.js
node scripts/test_delivery_a550_store_sync.js
node scripts/test_location_inbound_engine.js
node scripts/test_store_payment_s1.js
node scripts/test_store_deadline_engine.js
```

---

## 本番反映前チェックリスト（承認後）

1. App16: `delivery_status` に「引き取り待ち」追加（フォーム設定のみ）
2. App19/34/92/97: 上記 JS/CSS を読込順どおり反映
3. 限定 E2E（TEST データ）: 納品書→引き取り待ち、工場→店舗、App92 先払い引き取り、App97 当日入金引き取り、複数・未入金拒否・二重拒否、法人無影響
4. 実顧客データ一括更新は行わない
