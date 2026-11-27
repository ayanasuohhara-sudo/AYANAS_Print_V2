# A550 入金・納品改修 — 承認実装報告（本番未適用）

- **実装日**: 2026-11-14（Asia/Tokyo）
- **承認**: §8 確定事項 1〜10 ＋注意事項
- **本番反映**: **未実施**（テスト確認後の別承認待ち）
- **バックアップ**: `customize/backups/a550_payment_delivery_approved_2026-11-14T03-59-42/`

---

## 1. 実装サマリ

| 要件 | 実装 |
|------|------|
| 未入金／一部入金の納品済更新 | App92 完了時に確認ダイアログ（対象管理番号＋状況を明示） |
| 確認文 | `スマレジで残金の支払いを確認しましたか？` |
| 確認済み | `delivery_status=納品済` のみ更新 |
| キャンセル | 更新なし |
| 入金済み | 件数確認のみ（スマレジ確認ダイアログなし） |
| 確認しても入金状況 | **自動で入金済みにしない**（独立） |
| 一覧絞り込み | 維持／一括変更 UI なし |
| App97 残額 | A550 引き取りゲートに**未使用** |
| App19 | **変更なし**（バックアップと一致確認済） |
| App92 バーコード一括 | 再利用。他3軸不変 |
| App21／App35／法人 | 変更なし |
| 管理者例外 | `unpaidHandoverApproved` 維持 |
| App97 履歴 | 削除なし |

---

## 2. 主な変更ファイル

- `customize/store_payment_status.js`（v1.1.0）— スマレジ確認 API・一括確認文
- `customize/store_pickup_shared.js`（v1.2.0）— `smaregiResidualConfirmed` ゲート
- `customize/store_pickup_api.js` — 物流 canComplete／完了時フラグ。PUT は delivery のみ
- `customize/store_deadline_pickup.js` / `store_deadline_config.js` — バッチ確認 UI
- `customize/store_payment_api.js` — App97 残額フォールバック廃止
- `customize/store_payment_status_desktop.js` — 絞り込み維持・一括変更なしを明記
- テスト: `scripts/test_store_payment_status.js` ほか更新

非変更: `customize/delivery_complete_sync.js`, `payment_create.js`, App35

---

## 3. テスト結果

```
node scripts/test_store_payment_status.js      → All passed
node scripts/test_store_pickup_shared.js       → All passed
node scripts/test_store_pickup_complete.js     → All passed
  （未入金/一部: 確認なし不可・確認あり可・入金状況不変・PUT=deliveryのみ）
node scripts/test_delivery_a550_store_sync.js  → All passed（App19 非回帰）
node scripts/test_store_print_payment.js       → All passed
node scripts/test_store_payment_s1.js          → All passed（version assert を 1.3 に更新）
```

---

## 4. 本番適用時（別承認後）

1. App16 に `store_payment_status` フィールド追加  
2. App16: status JS/CSS（個別変更＋絞り込み）  
3. App92: `store_payment_status.js` を pickup より先に読込＋更新 JS  
4. App97 側 pickup 共有 JS 更新（入金登録誘導は弱体化済み文言）  
5. App19 はデプロイ不要（一致確認のみ）  
6. 限定 E2E → 一般公開  

過去入金状況の一括移行はさらに別承認。
