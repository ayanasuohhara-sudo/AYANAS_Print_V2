# P0 完了報告 — 店舗A550 納品書・納期・在庫連携（コード＋単体テスト）

- **作成**: 2026-11-01（Asia/Tokyo）
- **承認範囲**: コード実装・単体テストまで
- **未実施（別途承認）**: 本番 JS/CSS 反映、App16 フィールド追加・変更、実データ更新

---

## 1. 変更ファイル一覧

| ファイル | 内容 |
|----------|------|
| `customize/delivery_complete_sync.js` | A550 店舗同期（`planStoreOrderSync` / `buildStoreOrderUpdate` / `syncStoreOrders`）。法人経路は不変 |
| `customize/delivery_a550_edit_guard.js` | **新規**。A550＋`delivery_no` ありの編集時警告・保存確認 |
| `customize/store_deadline_config.js` | v1.1.0。KPI「納品待ち在庫」「店舗未到着」、`delivery_no`/`delivery_date` フィールド |
| `customize/store_deadline_engine.js` | スケジュール除外（納品済 or `delivery_no` 非空）、在庫判定、保管日数 |
| `customize/store_deadline_desktop.js` | KPI＋在庫テーブル（管理番号リンク・納品書番号・保管日数） |
| `customize/store_deadline.css` | `is-warn` トーン |
| `scripts/test_delivery_a550_store_sync.js` | **新規**。店舗同期・二重登録・edit guard |
| `scripts/test_store_deadline_engine.js` | 在庫 KPI・除外条件の断言追加 |
| `scripts/test_delivery_sync_and_blank_row.js` | A550 店舗同期ルートの回帰 |
| `docs/A550_DELIVERY_CORRECTION_RUNBOOK.md` | **新規**。管理者向け訂正手順 |
| `docs/A550_P0_IMPLEMENTATION_REPORT.md` | 本報告 |
| `docs/STORE_OPS_NEXT_STAGE_STATUS.md` | P0 実装済ステータス更新 |

---

## 2. 追加フィールドの有無

**本番 App16 へのフィールド追加は不要。**

バックアップ `fields.json`（cutover 2026-11-01）で確認済み:

| コード | 型 | ラベル | 備考 |
|--------|-----|--------|------|
| `delivery_status` | DROP_DOWN | 納品状態 | 納品待ち / 納品済 / 未納品 |
| `delivery_no` | SINGLE_LINE_TEXT | 納品番号 | スケジュール除外キー |
| `delivery_date` | DATE | 納品日 | 保管日数の起算 |

新規フィールド案は **なし**（提案どおり既存コードを利用）。

---

## 3. テスト結果

実行（ローカル Node、本番 API なし）:

```text
node scripts/test_store_deadline_engine.js     → All store deadline tests passed.
node scripts/test_delivery_a550_store_sync.js  → All A550 store sync tests passed.
node scripts/test_delivery_sync_and_blank_row.js → all passed
```

| シナリオ（単体） | 結果 |
|------------------|:----:|
| A550 納品書保存相当 → PUT 内容 | OK（納品待ち＋番号＋日付） |
| process/location/work 非送信 | OK |
| App16 納品書番号反映判定 | OK |
| 納期スケジュールから `delivery_no` 除外 | OK |
| 納品待ち在庫（店舗のみ） | OK |
| 工場＝店舗未到着、店舗在庫非表示 | OK |
| 店舗移動後は waitingStock | OK（判定関数） |
| 納品済は在庫除外（App97 相当） | OK |
| 二重登録・別番号 warn | OK |
| 法人 PUT は従来どおり | OK |
| 複数商品・一部のみ明細 | 同期は明細 manage_no 単位（既存ループ） |

本番 E2E・実データ検証は **未実施**（承認範囲外）。

---

## 4. App19 法人処理への影響

| 項目 | 結果 |
|------|------|
| `isCorporateCustomer` 分岐 | 維持。法人のみ `syncCorporateOrders` |
| 法人 PUT | `location_status=納品済`, `delivery_status=納品済`, 日付・番号 |
| 法人の完了前提スキップ | 維持 |
| A550 | 別経路 `syncStoreOrders` のみ。法人関数を呼ばない |

---

## 5. App92 表示条件

| 画面／KPI | 条件（A550・取消以外） |
|-----------|------------------------|
| 月次カレンダー・納期 KPI | `delivery_status ≠ 納品済` **かつ** `delivery_no` 空 |
| 完了・納品待ち（ready） | 従来: 完了 ∧ 納品待ち（location / delivery_no なし）※スケジュール除外とは独立 |
| **納品待ち在庫** | 完了 ∧ `location=店舗` ∧ 納品待ち ∧ `delivery_no` 非空 ∧ 非納品済 |
| **納品書済・店舗未到着** | `delivery_no` 非空 ∧ 非納品済 ∧ `location ≠ 店舗` |
| 法人 | 顧客フィルタが A550 のみのため **表示対象外（従来どおり）** |

App97 で `delivery_status=納品済` になると両在庫一覧から除外。入金・引き渡し JS 自体は未変更。

---

## 6. 本番反映手順（別途承認後）

1. **App16**: フィールド追加不要。権限変更が必要なら別チケット
2. **App19 デスクトップ JS**  
   - 既存 `delivery_complete_sync.js` を本リポジトリ版に置換  
   - **新規** `delivery_a550_edit_guard.js` を追加（sync の後推奨）  
   - 任意: スペースフィールド `a550_edit_warning`（無くても console + confirm）
3. **App92**  
   - `store_deadline_config.js` / `engine` / `desktop` / `store_deadline.css` を v1.1.0 相当で更新  
   - 読込順: config → engine → desktop（従来どおり）＋ CSS
4. ステージングまたは限定ユーザーで §7 相当のスモーク
5. 問題なければ一般公開。失敗時は当該ファイルを直前バックアップへ戻す

**実データの一括更新（過去 A550 納品書の遡及連携）は本 P0 に含めない。** 必要なら別承認。

---

## 7. 残存リスク

| リスク | 深刻度 | 緩和 |
|--------|:------:|------|
| 納品書明細削除・削除レコードで App16 が残る | 中 | edit guard 警告＋訂正 runbook |
| 過去 A550 で `delivery_no` 未連携のまま | 中 | スケジュールに残り続ける。遡及バッチは未実装 |
| ready KPI と waitingStock の意味差 | 低 | 画面ラベルで区別。ready は従来条件を維持 |
| スペース `a550_edit_warning` 未作成 | 低 | confirm は動作。表示文言は console |
| 本番未デプロイのため E2E 未確認 | 高（運用前） | 反映承認後にスモーク必須 |
| manage_no 重複レコード | 中（既存） | 更新停止＋アラート（法人と同型） |

---

## 8. 実装範囲の境界

| 実施 | 未実施（別承認） |
|------|------------------|
| リポジトリ JS/CSS/単体テスト/ドキュメント | 本番 JS/CSS アップロード |
| App16 既存フィールド利用の確認 | App16 スキーマ変更・実レコード更新 |
| App97 整合は表示条件のみ | App97 入金・引き渡しコード変更 |
| 訂正 runbook | 自動巻き戻し |
