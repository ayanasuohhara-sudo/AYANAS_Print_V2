# 売掛管理 App 22 — セットアップ

## アプリ

- **App ID**: 22（`13_売掛一覧` → 表示名 **売掛管理** 推奨）
- **URL**: https://o5nppg7kb4ly.cybozu.com/k/22/

## フォーム（任意）

第1段階は JS のみで動作します。将来用に以下を追加可:

| フィールドコード | 型 |
|------------------|-----|
| `ar_dashboard_space` | スペース |
| `ar_admin_note` | 文字列（複数行） |

## JavaScript / CSS 登録順（App 22 のみ）

1. `customize/ar_config.js`
2. `customize/payment_create.js`（既存・変更なし）
3. `customize/ar_engine.js`
4. `customize/ar_desktop.js`
5. `customize/ar_index.css`（CSS ファイルとして）

**App 35 / App 21 には追加しない。**

## 権限

- App 22: 閲覧
- App 35 / App 21: 一覧・レコード GET 権限（売掛画面を開くユーザー）

## 動作確認

1. App 22 一覧を開く → 標準一覧は非表示、ダッシュボード表示
2. 売掛残高合計が App 35 請求済 + App 21 充当と一致するか数社で突合
3. ▶ ボタン → 請求別内訳（未回収のみ）
4. 請求番号リンク → App 35 詳細
5. **入金登録** → App 21 新規画面（下記）

## 第2段階 — 入金登録（App 21 連携）

請求別内訳の **【入金登録】**（未入金・一部入金のみ）から App 21 の新規画面を開きます。  
**App 21 の `payment_desktop.js` は変更しません。** 既存の URL プリセットを利用します。

```
/k/21/edit?customer_code={取引先コード}&invoice_no={請求番号}
```

| クエリ | フィールドコード（App 21） |
|--------|---------------------------|
| `customer_code` | `customer_code` |
| `invoice_no` | 充当サブテーブル `payment_allocation.invoice_no` へ1行追加 |

画面表示時に App 21 V2 が請求 App 35 を参照し、充当行へ **請求金額（`billing_target_amount`）・入金前残高（`balance_before`）** 等をセットします。担当者は **入金日・入金額・手数料・値引・入金方法** を入力して保存してください。

入金タブから売掛一覧に戻ると、一覧は自動再読込します（手動 **再読込** も可）。

### App 21 フィールド（実装確認済み・`payment_create.js` PAYMENT_FIELDS）

| 項目 | フィールドコード |
|------|------------------|
| 請求番号（充当） | `payment_allocation.invoice_no` |
| 取引先コード | `customer_code` |
| 取引先名 | `customer_name` |
| 請求金額（充当） | `payment_allocation.billing_target_amount` |
| 入金前残高 | `payment_allocation.balance_before` |
| 入金日 | `payment_date` |
| 入金額 | `payment_amount` |
| 手数料 | `fee` |
| 値引 | `discount_amount` |
| 入金方法 | `payment_method` |

過入金は App 21 保存時に **今回充当額 > 入金前残高** でエラー（保存不可）。文言は V2 既存のままです。

## 第3段階 — 請求ごとの入金履歴

請求別内訳の各行 **▶** で、その請求番号の App 21 入金のみ遅延取得して表示します（全件一括取得なし）。同一請求の再展開は画面内キャッシュを再利用します。**再読込**でキャッシュはクリアされます。

取得クエリ（充当サブテーブル）:

`payment_allocation.invoice_no = "{請求番号}"`（任意で `customer_code` も付与）

履歴1行の金額は **充当行**（`cash_allocation` / `fee_allocation` / `discount_allocation`）を使用し、請求内訳の集計（`aggregateInvoiceFromPayments`）と同一定義です。

## 定数

`ar_config.js`:

- `AR_APP_ID = 22`
- `INVOICE_APP_ID = 35`
- `PAYMENT_APP_ID = 21`
