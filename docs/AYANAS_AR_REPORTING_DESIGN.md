# AYANAS 売掛管理・日報・月報・経営ダッシュボード — 設計調査書

**Version**: 0.1（調査・設計のみ・**JS 未実装**）  
**作成日**: 2026-10-03  
**前提**: 既存の請求（App35）・入金（App21）・和裁士・総合入庫の**完成ロジックを変更しない**。集計は**読取専用**。

---

## 0. 調査ソース（リポジトリ）

| 種別 | 主な参照 |
|------|----------|
| 入金 V2（正） | `customize/payment_create.js`, `payment_desktop.js`, `invoice_balance_desktop.js`, `PAYMENT_V2_README.md` |
| 請求 | `docs/INVOICE_APP.md`, `js/record.js`, `js/templates/invoice.js` |
| 受注・納品 | `docs/03_FieldDictionary.md`, `js/record.js`, `_tmp_app16_export` |
| 売掛一覧（旧案） | `docs/RECEIVABLE_APP.md`（App37・入金 App36 表記 — **本番は App21 に読替**） |
| 外注・入庫 | `customize/inbound_unified_*.js`, `wasai_*.js`, `overseas_*.js`, `docs/INBOUND_*` |
| マスタ | `customize/price_master_register.js`, `wasai_config.js`（App13/14/8 は辞書＋JS 参照のみ） |

**重要**: ドキュメント上 App 入金=36 / 売掛=37 の記述があるが、**カスタマイズ V2 の実装は App21=入金**。本設計は **App21 + App35** を売掛の正とする。

---

## ① 現行アプリ調査結果（サマリ）

### 1.1 データフロー（売上・請求・入金）

```
App16 受注 (manage_no, order_date, detail_table.amount)
  → App19 納品 (delivery_no, delivery_date, delivery_detail.amount 税抜)
    → App35 請求 (invoice_no, invoice_date, invoice_status=請求済, invoice_amount/total)
      ↔ App21 入金 (payment_allocation → 請求番号単位消込 → App35 同期)
```

**二重集計を避ける原則**

| レポート種別 | 使ってよい数字 | 使わない（別概念） |
|-------------|----------------|-------------------|
| 売掛・回収 | App35 請求済 + App21 消込 | App16 受注額を売掛に足さない |
| 売上（納品ベース） | App19 納品日・明細 amount | App35 請求額と同一日に足さない |
| 請求（請求書ベース） | App35 invoice_date・回収対象額 | App19 納品額を請求月に再度足さない |
| 入金（キャッシュ） | App21 payment_date・payment_amount | 消込 allocation のみを「入金額」二重計上しない |
| 和裁士支払 | App75（買掛・外注費） | 売掛・売上に混ぜない |

### 1.2 App16 受注明細

- **1レコード = 1 管理番号**（`manage_no`）。
- 金額: サブテーブル `detail_table` の `amount`（`unit_price` × `qty`）。
- 日付: **`order_date`** = 受注日、`deadline` = 納期（納品日ではない）。
- **点数**: 受注票印刷の「点数」= **`detail_table` 行数**（管理番号数ではない。1受注=1管理番号が前提）。
- 加工分類: 明細に中分類は保持されず、**App13 `subcategory`** を `item_code` / `item_name` から実行時解決（`wasai_config.js`, App16 ヘッダー `subcategory` は export JS で設定）。

### 1.3 App19 納品管理

- **1レコード = 1 納品番号**（`delivery_no`）。
- 日付: **`delivery_date`** = 納品日。
- 金額: `delivery_detail.amount`（辞書上 **税抜**）。ヘッダー合計フィールドは辞書に無く、**`js/record.js` が明細 sum**（印刷時 10% 税）。
- **納品点数**: **distinct `manage_no`** in `delivery_detail`（同一管理番号の複数行は 1 点）。
- 請求連携: `invoice_status`（未請求 / 請求作成中 / 請求済）、`invoice_no`。

### 1.4 App35 請求書

- 状態: **`invoice_status` = `未請求` / `請求済` / `取消`**（V2 JS 定数。旧 doc の「作成中/確定」と不一致 — **kintone 実値は JS に合わせる**）。
- **回収対象額（請求1件のベース）**: `getBillingTarget()` → **`invoice_amount` ≠ 0 なら invoice_amount、否则 total**（`payment_create.js`）。
- **`carry_over`**: 請求書ヘッダー再取得時は **「直前の請求済み請求の回収対象額（前回請求額）」**（未回収残の合計ではない）。**意味を変更しない**。
- **`balance`（請求後残高）**: `carry_over - payment_amount + invoice_amount`（再取得 UI 用。`payment_amount` は直前請求に対する入金表示値）。
- 入金連携フィールド（App21 保存で PUT）: `payment_amount`（現金+手数料累計）, `discount_amount`, `payment_balance`, `payment_status`, `accounts_receivable`, `collection_status`, `last_payment_date`。
- 日付: **`invoice_date`**（請求日）, **`due_date`**（支払期限）, **`payment_due_date`**（入金予定日 — フィールド定義あり。自動更新は V2 入金 JS では未確認 → **表示は App35 値をそのまま**）。

### 1.5 App21 入金管理（V2・完成済み）

- ヘッダー: `payment_date`, `payment_amount`（振込・現金）, `fee`, `discount_amount`, `writeoff_amount` (= 三者合計), `payment_record_status`（**`取消` は集計除外**）。
- サブテーブル `payment_allocation`: 請求番号ごとに `allocation_amount` + 内訳 **`cash_allocation`, `fee_allocation`, `discount_allocation`**。
- **請求ごとの未収残（正）**:  
  `openBalance = max(billingTarget - Σ(cash+fee+discount), 0)`  
  （`aggregateInvoiceFromPayments` / `computeInvoiceOpenBalance` — **App35 の payment_amount 単体よりこちらを優先**）。
- 保存時 **`syncInvoiceByNo`**: App35 の `accounts_receivable` = openBalance、`payment_status` / `collection_status` 自動。

### 1.6 外注・和裁士・総合入庫（件数系）

| ルート | 出庫 App | 未入庫の定義 | 入庫完了 |
|--------|----------|--------------|----------|
| 国内外注 | 27 | `outsource_detail.line_in_date` 空 | 行に日付、全行でヘッダー `入庫` |
| 海外 | 28 | `overseas_in_date` 空 | `overseas_in_date` + `overseas_status=全戻り` |
| 和裁士 | 74 | 行 `inbound_date` 空 & `line_status` 出庫中/空 | `inbound_date` + `line_status=入庫済` |
| 総合入庫 | 78 | — | 確定成功行（`inbound_date`=D で 27/28/74/16 更新） |

**App78 件数**: ヘッダー `line_count` / `success_count` / `error_count`、明細 `line_result`。運用上の「本日入庫数」= **`inbound_status=入庫確定` かつ `confirmed_at` または `inbound_date` が当日** の **確定成功行数**（管理番号単位）。

### 1.7 App75 和裁士支払

- 売上・売掛と**無関係**（費用・買掛）。入庫 **月** × 74 行の支払対象を集計。

### 1.8 A550 / ayanasu

- **`customer_code = A550`**: 和裁士 **`payment_rate` 0.65**（他 0.70）のみ特別（`wasai_config.js`）。**売掛・請求・納品の金額ルールは他取引先と同じ**。
- レポートでは **フィルタ「A550 を除外 / のみ」** を推奨（店舗分の見え方のため）。必須分割かは運用判断。

---

## ② 数字の定義表（指標 × 正データ）

基準日はすべて **Asia/Tokyo の暦日**（kintone 日付フィールドの値。タイムゾーンは環境に合わせ要確認）。

| 指標名 | 意味 | 正データ App | 対象フィールド | 基準日 | 集計式 | 除外条件 | 注意点 |
|--------|------|-------------|----------------|--------|--------|----------|--------|
| 受注額 | 受注時点の加工代（受注ベース） | **16** | `detail_table.amount` | **`order_date`** | Σ amount | 取消レコードがあれば除外（要：App16 に状態フィールド有無を実機確認） | **請求・売上ではない** |
| 受注件数 | 受注伝票数 | **16** | レコード数 | `order_date` | count($id) | 同上 | **1件=1管理番号=1レコード** |
| 受注明細行数 | 加工行数 | **16** | `detail_table` | `order_date` | Σ 行数 | — | **点数（行数）≠ 件数** |
| 納品売上（税抜） | 納品ベース売上 | **19** | `delivery_detail.amount` | **`delivery_date`** | Σ amount | 取消があれば除外（要実機確認） | 請求額と**同日集計しない** |
| 納品売上（税込） | 印刷に近い売上 | **19** | 上記 | `delivery_date` | floor(Σ税抜×1.1) 等 | 同上 | **`js/record.js` と同じ丸め規則を共通化** |
| 納品件数 | 納品伝票数 | **19** | レコード数 | `delivery_date` | count | — | **1件=1 delivery_no** |
| 納品点数 | 管理番号数 | **19** | `delivery_detail.manage_no` | `delivery_date` | **distinct manage_no** | 空 manage_no 除外 | **件数≠点数** |
| 請求額（1件） | 請求書の回収対象 | **35** | **`invoice_amount` or `total`** | **`invoice_date`** | `getBillingTarget(record)` | **`invoice_status≠請求済`**, **`取消`** | App21 と同じ関数を**読取専用で再利用** |
| 本日請求額 | 日次請求 | **35** | 同上 | `invoice_date`=当日 | Σ billingTarget | 請求済のみ | 納品売上と**別枠** |
| 入金額（キャッシュ） | 実入金 | **21** | **`payment_amount`** | **`payment_date`** | Σ payment_amount | **`payment_record_status=取消`** | **手数料・値引きは含めない** |
| 手数料（入金） | 振込手数料 | **21** | `fee` | `payment_date` | Σ fee | 取消除外 | 売掛消込用。入金額と**別表示** |
| 値引き（入金） | 入金時値引 | **21** | `discount_amount` | `payment_date` | Σ discount | 取消除外 | 同上 |
| 消込額（請求単位） | 請求に充当 | **21** | allocation 内訳 | `payment_date` | Σ(cash+fee+discount) per invoice | 取消除外 | **入金額と同一視しない** |
| 請求残高（1請求） | 未収 | **35+21** | 計算 | — | **`computeInvoiceOpenBalance`** | 請求済のみ | **`payment_balance` キャッシュより再計算を推奨** |
| 売掛残高（取引先） | 現在の未収合計 | **35+21** | 同上 | — | Σ openBalance per customer | 請求済 | App35 `accounts_receivable` は sync 後の鏡像 |
| 前回請求額 | 直前請求の税込請求 | **35** | billingTarget | — | 最新請求済（自レコード除く） | 取消 | **`carry_over` フィールドの意味と一致** |
| 入金予定日 | 回収予定 | **35** | **`payment_due_date`** | — | 表示 | 請求済 | 未入力あり得る |
| 支払期限 | 期限 | **35** | **`due_date`** | — | 経過日数= today−due | — | 期限超過アラート用 |
| 国内外注出庫数 | 出庫した管理番号 | **27** | 行 `manage_no` | **`ship_date`** | distinct manage_no（行追加日） | — | **1管理番号=1カウント** |
| 国内外注入庫数 | 入庫確定 | **27** or **78** | `line_in_date` or 78 確定行 | 入庫日 D | distinct manage_no | — | 公式は **78 確定** が運用正。27 は突合 |
| 海外出庫/入庫 | 同上 | **28** / **78** | `ship_date` / `overseas_in_date` | 各日付 | レコード or 管理番号 | 未入庫: in_date 空 | 28 は 1 管理番号≒1 レコード |
| 和裁士出庫/入庫 | 同上 | **74** / **78** | 行単位 | ship / inbound_date | distinct manage_no | — | 検品後は 74 のみ |
| 総合入庫スキャン数 | 78 セッション | **78** | `inbound_lines` | `scanned_at` | 行数 | エラー行は別 | 確定前は**入庫完了とみなさない** |
| 加工別売上（国内仕立等） | 中分類別 | **16+13** | amount + **`subcategory`** | `order_date` or `delivery_date` | Σ（**どちらか一方を採用**） | — | **受注ベースと納品ベースは別 KPI** |
| 和裁士支払 | 費用 | **75** | 支払明細 | 支払月 | Σ | — | **売上・売掛に含めない** |

### 加工別（App13 中分類）— 推奨マッピング

| 表示名 | App13 `subcategory` 例（コードベース） |
|--------|----------------------------------------|
| 国内仕立 | `国内仕立` |
| 海外仕立 | （要：App13 実選択肢確認。無ければ item/カテゴリで定義） |
| 丸洗い | （要実機確認） |
| しみ抜き | `しみぬき`（price_master 除外名と表記ゆれ注意） |
| 修理 | `修理` |
| その他 | 上記以外 |

**海外仕立・丸洗い**: リポジトリ alone では選択肢未確定 → **実装前に App13 ドロップダウンをエクスポート確認**。

---

## ③ 売掛一覧の画面案

**方式**: 取引先（`customer_code`）単位の**マスター行** + ドリルダウンで請求明細（App35 請求済）。

| 列 | ソース |
|----|--------|
| 取引先コード / 名 | App35 / App8 |
| 前回請求額 | 最新請求済の billingTarget（または `carry_over` 表示用） |
| 今回請求額 | 最新請求の billingTarget |
| 入金額（累計） | App35 `payment_amount` または App21 再集計 |
| 手数料 / 値引き | App35 `discount_amount` + App21 fee 累計（列分割） |
| **現在売掛残高** | **Σ computeInvoiceOpenBalance** |
| 最古未入金請求日 | min(invoice_date where openBalance>0) |
| 経過日数 | today − 最古 or due_date ベース（**due_date 超過を別列**） |
| 入金予定日 | 直近 open 請求の `payment_due_date` |
| 最終入金日 | App35 `last_payment_date` |
| 未入金 / 一部 / 入金済 件数 | App35 `payment_status` 集計 |

**フィルタ**: 未入金 / 一部入金 / 入金済 / 30・60・90 日超（**`due_date` または最古未入金請求日** — 運用でどちらか固定）。

**更新**: **読取のみ**（App21/35 は既存 JS が更新。売掛画面は PUT しない）。

---

## ④ 日報画面案

**対象日 D（デフォルト当日）**

| ブロック | 内容 |
|----------|------|
| 金額 | 本日受注額 / 本日納品売上（税抜・税込両方または切替） / 本日請求額 / 本日入金額（現金） / 本日手数料・値引き |
| 数量 | 受注件数・受注明細行数 / 納品件数・納品点数 / 完了件数（**定義要**: App16 `process_status` 本社戻り等 — 別 KPI） |
| 外注 | 27/28/74 **出庫点数**（distinct manage_no, ship_date=D） / 78 **入庫確定点数** |
| 加工別 | 中分類別 **受注額**（order_date=D）— 納品は別行表示 |

**注意書き**: 画面上に「受注・納品・請求・入金は別系統。合算しない」と明記。

---

## ⑤ 月報画面案

**対象月 M（YYYY-MM）**

| ブロック | 内容 |
|----------|------|
| 金額 | 受注額 / 納品売上 / 請求額 / 入金額 / **月末時点売掛残高** |
| 件数 | 受注件数 / 納品件数 / **客単価** = 納品売上÷納品点数（定義固定） |
| 加工別 | 中分類別（受注 or 納品ベースを月報で固定） |
| 外注 | 27/28/74 出庫・入庫・未入庫（月末スナップ） |
| 売掛 | 未入金総額 / 30・60・90 日超 / **入金予定額**（payment_due_date が M 内の open 請求） |

**月末売掛残高**: 当月最終日時点の openBalance — **都度再計算**（payment_date ≤ 月末の消込のみ反映）または **月次スナップショット**（後述ハイブリッド）。

---

## ⑥ 経営ダッシュボード画面案

1 画面（kintone ポータル or 専用 App 一覧 JS）に以下を配置:

```
【本日】受注 / 納品 / 請求 / 入金（4 数値）
【今月】受注額 / 納品売上 / 請求額 / 入金額 / 現在売掛残高
【要確認】30/60/90 日超未入金件数・金額 / 27・28・74 未入庫点数
【最近の入金】App21 直近 N 件（取引先・日・payment_amount）
【入金予定】payment_due_date: 今日 / 10日 / 20日 / 月末まで
```

**API 負荷**: ダッシュボードは **キャッシュ 5〜15 分** or 朝一回スナップショット推奨。

---

## ⑦ 新規アプリ構成の比較（A / B / C）

| 観点 | A: 売掛+日報+月報 App 分割 | B: 既存 App のみ JS 集計 | C: ハイブリッド（推奨） |
|------|---------------------------|-------------------------|-------------------------|
| データ量 | スナップ保存で API 軽 | 毎回全件 GET で重い | 当日・当月はリアルタイム、**締め済み月はスナップ** |
| 表示速度 | 速い | 遅くなりやすい | バランス良 |
| 過去数字の固定 | スナップで監査向き | 入金訂正で過去月が動く | 月次固定 + 現在は live |
| 保守 | フィールド・JS 増 | App 増やさない | **中程度** |
| 既存への影響 | 読取のみなら低 | 一覧 JS のみ | 低 |

**AYANAS 向け提案: C（ハイブリッド）**

- **App37 相当「売掛サマリ」**（取引先×月次 or 日次スナップ）— 任意新規 1 App  
- **日報/月報**: 原則 **ポータル + 1 集計 App**（レコード 1 行 = 1 日 or 1 月）をバッチ or 手動「再集計」ボタン  
- **ダッシュボード**: App 新規 1 つ or **ポータルウィジェット**（JS は `customize/ar_*.js`）

---

## ⑧ 必要な追加フィールド一覧（案）

| App | フィールド（案） | 目的 |
|-----|------------------|------|
| 新規「日次集計」 | `report_date`, 各 KPI 数値列 | 日報スナップ |
| 新規「月次集計」 | `report_ym`, 各 KPI, `ar_balance_eom` | 月報固定 |
| 新規「売掛サマリ」 | `customer_code`, `as_of_date`, `open_balance`, 件数 | ダッシュボード用 |
| App16 | （任意）`order_status` / 取消フラグ | 集計除外が明確に |
| App19 | （任意）取消フラグ | 同上 |
| App35 | 既存で足りる | `payment_due_date` 運用入力ルールを文書化 |
| — | **新規フィールドなしでも B 構成は可能**（API 重い） |

---

## ⑨ JS ファイル構成案（実装フェーズ用・今回未作成）

```
customize/ar_config.js          … App ID・定数・getBillingTarget 等の薄ラッパ（payment_create 再利用）
customize/ar_balance_service.js … computeInvoiceOpenBalance / 取引先別集計（読取専用）
customize/ar_receivable_index.js … 売掛一覧（App 新規 or 35/21 参照一覧）
customize/ar_daily.js           … 日報 App またはポータル
customize/ar_monthly.js         … 月報
customize/ar_dashboard.js       … 経営ダッシュボード
customize/ar_snapshot_batch.js  … 日次/月次スナップ POST（C 方式）
```

**依存**: `payment_create.js` の `PaymentCreateV2` を **App21/35 に既存登録のまま** glob  import または同一関数を ar_config から参照（**コピペで式を二重定義しない**）。

---

## ⑩ 実装順序（提案）

1. **指標定義の実機確認** — App13 中分類、App16/19 取消、App35 状態値、App21=21 確認  
2. **`ar_balance_service.js`** — App21/35 のみで取引先別 openBalance（既存関数ラップ）  
3. **売掛一覧 UI** — docs/RECEIVABLE_APP.md を App21 版に更新しながら実装  
4. **日報（リアルタイム GET）** — 金額 4 種 + 件数定義のテスト  
5. **外注・入庫件数** — 27/28/74/78（点数=manage_no）  
6. **月報 + 月末 AR（再計算 or スナップ）**  
7. **加工別（App13 結合）**  
8. **ダッシュボード統合**  
9. **前年同月** — データ存在確認後にクエリ追加  
10. **パフォーマンス** — スナップ App・limit/カーソル設計  

---

## ⑦（補）前年同月比較

| 指標 | 取得可否 |
|------|----------|
| 前年同月売上（納品） | **技術的に可能** — App19 `delivery_date` で range クエリ。**当該月のレコードが kintone に存在する場合のみ**。 |
| 前年同月受注件数 | **同上** — App16 `order_date` |
| 前年同月納品件数 | **同上** |
| 前年同月入金額 | **同上** — App21 `payment_date` |

**取得不可とする条件**: 過去年のデータが未登録・削除済みの月 → **「データなし」表示**（推測値は作らない）。

---

## 重点確認 10 項目 — 結論

| # | 質問 | 結論 |
|---|------|------|
| 1 | App16 受注金額 | **可能** — Σ `detail_table.amount`、`order_date` |
| 2 | App19 納品売上 | **`delivery_detail.amount`（税抜）**。税込は印刷ロジックに合わせる |
| 3 | App35 請求額の正 | **`getBillingTarget` = invoice_amount || total**（App21 と同一） |
| 4 | 実入金 vs 消込 | **実入金=payment_amount**；**消込=allocation 内訳合計** |
| 5 | 手数料・値引き | **売掛消込に含む**（fee/discount allocation）。**入金額 KPI とは分離** |
| 6 | 現在売掛残高 | **`computeInvoiceOpenBalance` 合計**（App35 `accounts_receivable` は sync 結果） |
| 7 | 入金予定日 | **App35 `payment_due_date`**（`due_date` は支払期限） |
| 8 | 出庫・入庫件数 | **distinct manage_no**；入庫確定は **App78 確定** or 27/28/74 日付フィールド |
| 9 | 中分類別 | **可能（App13 結合）**；海外仕立・丸洗いは **実機確認要** |
| 10 | A550 | **通常と同じ AR**；**フィルタ推奨**（和裁レートのみ特殊） |

---

## 実装開始前チェックリスト（ユーザー確認用）

- [ ] App21 が入金 V2 の実 App ID であること  
- [ ] App35 `invoice_status` 選択肢が `未請求/請求済/取消` であること  
- [ ] App13 `subcategory` の全選択肢エクスポート  
- [ ] 日報の「完了件数」の業務定義  
- [ ] 納品売上を税抜/税込どちらで経営会議するか  
- [ ] 経過日数の基準（`due_date` vs `invoice_date`）  
- [ ] 新規 App を 1 つにまとめるか、売掛/日報/月報を分けるか（**C ハイブリッド推奨**）

---

*本書はコード変更を伴いません。実装指示後、`customize/ar_*.js` および必要な kintone フォームを追加します。*
