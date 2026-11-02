# 売掛管理 App 22 — 調査・フォーム移行・画面仕様

**Version**: 0.3（JS: `customize/ar_*.js` — App 22 登録要）  
**URL**: https://o5nppg7kb4ly.cybozu.com/k/22/  
**定数（確定）**:

```text
AR_APP_ID      = 22
INVOICE_APP_ID = 35
PAYMENT_APP_ID = 21
```

**App 37**: 使用しない。  
**方針**: App 22 は **参照・表示専用**。売掛の正データは **App 35 + App 21 から都度計算**。App 22 レコードへの手入力・同期保存は **第1段階では行わない**。

---

## A. App 22 実環境調査（エージェント側）

| 項目 | 結果 |
|------|------|
| kintone 直接参照 | **ログイン必要**のため、フォーム実体・登録 JS 一覧は **未取得** |
| リポジトリ内エクスポート | **`_tmp_app22_*` なし** |
| 関連コード | `CAYANAS_Invoice/js/config.js` — デフォルト **`AR: 22`**、`AR_FIELDS` 定義 |
| 連動 | `CAYANAS_Invoice/js/invoice_cancel.js` — 請求取消時、App 22 に **`invoice_no` 一致レコードがあれば** `collection_status=取消`・`accounts_receivable=0` を PUT（**レコード無しはスキップ**） |
| 旧ポータル | `Desktop/code/menu.js` は `/k/22/` を「請求書作成」と表示 → **App 35 が請求正**のため **表示ラベルのみ古い** |

### A.1 実施必須：貴社でのエクスポート確認

フォーム変更前に、ログイン済みブラウザで実行し、結果を `_tmp_app22_export` として保存することを推奨。

```javascript
// 1) アプリ名
kintone.api(kintone.api.url('/k/v1/app', true), 'GET', { id: 22 })
  .then((r) => console.log('name:', r.name, 'desc:', r.description));

// 2) 全フィールド
kintone.api(kintone.api.url('/k/v1/app/form/fields', true), 'GET', { app: 22 })
  .then((r) => console.table(Object.values(r.properties).map((p) => ({
    code: p.code, label: p.label, type: p.type,
  }))));

// 3) レコード件数（旧ミラーが残っているか）
kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
  app: 22, query: 'order by $id asc limit 1', totalCount: true,
}).then((r) => console.log('totalCount:', r.totalCount));
```

**JavaScript / CSS**: kintone 管理 → App 22 → 設定 → JavaScript/CSS カスタマイズの **ファイル名一覧をスクリーンショットまたはメモ**（API は管理者権限が必要な場合あり）。

---

## B. 想定される App 22 の「旧姿」（コードベースから）

AYANAS Invoice プラグインが想定する **請求1件＝App22レコード1件** のミラー（`AR_FIELDS`）:

| フィールドコード | ラベル（想定） | 用途 |
|------------------|----------------|------|
| `customer_code` | 請求先コード | 旧ミラー |
| `customer_name` | 請求先名 | 旧ミラー |
| `invoice_no` | 請求番号 | キー・取消連動 |
| `invoice_date` | 請求日 | 旧ミラー |
| `due_date` | 支払期限 | 旧ミラー |
| `invoice_amount` | 請求金額 | 旧ミラー |
| `payment_total` | 入金累計 | 旧ミラー |
| `accounts_receivable` | 売掛残高 | 旧ミラー・取消時 0 更新 |
| `collection_status` | 回収状況 | 旧ミラー・取消時「取消」 |
| `last_payment_date` | 最終入金日 | 旧ミラー |
| `elapsed_days` | 経過日数 | 旧ミラー |
| `in_charge` | 担当者 | 旧ミラー |

**注意**: App 22 がかつて **App 35 の複製（請求書アプリ）** だった場合、`invoice_status`・`invoice_detail`・`total`・`carry_over` 等 **請求書用フィールドが追加で残っている可能性**があります（実エクスポートで確定）。

**第1段階の正**: 上記ミラーレコードの数値は **信用しない**。表示は App 35 + App 21 再計算のみ。

---

## 1. 残すフィールド

| フィールドコード | 型 | 理由 |
|------------------|-----|------|
| `ar_dashboard_space` | スペース | **新規** — 一覧カスタム UI のマウント先（必須） |
| `ar_admin_note` | 文字列（複数行） | **新規** — 運用メモ（任意・集計不使用） |

**レガシー互換（推奨：当面「フォーム上は残す・非表示」）**

請求取消プラグインが App 22 を更新し得るため、**削除は実エクスポート確認後**に実施。残す場合:

| フィールドコード | 理由 |
|------------------|------|
| `invoice_no` | `invoice_cancel.js` の検索キー |
| `collection_status` | 取消時 PUT |
| `accounts_receivable` | 取消時 0 更新 |

※ 新売掛 UI はこれらを **読まない**。レコードも **新規作成しない**。

---

## 2. 削除してよいフィールド（方針）

**条件**: App 22 に **請求書複製型**のフィールドがあり、かつ **どの JS も参照していない** ことがエクスポート＋JS 一覧で確認できた後。

| 分類 | 例（存在する場合） | 理由 |
|------|-------------------|------|
| 旧ミラー表示用 | `customer_code`, `customer_name`, `invoice_date`, `due_date`, `invoice_amount`, `payment_total`, `last_payment_date`, `elapsed_days`, `in_charge` | 第1段階は App 35/21 から live 集計。手入力・同期なし |
| 請求書複製 | `invoice_status`, `invoice_detail`, `subtotal`, `tax`, `total`, `carry_over`, `payment_amount`, … | 正は App **35** |
| 計算の重複 | `accounts_receivable`（ミラー用） | **取消連動だけ残すなら §1 参照** — 完全削除する場合は **Invoice プラグイン側の App22 更新は無害スキップ**（レコード無し） |

**旧レコードデータ**: バックアップ後、一括削除またはアーカイブビューで隔離（**売掛表示には使わない**）。

---

## 3. 新しく追加するフィールド

| フィールドコード | ラベル | 型 | 必須 |
|------------------|--------|-----|------|
| `ar_dashboard_space` | （ラベル非表示可） | スペース | — |
| `ar_admin_note` | 運用メモ | 文字列（複数行） | 任意 |

**第5段階（月次スナップ）用 — 第1段階では未追加可**

| コード | 用途 |
|--------|------|
| `snapshot_ym` | `YYYY-MM` |
| `snapshot_at` | 生成日時 |
| `snapshot_json` | 集計 JSON |
| `open_balance_total` | 月末売掛 |

---

## 4. App 22 に登録されている既存 JS/CSS（リポジトリ調査）

| 場所 | App 22 専用ファイル |
|------|---------------------|
| `CAYANAS_Print_v2/customize/` | **なし** |
| `CAYANAS_Print_v2/js/` | **なし**（`RECEIVABLE_APP_ID=37` は印刷プラグイン定数のみ） |
| `CAYANAS_Invoice/js/` | **App 22 に直接 `events.on` する JS なし**。`invoice_cancel.js` が **App 35 上**から App 22 を PUT |
| `Desktop/code/` | **App 22 向け JS なし**（`/k/22/` リンクのみ） |

**結論**: リポジトリ上、App 22 専用カスタマイズは **未管理**。実 kintone に **手動アップロードされた旧 JS** がある可能性が高い → **§A.1 で一覧取得必須**。

---

## 5. 削除または停止すべき旧カスタマイズ

実 JS 一覧確認後、次に該当すれば **無効化または削除**:

| 種別 | 判断基準 |
|------|----------|
| 旧売掛ミラー同期 | App 22 レコードを POST/PUT する処理（App 35/21 と二重管理） |
| 旧請求 UI | `kintone.app.getId() === 22` で請求作成・確定（正は App **35** + Invoice プラグイン） |
| 重複入金 | App 21 以外への入金登録 JS |
| 手入力編集 | 売掛残高・入金額を App 22 上で編集する UI |

**残す（App 22 に載せる予定・第1段階実装後）**

| ファイル | 備考 |
|----------|------|
| `ar_config.js` | 定数 |
| `payment_create.js` | **読取専用**（`PaymentCreateV2`）— App 21/35 は変更しない |
| `ar_engine.js` | 集計 |
| `ar_desktop.js` | 一覧 UI |
| `ar_index.css` | スタイル |

**載せない**: `payment_desktop.js`（App 21 保存 UI）

**App 35 / App 21**: ファイル変更 **禁止**（ユーザー指示）。

**AYANAS Invoice プラグイン**: 第1段階では **変更禁止**。App 22 ミラー廃止後も取消時 PUT は **レコード無しでスキップ**するため動作は継続。

---

## 6. 売掛管理用の最終フォーム構成

**アプリ名**: `売掛管理`  
**プロセス管理**: オフ  
**レコード運用**: 第1段階は **レコード不要**（一覧 JS のみ）

### レイアウト

```text
┌─ 行1 ─────────────────────────────────────────────┐
│  [ スペース ar_dashboard_space  全幅 ]              │
├─ 行2（任意） ───────────────────────────────────────┤
│  運用メモ ar_admin_note                             │
└───────────────────────────────────────────────────┘
```

### 非表示・レガシー行（取消連動フィールドを残す場合のみ）

フォーム最下部に **「システム（非表示）」グループ** として配置し、一覧・詳細から隠す:

- `invoice_no`（文字列1行）
- `collection_status`（ドロップダウン: 未回収 / 一部回収 / 回収済 / 取消）
- `accounts_receivable`（数値）

### 権限

| ロール | 権限 |
|--------|------|
| 経営・経理 | 閲覧（App 22 一覧） |
| 一般 | 必要に応じて閲覧のみ |
| レコード追加/編集 | **原則禁止**（JS も PUT しない） |

### 標準一覧ビュー

- 名称: `ダッシュボード`
- 列: `ar_admin_note` のみ（レコード 0 件で可）
- 実表示: `app.record.index.show` が DOM を差し替え

---

## 7. 売掛一覧画面の最終レイアウト

### 7.1 全社サマリ（上段カード）

| カード | 定義 |
|--------|------|
| 売掛残高合計 | 全取引先 `openBalanceTotal` の合計 |
| 30日超 | open > 0 かつ `overdueDays >= 30` の **残高合計** |
| 60日超 | 同上 >= 60 |
| 90日超 | 同上 >= 90 |
| 今月入金額 | App 21 `payment_amount` 合計（`payment_record_status ≠ 取消`、当月 `payment_date`） |
| 今月入金予定額 | open > 0 かつ `payment_due_date` が当月の **open 合計** |

### 7.2 フィルタ行

- クイック: すべて / 30日超 / 60日超 / 90日超 / 残高>0  
- テキスト: 取引先コード・名称部分一致  
- **再読込**（API 再取得）

### 7.3 取引先テーブル（主行）

| 列 | 内容 |
|----|------|
| ▶ | 展開 |
| 取引先コード | App 35 |
| 取引先名 | App 35 |
| 未回収請求額 | Σ billingTarget（open > 0 の請求） |
| 現金入金額 | Σ cash 充当 |
| 手数料消込額 | Σ fee |
| 値引き消込額 | Σ discount |
| 消込合計 | cash+fee+discount |
| 現在売掛残高 | Σ open |
| 最古未回収請求日 | min invoice_date（open > 0） |
| 支払期日 | 最古未回収請求の基準日（下記） |
| 支払超過日数 | 最古未回収請求の overdueDays |
| 最終入金日 | App 21 max payment_date |
| 次回入金予定日 | open > 0 の min payment_due_date |
| 未入金件数 | open>0 かつ settled≈0 |
| 一部入金件数 | open>0 かつ settled>0 |

### 7.4 展開行（請求ドリルダウン）

請求番号（→ App 35 詳細リンク）| 請求日 | 請求額 | 現金 | 手数料 | 値引 | 消込合計 | 残高 | 支払期日 | 超過日数

### 7.5 計算（App 35 + App 21）

| 項目 | ルール |
|------|--------|
| 請求対象 | `invoice_status = 請求済` |
| 請求額 | `PaymentCreateV2.getBillingTarget()` |
| 入金 | `payment_record_status != 取消` |
| 消込 | `cash_allocation + fee_allocation + discount_allocation` |
| 残高 | `PaymentCreateV2.computeInvoiceOpenBalance()` |
| carry_over | **使用しない** |

### 7.6 支払超過日数

```text
基準日 = payment_due_date が非空 ? payment_due_date : invoice_date
today <= 基準日 → 0 日
else → (today − 基準日) の暦日差
```

30/60/90 判定は **請求単位の overdueDays**（取引先代表は **最古未回収請求**）。

---

## 8. JavaScript ファイル構成（実装時・App 22 のみ登録）

**登録順**:

```text
1. customize/ar_config.js
2. customize/payment_create.js   （既存・変更なし）
3. customize/ar_engine.js
4. customize/ar_desktop.js
5. customize/ar_index.css          （CSS タブ）
```

| ファイル | 責務 |
|----------|------|
| `ar_config.js` | `AR_APP_ID=22`, `INVOICE_APP_ID=35`, `PAYMENT_APP_ID=21`, UI 文言 |
| `payment_create.js` | V2 エンジン再利用 |
| `ar_engine.js` | GET 35/21、グループ化、超過日数、サマリ |
| `ar_desktop.js` | `app.record.index.show`、展開・フィルタ |
| `ar_index.css` | テーブル・カード |

**イベント**: `app.record.index.show` のみ（第1段階）。  
**禁止**: App 22 からの App 35/21 への PUT/POST。

---

## 9. 実装前チェックリスト

- [ ] §A.1 エクスポート — 実フィールド一覧と JS 名を本書 §1〜2 に反映  
- [ ] 旧レコードのバックアップ方針  
- [ ] ポータル `menu.js` / `totalmenu.js` の App 22 ラベルを「売掛管理」に修正（任意・別タスク）  
- [ ] フォーム §6 適用  
- [ ] JS §8 登録  
- [ ] App 35/21 実データで残高突合  

---

## 10. 関連ドキュメント

- `docs/AR_MANAGEMENT_APP_FORM.md` — 集計詳細（App ID を **22** に読替）  
- `docs/AYANAS_AR_REPORTING_DESIGN.md` — 全体設計  
- `CAYANAS_Invoice/README.md` — `app_ar = 22`  

---

*§A.1 のエクスポート結果が得られたら、§1〜2 の「削除/残す」を確定版に更新してからフォーム改修・JS 実装に進む。*
