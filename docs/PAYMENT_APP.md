# 入金管理アプリ Version 1.0

請求書作成アプリ（App 35）と連携し、請求書ごとの入金を手入力で管理する。

V1.0 では銀行 API 連携・通帳取込は行いません。

---

## アプリ構成

| アプリ | App ID | 役割 |
|--------|--------|------|
| 請求書作成 | 35 | 請求データ・入金状況の更新先 |
| 入金管理 | **36** | 入金レコードの登録 |

App ID は `js/payment_create.js` の定数で変更可能。

---

## フォーム構成

### ヘッダー

| フィールド名 | フィールドコード | 種類 |
|-------------|----------------|------|
| 入金番号 | payment_no | 文字列1行 |
| 入金日 | payment_date | 日付 |
| 請求番号 | invoice_no | ルックアップ / 文字列 |
| 請求先コード | customer_code | 文字列 |
| 請求先名 | customer_name | 文字列 |
| 入金方法 | payment_method | ドロップダウン |
| 銀行名 | bank_name | 文字列1行 |
| 入金額 | payment_amount | 数値 |
| 手数料 | fee | 数値 |
| 実入金額 | received_amount | 数値 |
| 備考 | remarks | 複数行 |

### サブテーブル payment_detail

| フィールド名 | フィールドコード |
|-------------|----------------|
| 請求番号 | invoice_no |
| 請求日 | invoice_date |
| 請求金額 | invoice_amount |
| 今回入金額 | current_payment |
| 売掛残高 | accounts_receivable |

---

## 処理フロー

```
入金レコード新規作成
  ↓
請求番号（invoice_no）を選択
  ↓
請求書作成アプリ（App 35）から請求書情報を取得
  ↓
請求先・payment_detail（請求金額）を自動表示
  ↓
入金額（payment_amount）・手数料（fee）を手入力
  ↓
実入金額・売掛残高を自動計算
  ↓
保存
  ↓
同一請求番号の入金を集計し、請求書アプリを更新
  ・payment_amount（累計）
  ・accounts_receivable
  ・payment_status（未入金 / 一部入金 / 入金済）
```

---

## 計算式

| 項目 | 計算式 |
|------|--------|
| 実入金額 | `payment_amount − fee` |
| 明細・売掛残高 | `invoice_amount − 既入金累計 − 今回入金額` |
| 請求書・累計入金 | 入金管理アプリの同一 `invoice_no` の `payment_amount` 合計 |
| 請求書・売掛残高 | `invoice_amount − 累計入金` |
| 入金状況 | 累計 0 → 未入金 / 累計 < 請求額 → 一部入金 / 累計 ≥ 請求額 → 入金済 |

---

## プラグインファイル

| ファイル | 内容 |
|----------|------|
| `js/payment_create.js` | 請求書取得・残高計算・請求書更新 |
| `js/payment_desktop.js` | 画面イベント（請求番号変更・金額変更・保存後連携） |

---

## テスト方法

1. App 36 にフィールドを作成し、プラグインをインストール
2. 請求書（App 35）に確定済みの請求レコードを用意
3. 入金管理で請求番号を選択 → 請求情報が表示されることを確認
4. 入金額を入力 → 売掛残高が再計算されることを確認
5. 保存 → 請求書の `payment_amount` / `accounts_receivable` / `payment_status` が更新されることを確認
