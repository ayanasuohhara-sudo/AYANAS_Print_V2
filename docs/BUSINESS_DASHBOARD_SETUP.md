# 業務ダッシュボード V1 — セットアップ

## 1. kintone アプリ作成（必須）

1. kintone で新規アプリ **「業務ダッシュボード」** を作成（フォームは空で可）
2. 作成された **App ID** を控える
3. `customize/business_dashboard_config.js` の **`BUSINESS_DASHBOARD_APP_ID`**（現在 **82**）

**URL 例**: https://o5nppg7kb4ly.cybozu.com/k/82/

**売掛 App 22 には登録しないでください。**

## 2. JavaScript / CSS 登録（業務ダashboard アプリのみ）

1. `customize/business_dashboard_config.js`
2. `customize/ar_config.js`（④お金）
3. `customize/payment_create.js`（④・変更なし）
4. `customize/ar_engine.js`（④）
5. `customize/business_dashboard_engine.js`
6. `customize/business_dashboard_money.js`（④ UI）
7. `customize/business_dashboard_desktop.js`
8. `customize/business_dashboard.css`（CSS ファイルとして）

**App 22 / App 35 / App 21 には business_dashboard 用 JS を登録しない。**

## 3. 権限

- 業務ダッシュボード App: 一覧閲覧
- App **16** / **19** / **13**: GET（集計ユーザー）
- App **35** / **21**: GET（④売掛・入金履歴）

## 4. 全体状況（V1.6.1 / 最上部）

デスクトップの `全体状況.xlsx` レイアウトに合わせた表を **ツールバー直下** に表示します。

| ブロック | 行 | 列 |
|----------|----|-----|
| メイン | 本社 / 店舗 / 全体 × **本日・今月・今年度** | 受注枚数・金額、納品枚数・金額、在庫残（受注残）、出庫入庫6列 |
| 受注 | 同上 | 海外仕立〜その他（1着物1区分） |
| 納品 | 同上 | 同上 |

- **今年度** = 6/1〜翌5/31（JST、当日を含む年度）
- **在庫** = 受注残着物枚数・明細税抜合計（時点、期間行で同値）
- **出庫・入庫** = 全社合計（**全体**行のみ数値、本社/店舗は —）

下部の期間ツールバーは、従来どおり **仕立・得意先など詳細ブロック** に適用されます。

## 5. 集計定義（V1）

| 指標 | 基準 |
|------|------|
| 受注着物枚数 | App16 `order_date` 期間内 **distinct manage_no** |
| 納品着物枚数 | App19 `delivery_date` 期間内 **distinct delivery_detail.manage_no** |
| 加工受注/納品点数 | 有効明細の **qty 合計**（qty≤0 は 1 扱い） |
| 受注/納品金額 | 明細 **amount 合計（税抜）** |
| 部門 | `customer_code === A550` → ayanas店舗、それ以外 → 本社 |
| 加工分類 | App13 **`subcategory`**（`item_code` / `item_name` で解決。App16 ヘッダー subcategory は不使用） |

V1 では **金額未確定件数**・**取消除外**は実装していません。

## 出庫・入庫（App 27 / 28 / 74）

| 区分 | App | 出庫（期間） | 入庫（期間） |
|------|-----|--------------|--------------|
| 海外外注 | 28 | `ship_date` | `overseas_in_date` |
| 和裁士 | 74 | `日ship_date`（ヘッダー） | 明細 `inbound_date`（**App74 全件 GET → JS で期間絞り**。サブテーブル日付は kintone クエリ不可） |
| 国内外注 | 27 | `ship_date`（ヘッダー） | 明細 `line_in_date`（**App27 全件 GET → JS で期間絞り**） |

件数は **distinct manage_no**。集計期間はダッシュボード上部と同じ日付範囲です。

## 5. App13 中分類

集計開始時に App13 を全件 GET し、画面下部に **マスタ上の中分類一覧** を表示します。  
仕立・悉皆・A550 の行ラベルは config の定義名と **App13 の値が完全一致** した明細のみ集計されます（不一致は A550 の「その他」等）。

## 6. qty 確認

集計後、画面下部に「qty≠1 の明細行数」を表示します。常に 0 なら実質 **1明細=1点** 運用です。

## 7. ②現場（V1.5.0 / v1.5a）

| 指標 | 定義 |
|------|------|
| 受注残着物枚数 | App16 **distinct manage_no** − App19 **納品済**（`delivery_detail.manage_no` に一度でも出現） |
| 加工残点数 | 受注残 manage_no の App16 明細 **qty 合計** |
| 納期超過 | 受注残のうち `deadline < 今日(JST)`（空欄は除外） |
| 7日以内納期 | 今日 ≤ deadline ≤ 今日+7日 |
| 今月納期 | deadline が当月 |

- **process_status** は完了判定に使いません（工程別内訳のみ）。
- **location_status** は保管場所別内訳（工程とは別）。
- 部門は V1 と同様 **A550 / 本社 / 全体**。
- 各数値行の **▶** から管理番号一覧で検算できます。

初回表示時、App16 / App19 を **全件ページング GET** するため、①の期間集計より時間がかかることがあります。

`process_status` / `location_status` の **選択肢マスタ**はリポジトリ内 `_tmp_app16_export` では確認できません。画面下部「集計の参考情報」に **実データで観測した値** を表示します。

## 8. ④お金（V1.6.0）

| 内容 | 定義 |
|------|------|
| 売掛残高等 | App **22** と同じ `CAYANAS_AREngine.buildReport()`（App35 請求済 + App21 充当） |
| 期間ツールバー | **①受注/納品のみ**に適用。④は基準日・当月入金で固定 |
| ▶ 取引先 | 未回収請求別内訳 |
| ▶ 請求行 | 入金履歴（App21 遅延 GET） |
| 入金登録 | App21 新規（`customer_code` + `invoice_no` クエリ） |

全列・フィルタ操作は **App22 売掛管理** へのリンクから利用できます。
