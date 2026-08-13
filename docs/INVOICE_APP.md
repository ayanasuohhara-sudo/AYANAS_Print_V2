# 請求書作成アプリ Version 1.0

納品書（App 19）を締日・請求締年月・請求先コードで集計し、請求書（App 35）を作成する。

---

## アプリ構成

| アプリ | App ID | URL |
|--------|--------|-----|
| 納品管理 | 19 | — |
| 請求書作成 | 35 | https://o5nppg7kb4ly.cybozu.com/k/35/ |

---

## 請求書作成アプリ（App 35）フィールド

### ヘッダー

| フィールド名 | フィールドコード | 種類 |
|-------------|----------------|------|
| 請求番号 | invoice_no | 文字列1行 |
| 請求日 | invoice_date | 日付 |
| 締日 | closing_date | ドロップダウン（下記選択肢） |
| 支払期限 | due_date | 日付 |
| 請求先コード | customer_code | ルックアップ |
| 請求先名 | customer_name | 文字列 |
| 請求状態 | invoice_status | ドロップダウン |
| 確定日時 | confirmed_at | 日時 |
| 確定者 | confirmed_by | 文字列 |
| 前回請求残高 | carry_over | 数値 |
| 今回請求額 | invoice_amount | 数値 |
| 請求後残高 | balance | 数値 |
| 備考 | remarks | 複数行 |
| 請求締年月 | closing_ym | 文字列（YYYY-MM） |
| 請求対象期間（開始） | billing_from | 日付 |
| 請求対象期間（終了） | billing_to | 日付 |

### 入金管理連携フィールド（V1.0 定義のみ）

| フィールド名 | フィールドコード | 種類 | 備考 |
|-------------|----------------|------|------|
| 入金予定日 | payment_due_date | 日付 | |
| 入金日 | payment_date | 日付 | |
| 入金金額 | payment_amount | 数値 | |
| 入金残高 | payment_balance | 数値 | 請求額 − 入金金額 |
| 入金状況 | payment_status | ドロップダウン | 未入金 / 一部入金 / 入金済 |
| 入金メモ | payment_note | 文字列（複数行） | |

**入金状況（payment_status）選択肢:** `未入金` / `一部入金` / `入金済`

**入金残高（payment_balance）計算式:**

```
payment_balance = invoice_amount - payment_amount
```

V1.0 では自動入金処理は行いません。フィールドコードは請求書印刷でも使用するため変更しません。

### 今後利用する機能（入金管理アプリ連携）

- 入金登録時に `payment_date` / `payment_amount` を更新
- `payment_balance` / `payment_status` の自動再計算
- 入金状況の自動判定（未入金 / 一部入金 / 入金済）
- 請求書印刷への入金情報表示

---

## 売掛管理（V1.0 定義のみ）

| フィールド名 | フィールドコード | 種類 | 備考 |
|-------------|----------------|------|------|
| 売掛残高 | accounts_receivable | 数値 | 税込請求額 − 入金金額 |
| 回収期限超過日数 | overdue_days | 数値 | 支払期限超過日数 |
| 回収状況 | collection_status | ドロップダウン | 未回収 / 一部回収 / 回収済 |
| 最終入金日 | last_payment_date | 日付 | |

**売掛残高:** `accounts_receivable = invoice_amount（または total）− payment_amount`

**回収期限超過日数:** `due_date` を超えた日数（超過なしは 0）

**回収状況:** 売掛残高・入金金額から判定（V1.0 はプラグイン表示用に算出）

V1.0 では表示のみ。入金管理アプリ完成後にフィールドへ自動反映します。

一覧の「売掛残高順」ボタンで `accounts_receivable` 降順に並び替えできます。

---

## 締日仕様（V1.0）

### 顧客管理アプリ（App 17）

| フィールド | コード |
|-----------|--------|
| 締日 | closing_day |

**選択肢:** `10日締め` / `15日締め` / `20日締め` / `30日締め` / `月末締め` / `都度払い` / `10・20・月末締め`

### 月次請求処理（請求書 closing_date + closing_ym）

| 実行締日 | 対象顧客 | 請求期間 |
|---------|---------|----------|
| 10日締め | 10日締め / 10・20・月末締め | 前月11日 ～ 当月10日 |
| 15日締め | 15日締め | 前月16日 ～ 当月15日 |
| 20日締め | 20日締め / 10・20・月末締め | 当月11日 ～ 当月20日 |
| 30日締め | 30日締め | 前回締日翌日 ～ 当月30日 |
| 月末締め | 月末締め / 10・20・月末締め | 当月21日 ～ 月末 |
| 都度払い | 都度払い | 納品書1件ごと |

`closing_ym` = 処理対象月。期間は `billing_from` / `billing_to` に自動設定。

### 集計フィールド

| フィールド名 | フィールドコード |
|-------------|----------------|
| 点数 | item_count |
| 数量合計 | qty_total |
| 税抜合計 | subtotal |
| 消費税 | tax |
| 税込合計 | total |

### サブテーブル invoice_detail

| フィールド名 | フィールドコード |
|-------------|----------------|
| 納品番号 | delivery_no |
| 納品日 | delivery_date |
| 管理番号 | manage_no |
| お客様名 | client_name |
| 着物種類 | kimono_type |
| 仕様 | kimono_spec |
| 加工内容 | item_name |
| 数量 | qty |
| 単価 | unit_price |
| 金額 | amount |
| 伝票番号 | slip_no |
| 担当者 | in_charge |

※ `slip_no` / `in_charge` は納品書ヘッダーから明細行へ展開する。

---

## 納品管理（App 19）追加フィールド

| フィールドコード | 種類 | 備考 |
|----------------|------|------|
| billing_status | ドロップダウン | 選択肢: `未請求` / `請求済` |
| invoice_flag | チェックボックス | 選択肢: `請求済`（V1.1 請求済更新用・レガシー） |

`billing_status` が未設定のレコードは `invoice_flag` 未チェックを未請求として扱います。

---

## 未請求データ取込（V1.0）

### 抽出条件

- `customer_code` = 請求書の `customer_code`
- `invoice_status` = `未請求`（`invoice_no` 未設定）
- `delivery_date` が請求対象期間内（都度払いは1件のみ）
- 請求対象期間は顧客マスタの `closing_day` と `closing_ym` から自動計算（10・20・月末締めは `closing_date` 選択必須）

### 処理

1. `invoice_detail` を空にする
2. 納品明細を `invoice_detail` へ追加
3. `item_count` / `qty_total` / `subtotal` / `tax`（10%）/ `total` / `invoice_amount` を自動計算
4. V1.0 では納品管理アプリへの書き戻しは行わない

### エラー

対象データ 0 件の場合: `請求対象データがありません。`

---

## 集計ロジック（参考）

税計算は従来どおり（税抜10%）。締日による請求期間は上記「締日仕様」を参照。

### 自動設定（未請求データ取込ボタン）

| フィールド | 内容 |
|-----------|------|
| closing_ym | 請求締年月 |
| customer_name | 納品書から取得 |
| invoice_detail | 納品明細を展開 |
| item_count | 明細行数 |
| qty_total | 数量合計 |
| subtotal / tax / total | 税計算（10%） |
| invoice_amount | 税込合計 |

V1.0 では保存時の納品書 `billing_status` 更新は行いません。

### 保存前バリデーション（V1.0）

保存ボタン押下時（`create.submit` / `edit.submit`）に検証。未入力・不正値がある場合は保存を中止する（自動補完なし）。

| 項目 | 条件 | エラーメッセージ |
|------|------|----------------|
| customer_code | 未入力 | 請求先を入力してください。 |
| customer_name | 未入力 | 請求先名を入力してください。 |
| invoice_date | 未入力 | 請求日を入力してください。 |
| closing_date | 未入力 | 締日を入力してください。 |
| invoice_detail | 0件 | 請求明細がありません。 |
| subtotal | 0以下 | 税抜合計が0円です。 |
| total | 0以下 | 税込合計が0円です。 |

複数エラーは改行区切りで表示。

### 請求番号自動採番（V1.0）

| 項目 | 内容 |
|------|------|
| 形式 | `YYMM-001`（例: 2026-08-13 → `2608-001`） |
| タイミング | 保存時（`create.submit` / `edit.submit`） |
| 条件 | `invoice_no` が空欄の場合のみ採番 |
| 重複防止 | 保存直前に再検索し、重複時は再採番（最大10回） |
| エラー | `請求番号を採番できませんでした。` |
| 編集 | V1.0 では `invoice_no` は画面で変更不可（保存時のみ設定） |

**検索クエリ（最大連番取得）:**

```
invoice_no like "2608-%" order by invoice_no desc limit 500 offset {n}
```

### 請求書作成ボタン

| フィールド | 内容 |
|-----------|------|
| invoice_no | `YYMM-001` 形式で自動採番 |
| invoice_date | 今日の日付 |
| invoice_amount | total と同値 |
| balance | carry_over + invoice_amount - payment_amount |
| invoice_status | `作成中` |
| closing_ym | invoice_date から `YYYY-MM` |

保存成功時に「請求書を作成しました。」を表示。

### 請求確定ボタン

**実行条件:** `invoice_status` = `作成中` のみ

**確認メッセージ:**

```
請求書を確定します。

確定後は対象納品書が
「請求済」となります。

よろしいですか？
```

| 対象 | 更新内容 |
|------|----------|
| 請求書（App 35） | `invoice_status` = 確定 / `confirmed_at` = 現在日時 / `confirmed_by` = ログインユーザー |
| 納品管理（App 19） | `invoice_status` = 請求済 / `invoice_no` / `invoice_date` |

`invoice_detail.delivery_no` をキーに納品書を検索して更新。更新失敗時は請求書を確定せず、失敗した `delivery_no` を一覧表示。

V1.0: 印刷・入金管理の更新は行わない。

---

## 請求書一覧（V1.0）

### 一覧レイアウト（kintone 一覧設定）

以下のフィールドを表示してください。

| 表示順 | フィールド |
|--------|-----------|
| 1 | invoice_no（請求番号） |
| 2 | invoice_date（請求日） |
| 3 | customer_code（請求先コード） |
| 4 | customer_name（請求先名） |
| 5 | closing_date（締日） |
| 6 | due_date（支払期限） |
| 7 | item_count（点数） |
| 8 | subtotal（税抜合計） |
| 9 | tax（消費税） |
| 10 | total（税込合計） |
| 11 | payment_status（入金状況） |
| 12 | invoice_status（請求状態） |
| 13 | accounts_receivable（売掛残高） |
| 14 | overdue_days（回収期限超過日数） |
| 15 | collection_status（回収状況） |
| 16 | last_payment_date（最終入金日） |

**並び替え:** 請求日順（デフォルト）/ 売掛残高順（プラグインボタン）

### 絞り込み・色分け・集計

一覧上部にプラグインが以下を表示します。

- 絞り込みボタン（未入金 / 一部入金 / 入金済 / 作成中 / 確定）
- 集計（請求件数 / 請求金額合計 / 未入金金額合計 / 売掛残高合計）
- 並び替え（請求日順 / 売掛残高順）
- 入金状況による行の色分け（未入金=赤 / 一部入金=オレンジ / 入金済=緑）

---

## テスト方法（V1.0）

1. App 35 にプラグインをインストール
2. 納品管理（App 19）に `billing_status` フィールドを追加（未請求 / 請求済）
3. 請求書新規レコードで以下を入力:
   - **customer_code**: 請求先コード（ルックアップ）
   - **closing_ym**: 請求締年月（例: `2026-08`）
   - **closing_date**: 月次請求処理の締日（例: `10日締め`）
4. 「**未請求データ取込**」をクリック
5. 明細・点数・税計算を確認
6. ブラウザ開発者ツールのコンソールで以下を確認:
   - `取得件数`
   - `subtotal`
   - `tax`
   - `total`
7. 「**請求書作成**」をクリック → 請求番号・請求日等がセットされる
8. 保存 →「請求書を作成しました。」を確認
9. 納品管理の `billing_status` / `invoice_flag` は変更されない（V1.0）

---

## 税計算

```
税抜合計 = 明細 amount の合計
消費税   = round(税抜合計 × 0.10)
税込合計 = 税抜合計 + 消費税
```
