# 店舗引き取り管理 — 完了報告（コード実装＋ローカルテスト）

- **作成**: 2026-11-02（Asia/Tokyo）
- **範囲**: コード実装・ローカル単体／統合テストまで
- **本番**: App16 選択肢追加・各アプリ JS/CSS 反映は **本報告では実施しない（要別途承認）**

---

## 1. 変更ファイル

| 区分 | パス | 内容 |
|------|------|------|
| 共通 | `customize/store_pickup_shared.js` | 引き取り待ち判定・ゲート・PUT（納品済のみ）・カート PCM 検証 |
| 共通 | `customize/store_pickup_api.js` | barcode 読取・残高照会・`completePickup`（revision・再取得） |
| App19 | `customize/delivery_complete_sync.js` | A550: 完了∧店舗∧delivery_no → 引き取り待ち／否则 納品待ち |
| App34 | `customize/location_inbound_engine.js` / `desktop` / `internal_ops_config.js` | 店舗到着時に条件充足なら 引き取り待ち |
| App92 | `customize/store_deadline_*.js` / `store_deadline_pickup.js` / CSS | バーコード引き取り UI・在庫 KPI・完了後リロード |
| App97 | `customize/store_payment_*.js` | 共有 `completePickup` 委譲。`registerPayment` 非変更 |
| テスト | `scripts/test_store_pickup_shared.js` | 判定・ゲート・カート |
| テスト | `scripts/test_store_pickup_complete.js` **新規／拡充** | completePickup モック統合（先払い／未入金／一部／二重／PCM／法人／未到着） |
| 既存テスト | `test_delivery_a550_store_sync` / `test_location_inbound_engine` / `test_store_deadline_engine` / `test_store_payment_s1` | 回帰 |

### 今回の差分（ギャップ埋め）

- App92 読取一覧列を要件どおり: 管理番号／お客様氏名／商品名／着物種類名／加工内容／入金状況／未入金残額
- ボタン表記「引き取り完了」
- 完了後に App92 引き取り待ち在庫 KPI を `reloadCurrent` で再取得
- App97 完了メッセージを「引き取り待ち在庫」に修正
- `completePickup` 統合テスト追加

店舗受注表・納品書印刷（Print プラグイン）は **未変更**。

---

## 2. ステータス遷移（A550）

```text
完了登録(App30) … delivery=納品待ち（従来）
    ↓
納品書(App19) … delivery_no 付与
  ├ 未完了 or 非店舗 → delivery=納品待ち
  └ 完了 ∧ 店舗 ∧ noあり → delivery=引き取り待ち
    ↓
場所移動(App34) 店舗到着
  └ 完了 ∧ A550 ∧ noあり ∧ 未納品済 → delivery=引き取り待ち
    ↓
App92 / App97 引き取り（残額 0）
  └ delivery=納品済 のみ（process / location / work 不変・入金履歴不変）
```

移行互換: 既存「納品待ち」かつ他条件充足もゲート受理（一括データ更新なし）。

---

## 3. ローカルテスト結果

```bash
node scripts/test_store_pickup_shared.js      # PASS
node scripts/test_store_pickup_complete.js    # PASS
node scripts/test_delivery_a550_store_sync.js # PASS
node scripts/test_location_inbound_engine.js  # PASS
node scripts/test_store_deadline_engine.js    # PASS
node scripts/test_store_payment_s1.js         # PASS
```

| # | 観点 | 結果 |
|---|------|------|
| 1 | 先払い済み引き取り | OK（PUT は delivery_status のみ・revision 付） |
| 2 | 当日支払い後引き取り | OK |
| 3 | 未入金防止 | OK |
| 4 | 一部入金防止 | OK |
| 5 | 1着のみ／複数着同一 PCM | OK（cart + complete） |
| 6 | 別お客様混入防止 | OK |
| 7 | 二重引き取り防止 | OK（alreadyDone・PUT なし） |
| 8 | 店舗未到着防止 | OK |
| 9 | 法人処理への影響なし | OK（ゲート拒否・法人 sync 非変更） |
| 10 | process/location/work 非更新 | OK |

---

## 4. 本番反映手順（承認後）

1. **App16** フォーム: `delivery_status` に「引き取り待ち」を追加（既存: 未納品／納品待ち／納品済は維持。既定=未納品。一括更新しない）
2. **App19** JS: `store_pickup_shared.js` → `delivery_complete_sync.js` の順で登録／更新
3. **App34** JS: config → `store_pickup_shared` → barcode_batch → location_inbound_*
4. **App92** JS/CSS: deadline config/engine → payment config/engine → pickup shared/api → deadline desktop/pickup + CSS
5. **App97** JS/CSS: payment config/engine/numbering → pickup shared/api → payment api/desktop/ui + CSS
6. 限定 E2E（`[TEST]` / PCM `P000002` のみ）: 納品書→引き取り待ち、工場→店舗、先払い／当日入金引き取り、未入金拒否、複数・PCM 混入拒否、二重拒否、法人無影響
7. 実顧客データの一括更新は行わない

バックアップ／過去の本番実施メモ: `docs/APP92_BARCODE_PICKUP_PROD_REPORT.md`（参考。今回は再反映しない）

---

## 5. 保護事項（確認済み）

- 法人納品処理: App19 法人経路・共有ゲートで A550 以外は触らない
- App19 A550 同期: 維持（引き取り待ち分岐）
- App92 納期スケジュール除外: `delivery_no` または 納品済で除外維持
- App97 入金登録: `registerPayment` 非変更
- 店舗印刷: Print プラグイン側は本作業で未変更
