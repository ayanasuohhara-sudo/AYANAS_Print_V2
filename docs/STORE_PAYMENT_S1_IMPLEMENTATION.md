# 店舗入金管理 S1 — 完了報告

- **日付**: 2026-11-01（Asia/Tokyo）
- **範囲**: 新規 App 作成 + リポジトリ JS/単体テスト。**本番 JS 反映・実顧客データ登録は未実施**（別途承認待ち）

---

## 1. 新規 S1 アプリ ID

| 項目 | 値 |
|------|-----|
| アプリ名 | 店舗入金管理 |
| **App ID** | **97** |
| URL | https://o5nppg7kb4ly.cybozu.com/k/97/ |
| 本番 JS | **未反映** |

---

## 2. フィールド一覧

### ヘッダ

| コード | ラベル | 種類 |
|--------|--------|------|
| `store_payment_no` | 入金番号 | 文字列1行（unique） |
| `personal_customer_id` | 個人顧客ID | 文字列1行（必須） |
| `client_name_snapshot` | お客様名（当時） | 文字列1行 |
| `payment_date` | 入金日 | 日付（必須） |
| `payment_amount` | 入金額 | 数値（必須） |
| `payment_method` | 入金方法 | DROP_DOWN |
| `pos_transaction_id` | スマレジ取引番号 | 文字列1行 |
| `payment_staff` | 担当者 | ユーザー選択（必須） |
| `transaction_id` | 処理ID | 文字列1行（unique・必須） |
| `payment_status` | 入金処理状態 | DROP_DOWN（有効/取消/返金済） |
| `payment_channel` | 入金チャネル | DROP_DOWN |
| `payment_timing` | 入金タイミング | DROP_DOWN |
| `record_kind` | レコード種別 | DROP_DOWN（入金/返金） |
| `related_refund_of` | 返金元入金番号 | 文字列1行 |
| `cancel_reason` | 取消・返金理由 | 複数行 |
| `cancel_datetime` | 取消日時 | 日時 |
| `unpaid_handover_approved` | 未収入金引き渡し承認 | CHECK_BOX |
| `notes` | メモ | 複数行 |
| `store_payment_lines` | 入金充当明細 | サブテーブル |

### 明細（`store_payment_lines`）

| コード | ラベル |
|--------|--------|
| `order_record_id` | App16レコードID |
| `manage_no` | 管理番号 |
| `personal_customer_id_line` | 個人顧客ID（行） |
| `kimono_type_snapshot` | 着物種類（当時） |
| `billed_ex_tax` | 請求税抜（スナップショット） |
| `billed_amount` | 請求税込（スナップショット） |
| `allocated_amount` | 今回充当額 |
| `previously_paid_amount` | 充当前累計入金 |
| `balance_after_line` | 充当後残額 |
| `line_note` | 行メモ |

詳細 JSON: [`STORE_PAYMENT_S1_FIELDS.json`](./STORE_PAYMENT_S1_FIELDS.json)

---

## 3. JavaScript ファイル

| ファイル | 役割 | 本番反映 |
|----------|------|----------|
| `customize/store_payment_config.js` | 定数・`STORE_PAYMENT_APP_ID=97`・税設定 | 未 |
| `customize/store_payment_engine.js` | 税込・残額・バリデーション・txid | 未 |
| `customize/store_payment_numbering.js` | `SP-YYMMDD-######` 採番 | 未 |
| `customize/store_payment_desktop.js` | レコード画面ガード（店舗 UI は次段） | 未 |
| `customize/store_payment.css` | バナー样式 | 未 |
| `scripts/test_store_payment_s1.js` | 単体テスト | — |
| `scripts/_create_store_payment_s1_app.js` | App 作成用 CDP スクリプト | — |

読込順: config → engine → numbering → desktop → css

---

## 4. 税計算仕様

```text
ex  = Σ App16.detail_table.amount（受注単位・税抜）
tax = Math.round(ex * 0.10)
in  = ex + tax
```

入金・残額・充当の正は **税込 `in`**。詳細: [`STORE_PAYMENT_S1_TAX_CONFIRMATION.md`](./STORE_PAYMENT_S1_TAX_CONFIRMATION.md)

---

## 5. テスト結果

| 種別 | 結果 | 備考 |
|------|------|------|
| 単体 `scripts/test_store_payment_s1.js` | **25/25 OK** | 税・残額・充当一致・再入金禁止・返金必須・差額検出・txid |
| 本番 App97 フィールド検証 | **OK** | unique(`store_payment_no`,`transaction_id`)、サブテーブルあり、JS 件数 0 |
| 本番 E2E（実データ） | **未実施** | 別途承認後 |
| 本番 JS 反映 | **未実施** | 別途承認後（承認条件どおり） |
| 複数端末同時操作 | **未実施** | JS 反映後に実施 |

---

## 6. 未解決事項

1. スマレジ店舗の税丸め実機確認（S1 は印刷同型 round で固定）
2. App97 への本番 JS/CSS デプロイ承認
3. レイアウト調整・権限・一覧ビューの業務最適化
4. 本番 E2E（テスト顧客のみ想定）と同時操作検証
5. 店舗専用会計 UI（次段階）

---

## 7. 次の店舗専用画面との連携仕様

店舗 UI（次段）は S1 をバックエンドとして使う。

| 店舗 UI 操作 | S1 / 周辺 |
|--------------|-----------|
| 顧客検索 | App96 `personal_customer_id`（氏名のみで入金対象を決めない） |
| 受注一覧 | App16 GET（`personal_customer_id` + 未納品等）。識別子は **`$id`（order_record_id）**。`manage_no` はバーコード検索用 |
| 税込・残額表示 | `store_payment_engine.getOrderBilledInclusive` / `getOrderBalance` |
| 複数商品一括入金 | 1 ヘッダ + `store_payment_lines` 複数行。充当合計 = `payment_amount` |
| 入金登録 | S1 POST。`transaction_id` unique。失敗時は引き取り完了へ進まない |
| 一部入金 | 可。ただし `canPickupWithBalance` は残額>0 で原則 NG（`unpaid_handover_approved` のみ例外） |
| 返金 | `record_kind=返金`・負額・`related_refund_of` 必須 |
| 取消 | `payment_status=取消`（履歴残置）。返金と区別 |
| App8/19/21/35 | **変更しない** |

---

## 変更しないアプリ

App8 / App19 / App21 / App35 — 本フェーズで未変更。
