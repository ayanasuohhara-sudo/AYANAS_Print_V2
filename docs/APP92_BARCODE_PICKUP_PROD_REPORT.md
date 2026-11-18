# 引き取り待ち / App92 バーコード引き取り — 本番反映報告

- **実施時刻**: 2026-11-02 00:43–00:45 頃（Asia/Tokyo）
- **バックアップ**: `customize/backups/pickup_waiting_prod_2026-11-01T15-43-57`
- **スクリプト**: `scripts/_pickup_waiting_prod.js`
- **対象データ**: E2E は `[TEST]` / PCM `P000002` のみ。実顧客一括更新なし

---

## 実施内容

| 手順 | 結果 |
|------|------|
| バックアップ（App16 fields + App19/34/92/97 customize 本体） | OK |
| App16 `delivery_status` に「引き取り待ち」追加 | OK（未納品 / 納品待ち / 引き取り待ち / 納品済、既定=未納品） |
| App19 JS 反映（`store_pickup_shared` 含む） | SUCCESS |
| App34 JS 反映 | SUCCESS |
| App92 JS/CSS 反映（v1.2.0 + 引き取りパネル） | SUCCESS |
| App97 JS/CSS 反映（共有 completePickup、入金処理非変更） | SUCCESS |

### 反映後 JS 順（本番確認済み）

- **App19**: … → `store_pickup_shared.js` → `delivery_complete_sync.js` → …
- **App34**: `internal_ops_config` → `store_pickup_shared` → barcode_batch → location_inbound_*
- **App92**: deadline config/engine → payment config/engine → pickup shared/api → deadline desktop/pickup + CSS
- **App97**: payment config/engine/numbering → pickup shared/api → payment api/desktop/ui + CSS

---

## 限定 E2E（23/23 OK）

| # | 観点 | 結果 |
|---|------|------|
| 1 | 納品書（店舗完了）→ 引き取り待ち | OK |
| 2 | 納品書（工場）→ 納品待ち | OK |
| 3 | 工場→店舗入庫 → 引き取り待ち | OK |
| 4 | process / location / work 非更新 | OK |
| 5 | 先払い後・共有API引き取り → 納品済 | OK |
| 6 | 当日入金後 App97 引き取り → 納品済 | OK |
| 7 | 複数商品引き取り | OK |
| 8 | 未入金防止 | OK |
| 9 | 二重引き取り alreadyDone | OK |
| 10 | バーコード未入金→App97案内 | OK |
| 11 | PCM 混入防止 | OK |
| 12 | App92 パネル表示 v1.2.0 | OK |
| 13 | 法人サンプル未変更 | OK |

詳細 JSON: `customize/backups/pickup_waiting_prod_2026-11-01T15-43-57/e2e_report.json`

---

## 注意

- 既存の「納品待ち」在庫は一括移行していない（互換ゲートで引き取り可）。
- 法人納品経路は未変更。
- App97 の入金登録ロジックは未変更。
