# 入金管理 App 21 — V2 JavaScript

## ファイル

| ファイル | 役割 |
|----------|------|
| `payment_create.js` | 充当集計・請求書 App 35 同期・バリデーション |
| `payment_desktop.js` | 画面イベント・未入金請求取得・履歴表示 |

## App 21 のプラグインについて

**AYANAS Invoice（v7 系）** を App 21 に入れたままだと、旧入金画面向けに **取引先コードがグレー（編集不可）** になることがあります。

- **推奨:** App 21 では **Invoice プラグインを無効**（請求は App 35 のみで有効）
- どうしても両方必要な場合は `payment_desktop.js` がルックアップ欄を再有効化します（最新版を使用）

## kintone への設定（App 21）

1. **アプリの設定** → **JavaScript / CSSでカスタマイズ**
2. 次の順で **ファイルをアップロード**（順序重要。逆順だと動きません）  
   - `payment_create.js`  
   - `payment_desktop.js`
3. Console に `[PaymentCreateV2] loaded V2 2.0.8` が出ること（`PaymentCreate` は Invoice プラグイン用で別物）
4. 読込順: **Customize JS → プラグイン** のため、V2 は必ず **`PaymentCreateV2`** 名前空間を使用
3. **適用** → **アプリを更新**

## App 35 側の前提フィールド

同期 PUT で更新する項目（未作成の場合は App 35 に追加してください）。

| フィールドコード | 用途 |
|-----------------|------|
| `payment_amount` | 入金累計（現金＋手数料充当） |
| `discount_amount` | 値引累計 |
| `payment_status` | 未入金 / 一部入金 / 入金済 |
| `payment_balance` | 入金残高（任意・推奨） |
| `accounts_receivable` | 売掛残高（任意・推奨） |
| `collection_status` | 回収状況（任意） |
| `payment_date` / `last_payment_date` | 最終入金日（任意） |
| `balance` | 請求後残高（計算フィールドの場合は PUT 不要） |

`balance` が **計算フィールド** の場合、API 更新エラーになることがあります。そのときは `payment_create.js` の `syncInvoiceByNo` から `balance` 行を削除してください。

## 画面機能

- **未入金請求取得** … 取引先の請求済・未入金/一部入金を古い順に明細へ追加
- **充当案を作成** … 今回消込額を未回収請求へ古い順に按分（編集可能）
- **直近の入金履歴** … レコード下部に参照一覧（入金日降順）
- サブテーブル **内訳3列** … `setFieldShown` で非表示（定義は維持）
- 保存時 … 入金番号 `PYYMM-001` 採番、請求書へ再集計同期
- 同一取引先・同一日・同一入金額 … 警告（保存は可能）

## 請求書からの起動 URL 例

```
/k/21/edit?customer_code=XXXX&invoice_no=請求番号
```

新規画面で取引先と充当1行目をプリセットします。

## App ID

`payment_create.js` 先頭定数:

- `PAYMENT_APP_ID = 21`
- `INVOICE_APP_ID = 35`

環境が異なる場合のみ変更してください。

## 請求書 App 35 — 入金・繰越の再取得（再作成向け）

請求書ヘッダーの **入金額・繰越・前回請求額** を App 21 / 35 から最新化します（`PAYMENT_JS_VERSION` 2.0.17+ / `invoice_balance_desktop` 1.1.0+）。

### 意味（変更しない）

| 項目 | 意味 |
|------|------|
| `carry_over` | 直前の**請求済**（legacy「確定」含む）請求の税込請求額（gross）。残高ではない |
| `payment_amount` | その直前請求への App21 **充当合計**（cash+fee+discount）。請求対象期間では絞らない |
| 繰越額（印刷） | `carry_over − payment_amount` |
| 今回御請求額（印刷） | 繰越額 ＋ 今回売上（税込） |
| `balance` | `carry_over − payment_amount + invoice_amount` |

再計算は常に**絶対値上書き**（差分加算ではない）→ 再編集でも二重計上しない。

### 設定（App 35）

1. **JavaScript / CSSでカスタマイズ** に次の順で追加  
   - `payment_create.js`（App 21 と同じファイル）  
   - `invoice_balance_desktop.js`
2. **`display_last_invoice_amount`（前回請求額）** を App 35 に追加すると、再取得時に同値セット（**carry_over も同値**）。

### 動作

- 新規作成・編集画面表示時（`customer_code` あり）に自動再取得
- ボタン **「入金・繰越を再取得」**
- **未請求データ取込** 完了後に自動再取得
- **請求書作成** ボタン実行直前に再取得
- **請求先コード** 変更時に自動再取得
- **一括／月次作成**: `InvoiceCreate` / `BulkInvoiceCreate` をパッチし、得意先ごとに enrich（`carryOver = 0` 固定を廃止）

### 前回請求の判定

- 繰越ソース: `invoice_status ∈ {請求済, 確定}` の最新1件（自レコード除外）
- 未確定（`作成中` / `未請求`）はソースにしない。より新しい未確定があれば `skippedUnconfirmedPrior` を立て、確定済み直前を使用（無ければ繰越0）
- 新規得意先・請求済なし → 繰越0

例: 929,500 − 929,500 + 399,300 = **399,300**
