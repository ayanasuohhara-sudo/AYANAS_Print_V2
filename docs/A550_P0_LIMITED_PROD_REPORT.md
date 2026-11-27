# A550 P0 限定本番反映・E2E 報告

- **実施**: 2026-11-01（Asia/Tokyo）
- **範囲**: App19 A550 同期＋edit guard / App92 v1.1.0
- **一般公開**: **していない**（別途承認が必要）
- **実顧客更新**: **なし**（`[TEST]` / `TP0*` / App8 `Z9P0` のみ）
- **過去 A550 一括更新**: **なし**

機械可読: `docs/A550_P0_LIMITED_E2E_REPORT.json`  
バックアップ: `customize/backups/a550_p0_limited_2026-11-01T14-01-52/`  
復旧: `node scripts/_a550_p0_limited_prod.js rollback`

---

## 1. 反映前確認

| 項目 | 結果 |
|------|------|
| App19/App92 現行 JS/CSS バックアップ | OK |
| 法人 PUT（納品済＋location）非変更 | OK（単体＋本番 E2E） |
| A550 PUT は `delivery_status` / `delivery_no` / `delivery_date` のみ | OK |
| 反映中 ACL 一時制限（verifier + Administrators + CREATOR） | OK → E2E 後に元 ACL 復元 |
| 復旧手順 | `RESTORE.md` + `rollback` モード |

---

## 2. 本番反映結果

| アプリ | 結果 | 内容 |
|--------|------|------|
| **App19** | **SUCCESS** | `delivery_complete_sync.js` 置換＋`delivery_a550_edit_guard.js` 追加（sync の直後） |
| **App92** | **SUCCESS** | config/engine/desktop/css **v1.1.0** |
| **App16** | 変更なし | フィールド追加なし |
| **App97** | 変更なし | 既存 S1 で引き渡し検証のみ |

### App19 読込順（本番）

1. `internal_ops_config.js`
2. `complete_register_engine.js`
3. `delivery_completion_guard.js`
4. `barcode_delivery.js`
5. `delivery_complete_sync.js`
6. **`delivery_a550_edit_guard.js`（新規）**
7. `price_master_register.js`
8. `delivery_additional_item_guard.js`
9. `additional_item_engine.js`

### App92 読込順（本番）

1. `store_deadline_config.js`
2. `store_deadline_engine.js`
3. `store_deadline_desktop.js`
4. `store_deadline.css`

### ACL

反映中のみ制限。検証後は **everyone view/add を復元**（既存業務アプリのため）。  
**一般公開のプロセス承認とは別**（本報告では未承認）。

---

## 3. 本番 E2E 結果

**成功 24 / 失敗 0**

| # | ケース | 結果 |
|---|--------|:----:|
| — | App19/92 デプロイ順・VERSION | OK |
| 1–2 | App16 検証受注作成（完了・納品待ち） | OK |
| 3 | App92 スケジュール表示（納品書前） | OK |
| 4 | App19 納品書作成（店舗+工場） | OK |
| 5 | App16 `delivery_no`/`delivery_date`／process・location・work 不変 | OK |
| — | 未明細は未同期／再実行 skip | OK |
| 6 | スケジュール除外 | OK |
| 7 | 店舗 → 納品待ち在庫 | OK |
| 8 | 工場 → 店舗未到着 | OK |
| 9 | 店舗移動後 → 納品待ち在庫 | OK |
| 10 | App97 入金・引き渡し → 納品済・在庫除外 | OK |
| 11 | 一部商品のみ納品＋二重同期防止 | OK |
| 12 | 法人（`Z9P0` TEST）納品済＋location／実法人 A545 非影響 | OK |
| — | 編集ガード | OK |

注: App19 の create.submit を CDP UI クリックで発火するとタブ遷移で切断されるため、納品書作成は **API + 本番デプロイ済み `CAYANAS_DeliveryCompleteSync` ヘルパー**で同期検証。イベント登録・ヘルパー配線は本番 JS 上で確認済み。

---

## 4. 結果サマリ（依頼 §完了報告）

| 項目 | 結果 |
|------|------|
| App19・App92 反映 | 両方 SUCCESS |
| 本番 E2E | **24/24 OK** |
| App16 同期 | A550: 納品待ち＋番号＋日付。process/location/work 不変 |
| App92 在庫表示 | 納品待ち在庫／店舗未到着／移動後切替／納品済除外 すべて OK |
| App97 引き渡し連携 | 納品済になり在庫から除外 |
| 法人納品処理 | TEST 法人は従来どおり納品済。実法人レコード revision 不変 |
| 残存リスク | 下記 |
| 一般公開 | **不可（別承認待ち）** |

---

## 5. 残存リスク

| リスク | 深刻度 | 備考 |
|--------|:------:|------|
| 過去 A550 の `delivery_no` 未連携がスケジュールに残る | 中 | 遡及バッチ未実施 |
| 納品書削除・明細除外の自動巻き戻しなし | 中 | edit guard + `A550_DELIVERY_CORRECTION_RUNBOOK.md` |
| UI 実クリック保存の自動 E2E 未実施 | 低 | 本番イベント配線はコード上確認。手動スモーク推奨 |
| JS は everyone 復元後に全ユーザーへ配信済み | 中 | 動作は限定検証済だが、一般公開宣言は未承認 |
| App8 `Z9P0` / App16 `TP0*` / App19 TEST 納品書が残存 | 低 | 検証残骸。削除は任意 |

---

## 6. 一般公開について

**現時点では一般公開を承認しない。**

必要な追加承認例:

1. 店舗向け運用アナウンス／マニュアル
2. 任意: 過去 A550 納品書の遡及 `delivery_no` 連携
3. App19 UI 保存の手動スモーク（1〜2件）
4. 問題時の rollback 実施責任者の確認
