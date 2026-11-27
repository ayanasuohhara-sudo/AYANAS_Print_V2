# 店舗入金管理 S1 — 実装報告（v1.1）

- **日付**: 2026-11-01（Asia/Tokyo）
- **範囲**: App97 + リポジトリ JS（会計画面・引き取り・日次照合まで）
- **本番 JS 反映**: **未実施**（最終確認: [`STORE_PAYMENT_S1_PREPROD_CHECKLIST.md`](./STORE_PAYMENT_S1_PREPROD_CHECKLIST.md)）
- **実顧客データ登録・変更**: **未実施**
- **版**: v1.1.1-s1（POST 後過剰充当の自動取消を追加）

---

## 1. アプリ

| 項目 | 値 |
|------|-----|
| アプリ名 | 店舗入金管理 |
| App ID | **97** |
| URL | https://o5nppg7kb4ly.cybozu.com/k/97/ |

フィールド一覧: [`STORE_PAYMENT_S1_FIELDS.json`](./STORE_PAYMENT_S1_FIELDS.json)

---

## 2. 確定した金額・紐付け仕様

```text
ex  = Σ App16.detail_table.amount（受注単位・税抜）
tax = Math.round(ex * 0.10)
in  = ex + tax   ← 入金・残額・充当の正
```

- 紐付け: **App96 `personal_customer_id` + App16 `$id`（order_record_id）**
- `manage_no` はバーコード検索用。氏名のみでは入金対象を確定しない
- スマレジ: **API なし**。会計後に S1 手入力。日次照合は手入力金額と比較

---

## 3. JavaScript（本番未反映）

読込順:

1. `store_payment_config.js`（v1.1.0-s1, APP_ID=97）
2. `store_payment_engine.js` — 税込・残額・充当・引き取り PUT・日次集計
3. `store_payment_numbering.js` — `SP-YYMMDD-######`
4. `store_payment_api.js` — 検索 / 入金 POST / 引き取り / 照合
5. `store_payment_desktop.js` — レコード画面ガード
6. `store_payment_ui.js` — **一覧の店舗会計画面**
7. `store_payment.css`

### 店舗会計画面（App97 一覧）

| 機能 | 内容 |
|------|------|
| バーコード | `manage_no` → 当該商品 + 同一個人の未精算一覧 |
| 顧客ID | PCM / App16 から未納品済一覧 |
| 氏名検索 | 候補表示のみ。選択で ID 確定 |
| 複数選択一括会計 | 充当合計 = 入金額。入金済は選択不可 |
| 入金登録 | S1 POST。`transaction_id` 冪等。失敗時 App16 非更新 |
| 引き取り完了 | 入金確認後。`delivery_status=納品済` のみ（location/process/work 不変） |
| 日次照合 | 当日 S1 有効入金合計 vs スマレジ手入力 |

### App92 整合

引き取りで `delivery_status=納品済` にするため、納品待ち在庫・スケジュール双方から除外される（現行 App92 は納品済除外）。S1 は `delivery_no` を書き換えない。

---

## 4. テスト結果

| 種別 | 結果 |
|------|------|
| `node scripts/test_store_payment_s1.js` | **49/49 OK** |
| 本番 JS 反映後 E2E | **未実施**（承認後） |
| 実スマレジ突合 | **未実施** |

カバレッジ（単体）: 税計算、一部入金、再入金禁止、複数充当、返金必須、txid、バーコード正規化、会計行、引き取り PUT 形、日次照合一致/不一致、重複明細禁止。

---

## 5. 既存システム保護

| 対象 | 方針 |
|------|------|
| App21 | 変更なし |
| App19 | 変更なし（法人処理維持） |
| App16 採番・工程 JS | 変更なし。引き取り時のみ delivery 系 PUT |
| App96 | 参照のみ |
| App8 / App35 | 変更なし |

---

## 6. 未解決・次承認

1. App97 への **本番 JS/CSS デプロイ**
2. テスト顧客での E2E（バーコード〜入金〜引き取り〜照合）
3. スマレジ CSV 取込（現状は手入力）
4. App19 A550 納品書→スケジュール除外（別提案 `A550_DELIVERY_SCHEDULE_INVENTORY_PROPOSAL.md`）との本番同時適用タイミング

---

## 7. 開発順序との対応

| # | 方針 | 状態 |
|---|------|------|
| 1 | フィールド・税仕様確定 | **完了** |
| 2 | 入金登録・商品別充当 | **完了**（エンジン+API） |
| 3 | バーコード・顧客検索画面 | **完了**（`store_payment_ui.js`） |
| 4 | 引き取り完了 | **完了**（API+UI） |
| 5 | 日次入金照合 | **完了**（手入力比較） |
| 6 | 総合テスト | 単体完了 / 本番 E2E は承認後 |
