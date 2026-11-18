# 売掛管理アプリ — フォーム仕様・集計設計（第1段階）

**Version**: 0.2（JS 未実装）  
**売掛管理 App ID**: **22**（https://o5nppg7kb4ly.cybozu.com/k/22/）  
**正データ**: App 35（請求）＋ App 21（入金 V2）  
**定数**: `AR_APP_ID=22`, `INVOICE_APP_ID=35`, `PAYMENT_APP_ID=21`  
**方針**: 参照専用。App 35 / App 21 は変更しない。  
**App 22 移行・フィールド整理**: `docs/AR_APP22_SPEC.md` を正とする。

---

## 0. App ID（確定）

**App 37 は使用しない。** 売掛管理は **App 22** 専用。

---

## 0b. （旧）App 37 の存在・用途確認

### 0.1 リポジトリ上の設計

| ソース | 内容 |
|--------|------|
| `docs/02_AppList.md` | App **37** = **売掛一覧**（読取専用ダッシュボード） |
| `docs/RECEIVABLE_APP.md` | App 37 向けフォーム・一覧の参照設計（プラグイン未実装） |
| `js/desktop.js` | `RECEIVABLE_APP_ID = 37`（印刷プラグイン定数のみ） |
| テンプレートエクスポート | **`_tmp_app37_*` なし** → 実フォーム定義はリポジトリ未同梱 |

**結論（設計）**: App ID **37** は AYANAS 設計上 **売掛管理（旧称: 売掛一覧）** 用として予約されている。

### 0.2 実 kintone 環境での確認（実施必須）

エージェントから貴社 kintone には接続できないため、**アプリ作成前**に次のいずれかで確認してください。

**方法 A — 管理画面**

1. kintone 管理 → アプリ → アプリ ID で **37** を検索  
2. アプリ名・説明・レコード有無・他業務との混在を確認  

**方法 B — ブラウザコンソール（kintone ログイン済み同一ドメイン）**

```javascript
kintone.api(kintone.api.url('/k/v1/app', true), 'GET', { id: 37 })
  .then((r) => console.log(r.name, r.description))
  .catch((e) => console.error(e));
```

### 0.3 分岐

| 結果 | 対応 |
|------|------|
| App 37 が存在し、**売掛・一覧・ダッシュボード系**（または空のプレースホルダ） | **App 37 を売掛管理として使用**。下記フォームを追加・整理（既存フィールドと衝突する場合はマージ表を別途） |
| App 37 が **別業務**（受発注・マスタ等）で使用中 | **新規アプリ「売掛管理」** を作成。`ar_config.js` の `AR_APP_ID` のみ差し替え |
| App 37 が **存在しない** | **新規「売掛管理」** を作成。設計上 ID 37 を取れるなら 37 推奨、不可なら付与 ID を `ar_config.js` に記録 |

**アプリ名（表示）**: `売掛管理`（サブタイトル: 請求 App35・入金 App21 参照）

---

## 1. アプリの役割とレコード運用

| 項目 | 仕様 |
|------|------|
| データの正 | **保存しない**。常に App 35 + App 21 から再計算 |
| レコード | **第1段階ではレコード登録不要**（一覧画面のみカスタム UI） |
| 更新 | JS から App 35 / App 21 へ **PUT/POST しない** |
| 権限 | 閲覧者: 一覧表示のみ / 管理者: JS・設定用フィールド編集可（任意） |

将来（第5段階）月次スナップショット用フィールドは **§8 予約** に記載。第1段階では **未作成可**。

---

## 2. フォーム構成（第1段階・最小）

一覧カスタマイズのため、**ヘッダーはスペース＋説明のみ**で足りる。

### 2.1 レイアウト（1 行）

| 順 | 種別 | ラベル | フィールドコード | 必須 | 初期値 | 入力 | 備考 |
|----|------|--------|------------------|------|--------|------|------|
| 1 | スペース | （なし） | `ar_dashboard_space` | — | — | — | 一覧 HTML のマウント先（全幅） |
| 2 | 文字列（複数行） | 運用メモ | `ar_admin_note` | 任意 | 空 | 可 | 人向け説明のみ。集計不使用 |

### 2.2 プロセス管理

- **使用しない**（`useStatus: false`）

### 2.3 一覧ビュー（kintone 標準）

| ビュー名 | 種類 | 用途 |
|----------|------|------|
| （すべて） | 標準一覧 | レコードほぼ無し。開いた瞬間 `app.record.index.show` でカスタム UI が上書き表示 |
| 運用 | 同上 | 権限分けが必要な場合のみ複製 |

**標準一覧の列**: 第1段階では **`ar_admin_note` のみ**で可（レコード 0 件でも可）。

### 2.4 アプリ設定

| 設定 | 値 |
|------|-----|
| アイコン | 帳簿・グラフ系（任意） |
| レコードのタイトル | `ar_admin_note` または非表示 |
| レコードの条件付き入力 | なし |
| カテゴリー | 使用しない |

---

## 3. 画面項目とデータソース（論理項目）

JS が計算して表示する項目。**kintone フィールドとして第1段階では持たない**（§2 以外）。

### 3.1 全社サマリ（画面上部）

| 表示名 | 定義 | データソース |
|--------|------|--------------|
| 売掛残高合計 | 全取引先の **現在売掛残高** の合計 | §5.3 |
| 30日超 | **open > 0** かつ **支払超過日数 ≥ 30** の請求の **残高合計** | §6 |
| 60日超 | 同上 **≥ 60** | §6 |
| 90日超 | 同上 **≥ 90** | §6 |
| 今月入金額 | 当月 **`payment_date`** の App 21 **`payment_amount`** 合計（取消除外） | §5.4 |
| 今月入金予定額 | **`payment_due_date`** が当月かつ **open > 0** の請求について、**open 残高**の合計 | §5.5 |

### 3.2 取引先行（メインテーブル）

| 表示名 | 定義 |
|--------|------|
| 取引先コード | App 35 `customer_code` |
| 取引先名 | App 35 `customer_name`（請求書上の名称。最新請求で代表表示可） |
| 未回収請求額 | §5.2 `uncollectedBillingTotal` |
| 現金入金額 | §5.2 充当 `cash` 合計（取引先単位） |
| 手数料消込額 | §5.2 `fee` 合計 |
| 値引き消込額 | §5.2 `discount` 合計 |
| 消込合計 | `cash + fee + discount` |
| 現在売掛残高 | §5.2 `openBalanceTotal` |
| 最古未回収請求日 | open > 0 の請求の **最小 `invoice_date`** |
| 支払期日 | 最古未回収請求に対応する **基準日**（§6.1） |
| 支払超過日数 | 最古未回収請求の §6.2（取引先代表値） |
| 最終入金日 | App 21 取消除外、`customer_code` 一致の **最大 `payment_date`** |
| 次回入金予定日 | open > 0 の請求の **`payment_due_date` 最小**（空は除外） |
| 未入金件数 | §5.6 |
| 一部入金件数 | §5.6 |

**行クリック**: 当該取引先の **open > 0**（または表示ポリシーで「請求済すべて」）の請求を展開。

### 3.3 請求展開行（ドリルダウン）

| 表示名 | 定義 |
|--------|------|
| 請求番号 | `invoice_no` |
| 請求日 | `invoice_date` |
| 請求額 | `getBillingTarget(invoice)` |
| 現金入金 | 当該 `invoice_no` の `cash_allocation` 合計 |
| 手数料 | `fee_allocation` 合計 |
| 値引き | `discount_allocation` 合計 |
| 消込合計 | 上記3種合計 |
| 残高 | `computeInvoiceOpenBalance(invoice, payments)` |
| 支払期日 | §6.1 |
| 超過日数 | §6.2 |

**リンク**: 請求番号 → App 35 レコード詳細（新規タブ）。

---

## 4. App 35 / App 21 参照フィールドコード

### 4.1 App 35（請求書）

| 用途 | フィールドコード | 備考 |
|------|------------------|------|
| 請求番号 | `invoice_no` | |
| 請求日 | `invoice_date` | 超過フォールバック |
| 請求状態 | `invoice_status` | **`請求済` のみ**集計 |
| 取引先 | `customer_code`, `customer_name` | |
| 請求対象額 | `invoice_amount`, `total` | **`getBillingTarget()`** |
| 入金予定日 | `payment_due_date` | 超過・予定の**第一優先** |
| 支払期限（参考） | `due_date` | **第1段階の超過計算では使用しない**（ユーザー指定どおり `payment_due_date` → `invoice_date`） |
| 入金状況（参考） | `payment_status` | 件数のクロスチェック用。正は充当計算 |
| 最終入金日（参考） | `last_payment_date` | 表示は **App 21 集計を優先** |

**取得クエリ（請求）**:

```text
invoice_status in ("請求済") order by customer_code asc, invoice_date asc, invoice_no asc
```

（`PaymentCreateV2.buildBilledInvoiceStatusCondition()` と同等）

### 4.2 App 21（入金 V2）

| 用途 | フィールドコード | 備考 |
|------|------------------|------|
| 入金日 | `payment_date` | 今月入金 |
| 現金 | `payment_amount` | ヘッダー。請求別は充当表 |
| 状態 | `payment_record_status` | **`取消` 除外**（未設定は `有効` 扱い） |
| 取引先 | `customer_code` | |
| 充当表 | `payment_allocation` | |
| 請求番号 | `payment_allocation.invoice_no` | |
| 現金充当 | `payment_allocation.cash_allocation` | |
| 手数料充当 | `payment_allocation.fee_allocation` | |
| 値引充当 | `payment_allocation.discount_allocation` | |
| 充当合計 | `payment_allocation.allocation_amount` | 参考（正は3種合計） |

**取得**: 全件ページング（`PaymentCreateV2.fetchAllActivePaymentRecords` 相当）。件数が増えたら `customer_code` / 期間分割は第2迭代。

---

## 5. API 取得・集計方法

### 5.1 処理フロー

```text
1. GET App35: 請求済請求 全件（必要フィールドのみ）
2. GET App21: 入金 全件（取消除外前フィルタは JS 内）
3. 請求ごと:
     target = PaymentCreateV2.getBillingTarget(invoice)
     totals = PaymentCreateV2.aggregateInvoiceFromPayments(payments, invoice_no)
     open   = PaymentCreateV2.computeInvoiceOpenBalance(invoice, payments)
4. customer_code でグループ化 → 取引先行
5. 全社サマリ → 上部カード
```

**依存**: `customize/payment_create.js` の **`PaymentCreateV2`** を読み取り専用で再利用（`payment_desktop.js` は App 21 専用のため **売掛アプリには載せない**）。

### 5.2 請求1件

| 変数 | 式 |
|------|-----|
| `target` | `getBillingTarget(invoice)` |
| `cash/fee/discount` | `aggregateInvoiceFromPayments(...)` |
| `settled` | `cash + fee + discount` |
| `open` | `max(target - settled, 0)` ≡ `computeInvoiceOpenBalance` |

**carry_over / balance / accounts_receivable（App35）は売掛残高に使わない。**

### 5.3 取引先集計

対象: 当該 `customer_code` の **請求済** 請求すべて。

| 指標 | 式 |
|------|-----|
| `uncollectedBillingTotal` | Σ `target` （**open > ε** の請求のみ） |
| `openBalanceTotal` | Σ `open` |
| `cashTotal/feeTotal/discountTotal` | 各請求の充当合計の Σ |
| `settledTotal` | `cashTotal + feeTotal + discountTotal` |

（`uncollectedBillingTotal` と `openBalanceTotal` は一部入金時に異なる。前者は**未回収に属する請求の票面請求対象額合計**、後者は**残高**。）

### 5.4 今月入金額

```text
Σ payment_amount
  WHERE payment_record_status != "取消"
    AND payment_date in [月初, 月末]
```

App 21 ヘッダー **`payment_amount` のみ**（手数料・値引きは請求消込側。会社全体の「現金入金」KPI としてヘッダー合計）。

### 5.5 今月入金予定額

```text
Σ open(invoice)
  WHERE open > 0
    AND payment_due_date が当月（YYYY-MM）
    AND payment_due_date != 空
```

### 5.6 未入金・一部入金件数（請求単位・取引先内）

`PaymentCreateV2.derivePaymentStatus(settled, target)` を使用。

| 件数 | 条件 |
|------|------|
| 未入金件数 | `open > ε` かつ `settled <= ε` |
| 一部入金件数 | `open > ε` かつ `settled > ε` |

（回収済 `open <= ε` はどちらにも含めない。）

### 5.7 API フィールドリスト（推奨）

**App 35 GET fields**:

`$id`, `invoice_no`, `invoice_date`, `invoice_status`, `customer_code`, `customer_name`, `invoice_amount`, `total`, `payment_due_date`, `payment_status`, `last_payment_date`

**App 21 GET fields**:

`$id`, `payment_date`, `payment_amount`, `payment_record_status`, `customer_code`, `payment_allocation`

---

## 6. 支払超過日数・30/60/90 日

### 6.1 基準日（支払期日表示）

請求レコードごと:

```javascript
function resolveDueBaseDate(invoice) {
  const due = trim(invoice.payment_due_date);
  if (due !== '') return due;
  return trim(invoice.invoice_date);
}
```

### 6.2 支払超過日数

```javascript
function overdueDays(invoice, todayYmd) {
  const base = resolveDueBaseDate(invoice);
  if (base === '') return 0;
  if (todayYmd <= base) return 0;
  return calendarDaysBetween(base, todayYmd); // base の翌日から数える「経過」ではなく、仕様: 現在日 − 基準日（日付差）
}
```

**ユーザー指定**: 「現在日 − 基準日」。**基準日当日は 0**（未超過）。

実装: `diffDays(today, base)` で `today <= base` → 0、否则 `today - base`（UTC ずれ防止のため kintone 日付文字列は JST 日付として扱う）。

### 6.3 30 / 60 / 90 日超（全社サマリ）

請求 **open > ε** について:

| バケット | 条件 |
|----------|------|
| 30日超 | `overdueDays >= 30` |
| 60日超 | `overdueDays >= 60` |
| 90日超 | `overdueDays >= 90` |

**集計値**: 各バケットの **`open` 合計**（金額）。フィルタ UI で「30日超取引先のみ」等は `取引先代表超過日数` または `max(open 請求の overdueDays)` で絞込可（第1段階は代表＝最古未回収請求の超過日数を推奨）。

### 6.4 取引先行の代表値

| 項目 | ルール |
|------|--------|
| 最古未回収請求日 | open > 0 の min(`invoice_date`) |
| 支払期日・超過日数 | その請求（同日複数ある場合は min(`invoice_no`)）に紐づける |

---

## 7. 一覧画面レイアウト（ワイヤ）

```text
┌─────────────────────────────────────────────────────────────┐
│ 売掛管理                          更新: 2026-10-03 14:30 [再読込] │
├─────────────────────────────────────────────────────────────┤
│ [売掛残高合計] [30日超] [60日超] [90日超] [今月入金] [今月予定] │
├─────────────────────────────────────────────────────────────┤
│ フィルタ: [全て▼] [30日超] [60日超] [90日超]  検索: 取引先____   │
├─────────────────────────────────────────────────────────────┤
│ ▶ │コード│取引先名│未回収請求│現金│手数料│値引│消込計│残高│... │
│ ▼ │A001 │株式会社…│  500,000│ ...                                    │
│   │  └ 請求番号 │請求日│請求額│現金│手数料│値引│消込│残高│期日│超過│
│ ▶ │A550 │…       │  ...    │                                        │
└─────────────────────────────────────────────────────────────┘
```

| UI | 動作 |
|----|------|
| 再読込 | API 再取得（キャッシュなし） |
| フィルタ | 取引先代表 `overdueDays` または残高 > 0 |
| 行展開 | クリックで請求ドリルダウン |
| 色 | 超過 > 0 かつ open > 0 → 警告背景（任意） |

---

## 8. 第5段階用フィールド予約（第1段階では未作成）

| フィールドコード | 型 | 用途 |
|------------------|-----|------|
| `snapshot_ym` | 文字列 | `YYYY-MM` |
| `snapshot_at` | 日時 | 生成日時 |
| `snapshot_json` | 文字列複数行 | 集計 JSON |
| `open_balance_total` | 数値 | 月末売掛 |

---

## 9. JavaScript ファイル構成（実装時）

**登録先**: App 37（または新規売掛管理アプリ）**のみ**。App 35 / 21 には追加しない。

| 順 | ファイル | 役割 |
|----|----------|------|
| 1 | `customize/ar_config.js` | `AR_APP_ID`, `INVOICE_APP_ID=35`, `PAYMENT_APP_ID=21`, 定数・UI 文言 |
| 2 | `customize/payment_create.js` | 既存 **V2 エンジン**（変更しない） |
| 3 | `customize/ar_engine.js` | API 取得、請求×入金結合、取引先/全社集計、超過日数 |
| 4 | `customize/ar_desktop.js` | `app.record.index.show` カスタム UI、展開・フィルタ |
| 5 | `customize/ar_index.css` | テーブル・サマリカード（任意: kintone 全体 CSS ではなくアプリ CSS） |

**グローバル**: `window.CAYANAS_AR = { Engine, version }`（`PaymentCreateV2` とは名前空間分離）

**イベント**:

- `app.record.index.show` → ダッシュボード描画  
- （任意）`app.record.detail.show` → 「一覧へ戻る」リンクのみ  

**非搭載**: `payment_desktop.js`, `invoice_*`, 保存系 submit ハンドラ

---

## 10. 実装前チェックリスト

- [ ] §0.2 で App 37 の有無・用途を確定し、**`AR_APP_ID` を記録**
- [ ] App 35 に `payment_due_date` が請求データに入っているか実データ確認
- [ ] App 21 読取権限（売掛アプリを見るユーザーが App 21 充当表を GET できるか）
- [ ] 売掛アプリフォーム §2 を kintone に作成
- [ ] JS 登録順 §9 のとおり

---

## 11. 関連ドキュメント

- `docs/AYANAS_AR_REPORTING_DESIGN.md` — 全体設計  
- `docs/RECEIVABLE_APP.md` — 旧 App37 一覧案（入金 App **36** 表記 → 本番 **21** に読替）  
- `customize/PAYMENT_V2_README.md` — 入金 V2  

---

*App ID 確定後、§0.3 の結果をこのファイル先頭に追記してから JS 実装に着手する。*
