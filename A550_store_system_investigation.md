# A550 店舗専用「入金登録・引き取り完了一括処理」調査・設計資料

- **調査日**: 2026-10-31（Asia/Tokyo）
- **範囲**: 調査と設計のみ（本番変更・デプロイ・データ更新なし）
- **調査手段**:
  - リポジトリ内 JS / docs（パス明記）
  - 本番 kintone フォーム定義・レコードの**読み取り専用** API（`/k/v1/app/form/fields`, `/k/v1/records`）

---

## 1. 現在のアプリ構成

| App ID | 名称（運用上） | 役割 | 店舗A550との関係 |
|--------|----------------|------|------------------|
| 8 | 顧客管理 | 請求先マスタ（法人／店舗） | A550=店舗共通コード1件。個人顧客マスタではない |
| 13 | 商品マスタ | 商品・中分類 | App92 分類参照 |
| 16 | 受注明細 | **正本**（工程・場所・作業・納品・管理番号） | A550 受注の正本。現状 87 件 |
| 19 | 納品書作成 | 納品書・法人向け App16 納品済同期 | **A550 は App16 更新しない** |
| 21 | 入金管理 V2 | 法人請求（App35）への充当入金 | A550 入金レコード **0 件**。`manage_no` なし |
| 30 | 完了登録 | バーコード完了 UI（スペースアプリ） | `process=完了` / `work=仕上げ完了` / `delivery=納品待ち` |
| 34 | 保管場所移動（社内入庫） | 本社／工場／店舗への移動 | 完了品は location のみ更新可 |
| 35 | 請求書作成 | 法人請求 | App21 の充当先。店舗都度会計の正本ではない |
| 78 | 総合入庫 | 外注／海外／和裁士戻り | A550 直接対象外（工程中の戻り） |
| 88 | 受注検索（社内） | 検索 UI | 店舗専用ではない |
| 92 | 店舗納期カレンダー | **A550 表示専用** | 正本は App16。更新しない |
| 85 | 店舗しみ抜き（docs） | docs 上は App85 | **本番で App 不存在（削除済の可能性）** |

関連追加（調査で確認）:

| App | 備考 |
|-----|------|
| 74 / 27 / 28 | 和裁士・国内外注・海外出庫（入庫78経由）。引き取り画面の直接対象外 |
| portal-customize | ポータルバナー・アプリ一覧見た目 |

参照: `customize/internal_ops_config.js`, `customize/store_deadline_config.js`, `customize/PAYMENT_V2_README.md`, `docs/STORE_WORK_SETUP.md`

---

## 2. 各アプリの実際のフィールドコード一覧

### 2.1 App16（受注明細）— 本番フォーム実測

| 項目（調査指示） | フィールドコード | 種類 | 選択肢 / 備考 |
|------------------|------------------|------|----------------|
| 顧客コード | `customer_code` | 文字列1行 | A550 識別キー（店舗共通） |
| 顧客名 | `customer_name` | 文字列1行 | 実測値は多く `ayanasu` |
| お客様名 | `client_name` | 文字列1行 | **個人の区別は現状これ中心** |
| 管理番号 | `manage_no` | 文字列1行 | 業務キー |
| 工程 | `process_status` | DROP_DOWN | 外注中 / 完了 / 外注戻り / 海外戻り / 検品仕上中 / 海外外注中 / 店舗作業中 / 工場作業中 / 和裁士戻り / 受注 / 問合中 / 和裁士作業中 |
| 保管場所 | `location_status` | DROP_DOWN（必須） | 海外 / 工場 / 納品済 / 和裁士 / 店舗 / 外注先 / 本社 |
| 作業 | `work_status` | DROP_DOWN | 仕上げ中 / しみ抜き中 / 未着手 / 丸洗い待ち / しみ抜き待ち / 仕上げ完了 / 再直し中 / 丸洗い中・乾燥 / 修理中 |
| 納品 | `delivery_status` | DROP_DOWN | 納品待ち / 納品済 / 未納品 |
| 受注金額・税込金額 | **未設置（ヘッダ）** | — | 金額は明細のみ |
| 明細金額 | `detail_table.amount` | CALC | 行金額（税区分フィールドは App16 に**未設置**） |
| 明細単価/数量 | `unit_price` / `qty` | 数値 | |
| 入金状況・入金額 | **未設置** | — | App16 に payment_* なし |
| 納品日 | `delivery_date` | 日付 | 法人納品同期で使用 |
| 納品番号 | `delivery_no` | 文字列 | 法人同期で使用 |
| 引き取り日 | **未設置**（専用コードなし） | — | 現状は `delivery_date` / `delivery_status=納品済` で代用する設計余地 |
| 担当者 | `in_charge` | 文字列 | ラベル「得意先担当・係」。店舗スタッフ記録用としては弱い |
| 完了日 | `completion_date` | 日付 | App30 完了時に設定 |
| 納期 | `deadline` | 日付 | App92 表示 |
| 請求番号 | `invoice_no` | 文字列 | 法人請求連携用 |
| 集計状態 | `aggregation_status` | DROP_DOWN | 取消 / 有効 |

`detail_table` 子フィールド: `item_code`, `item_name`, `qty`, `unit_price`, `amount`, `price_unconfirmed`

### 2.2 App8（顧客管理）— 本番実測

| コード | ラベル | 備考 |
|--------|--------|------|
| `customer_code` | 顧客コード | A550 |
| `customer_name` | 顧客名 | ayanasu |
| `ドロップダウン` | 顧客区分 | 一般 / **法人**（A550 は法人） |
| `ドロップダウン_0` | 部門 | **店舗** / 本社 |
| `ドロップダウン_2` | 支払区分 | 締め払い / 都度払い |
| `closing_date` | 締日 | |
| `文字列__1行_` | 担当者 | システム名が自動生成 |
| `文字列__1行__2` 等 | 電話 / 携帯 / FAX | |
| 住所系 | `post_no`, `prefecture`, `city`, `address`, `building` | |

**個人顧客ID・会員番号フィールド: 未設置**

### 2.3 App21（入金管理 V2）— 本番実測

| コード | ラベル | 備考 |
|--------|--------|------|
| `payment_no` | 入金番号 | 1 レコード = 1 入金 |
| `payment_date` | 入金日 | |
| `payment_amount` | 今回入金額 | |
| `writeoff_amount` | 今回消込額 | |
| `payment_method` | 入金方法 | 振込 / クレジットカード / 現金 / その他 |
| `payment_record_status` | 入金ステータス | **有効 / 取消** |
| `customer_code` / `customer_name` | 取引先 | **請求先**（法人想定） |
| `client_name` | お客様名 | 存在するが、店舗個人キーとしては未運用 |
| `payment_allocation` | 入金充当明細 | **invoice_no 単位**（請求書 App35） |
| `manage_no` | — | **未設置** |

充当子フィールド例: `invoice_no`, `invoice_record_id`, `allocation_amount`, `cash_allocation`, `discount_allocation`, `fee_allocation`, `billing_target_amount`, `balance_before` / `after` 等

### 2.4 App19（納品書）

ヘッダ: `customer_code`, `customer_name`, `delivery_no`, `delivery_date`, `delivery_type`（工場引渡し/発送/本社納品/**店舗引渡し**）, `invoice_status`, `subtotal`/`tax`/`total_amount`（CALC）  
明細 `delivery_detail`: `manage_no`, `client_name`, `item_name`, `amount`, …

### 2.5 App30 / App34 / App92

- **App30 / App92**: 業務フィールドほぼなし（スペース＋システム項目）。ロジックは JS。
- **App34**: `barcode_input`, `location_status`（工場/店舗/本社）

### 2.6 A550 実データ概況（2026-10-31 読取）

- App16 `customer_code = "A550"`: **87** 件
- 未納品系の `client_name` 分布: 同名複数あり（例: 佐保山素子 9、山村若女①②③ など表記ゆれ対策の痕跡）
- 状態分布（抜粋）: `delivery_status` 未納品50 / 納品済30 / 納品待ち7  
- 「完了かつ店舗かつ未納品済」候補: 例 `091026379`（納品待ち・仕上げ完了）
- App21 `customer_code=A550`: **0** 件

---

## 3. 現在の JavaScript・プラグイン一覧（店舗／入金／納品関連）

| 領域 | ファイル | 対象 App | 更新有無 |
|------|----------|----------|----------|
| 店舗納期 | `customize/store_deadline_{config,engine,desktop}.js`, `store_deadline.css` | 92 | App16 **読取のみ** |
| 店舗しみ抜き | `customize/store_work_*.js` | docs上 85 | **App85 本番不存在** → 稼働状況は未確認 |
| 完了登録 | `customize/internal_ops_config.js`, `complete_register_{engine,desktop}.js` | 30 | App16 PUT（完了3軸＋完了日） |
| 場所移動 | `customize/location_inbound_{engine,desktop}.js` | 34 | App16 `location`（＋未完了時 process） |
| 納品同期 | `customize/delivery_complete_sync.js` | 19 | 法人のみ App16 納品済。**A550 除外** |
| 納品完了ガード | `customize/delivery_completion_guard.js` | 19 | 保存前補完。A550 除外ロジックはガード自体には無し（同期側で除外） |
| 入金 V2 | `customize/payment_create.js`, `payment_desktop.js` | 21（＋35 連携） | App35 同期。店舗 manage_no 非対応 |
| 顧客検索 | `customize/order_customer_search.js` | 16 ← App8 | 顧客コード／名検索 |
| 総合入庫 | `customize/inbound_unified_*.js` | 78 | 外注戻り系 |
| フロア／検索 | `floor_portal_*`, `order_search_*` | 各ポータル／88 | 社内向け |
| ポータル | `portal-customize/*` | ポータル | ナビ |

プラグイン: App21 では Invoice プラグイン無効推奨（`customize/PAYMENT_V2_README.md`）。印刷系は別リポジトリ Plugin。

---

## 4. App16 と App21 の入金連携状況

| 観点 | 現状 |
|------|------|
| App16 → App21 | **連携なし**（App16 に入金フィールドなし） |
| App21 → App16 | **連携なし**（充当先は App35 `invoice_no`） |
| A550 の入金履歴 | App21 に **0 件**。店舗会計はスマレジ等**システム外**の可能性が高い（スマレジ API は今回対象外） |
| 1レコード1入金 | App21 は 1 入金ヘッダ＋複数請求充当。取消は `payment_record_status=取消` |
| 二重登録防止 | 同一取引先・同日・同額の**警告のみ**（保存可）。`payment_create.js` |
| 部分入金 | 請求単位の一部入金は App35 `payment_status` で表現。**受注（manage_no）単位の部分入金モデルは未整備** |
| 法人影響 | App21/35 は法人売掛の正系。店舗画面がここに雑に書くと法人消込と混線する |

**結論**: 現状「受付時入金済み／引き取り時入金」を App16/21 で機械判定する手段が無い。店舗専用では **新規データモデルが必要**（App16 拡張、または店舗専用入金アプリ、または App21 拡張＋法人と分離）。

---

## 5. App19 との競合リスク

根拠: `customize/delivery_complete_sync.js`

```text
delivery_no 採番: 全顧客（A550含む）
App16 納品済連携: 法人のみ
isCorporateCustomer = customerCode !== '' && customerCode !== 'A550'
A550 / 空コード → App16 更新しない（console.info のみ）
```

法人更新内容（参考）: `location_status=納品済`, `delivery_status=納品済`, `delivery_date`, `delivery_no`

**店舗専用画面を追加しても壊さない条件**

1. App19 の A550 除外ロジックを**変更しない**
2. 店舗引き取り完了は **店舗専用 JS が App16 を直接更新**する（App19 経由にしない）
3. 店舗で App19「店舗引渡し」を使う場合でも、A550 なら現行どおり App16 は触られない → 店舗画面が唯一の納品済更新経路になる想定を明示
4. `delivery_completion_guard.js` は App19 保存時の完了補完。店舗画面は App19 を必須にしない設計が安全

---

## 6. 工程・場所・納品状態の遷移図

### 6.1 現行4軸（維持）

```text
process_status   : 全体工程（受注→作業中→完了 / 外注系 等）
location_status  : 現物場所（店舗/工場/本社/外注先/海外/和裁士/納品済）
work_status      : 現場作業（未着手〜仕上げ完了）
delivery_status  : 納品（未納品 / 納品待ち / 納品済）
```

更新主体:

| 操作 | 主な更新 | 実装 |
|------|----------|------|
| 完了登録 | process=完了, work=仕上げ完了, delivery=納品待ち, completion_date | App30 `complete_register_engine.js`（**location は触らない**） |
| 場所移動 | location（完了品は location のみ。未完了は店舗→店舗作業中 等） | App34 |
| 法人納品書 | location=納品済, delivery=納品済 | App19（A550除外） |
| 総合入庫 | 戻り系 process/location/work | App78 |

### 6.2 要望遷移 vs 現行値

| 要望 | 現行で実現できる写像 | 新規選択肢案（任意） |
|------|----------------------|----------------------|
| 作業完了＋店舗以外 →「店舗移動待ち」 | **現在値で表現可能**: `process=完了` + `delivery=納品待ち` + `location∈{工場,本社,…}`。専用ステータス「店舗移動待ち」は**未設置** | 追加するなら `delivery_status` か独自フラグ。**既存4軸を増やすと App30/34/92 全体に波及** → 原則は現行値で足りると判断 |
| 作業完了＋店舗 →「引き取り待ち」 | `process=完了` + `location=店舗` + `delivery=納品待ち`（App92 KPI「完了・納品待ち」と一致） | 「引き取り待ち」ラベル追加は任意（同義なら不要） |
| 引き取り待ち＋入金確認 →「引き取り済み」 | `delivery_status=納品済`（＋ `delivery_date`）。法人はさらに `location=納品済`。店舗は location を店舗のまま残すか `納品済` にするか要判断 | `pickup_at` / `pickup_user` 追加推奨 |

### 6.3 競合チェック（App30 / 34 / 78）

| 既存処理 | 店舗引き取りとの関係 |
|----------|----------------------|
| App30 | 納品待ちまで。引き取り済にはしない → **競合しにくい** |
| App34 | 店舗へ現物を運ぶ経路。引き取り画面は「店舗到着後」を前提 → **順序依存のみ** |
| App78 | 外注戻り。引き取り対象外が基本 → フィルタで除外 |
| App92 | 読取専用 → 競合なし |

---

## 7. 店舗専用画面の構成案

### 7.1 推奨ホスト

| 案 | 内容 | 評価 |
|----|------|------|
| **A. 新規スペースアプリ（推奨）** | 「店舗引き取り・入金」専用。App30/92 と同様に JS のみ | 法人 App19/21 を汚さない。権限・UI を独立 |
| B. App92 拡張 | 納期カレンダーに引き取りタブ | 表示と更新が同居し肥大化。可能だが非推奨 |
| C. App16 直カスタム | 一覧＋ダイアログ | 権限・誤操作リスク大 |

新規アプリは「UI シェル」であり正本は App16（＋入金ストア）。**必要性あり**（既存に同等画面なし）。

### 7.2 画面機能マッピング

| 機能 | 実現方法（案） |
|------|----------------|
| 管理番号バーコード検索 | App16 `manage_no` 完全一致（候補展開は既存 `expandManageNoCandidates` 流用可） |
| お客様氏名 | `client_name` |
| 着物・加工 | `kimono_type` / `kimono_spec` / `detail_table.item_name` |
| 同一個人の未引き取り一覧 | **要: 個人ID**。暫定は `customer_code=A550` + `client_name` 一致（同姓同名リスクあり） |
| 複数選択 | UI チェック＋一括確定 |
| 商品別入金状況 | **要: 入金モデル**（現状 App16/21 では不可） |
| 入金額・残額 | `Σ detail_table.amount` を税抜金額として表示。税込は**未確認／未設置** → 税ルールは未確定事項 |
| スマレジ会計確認 | **画面上の確認チェック（手動）**。API 連携なし |
| App21 入金登録 | そのままは不適。下記 §10–11 |
| App16 引き取り更新 | `delivery_status=納品済`, `delivery_date=当日`, 担当・日時フィールド |
| 二重防止 | サーバ側: 既に納品済なら no-op。入金は idempotency key |
| 訂正 | 入金取消ステータス＋納品済戻しは権限者のみ |
| iPad/PC | レスポンシブ。バーコードは Bluetooth スキャナ＋Enter（App78 と同様） |

### 7.3 画面フロー（案）

```text
スキャン manage_no
  → App16 取得
  → ガード（A550以外拒否 / 未完了警告 / 店舗以外警告 / 納品済なら「済」表示）
  → 同一個人の未引き取り候補を並列表示
  → 選択
  → 入金要否判定
       済 → 引き取りのみ
       未/一部 → 金額確認＋スマレジ確認チェック → 入金レコード作成 → 成功後に引き取り更新
  → 結果ログ
```

---

## 8. 追加が必要なフィールド（提案・未実装）

既存コード無断変更はしない前提の**追加案**。

### App16（正本）

| コード案 | 用途 |
|----------|------|
| `personal_customer_id` | 店舗個人 ID（必須化が本命） |
| `store_payment_status` | 未入金 / 一部入金 / 入金済（店舗） |
| `store_paid_amount` | 累計入金額 |
| `store_payment_ref` | 直近入金レコード ID / スマレジ伝票メモ |
| `pickup_datetime` | 引き取り日時 |
| `pickup_operator` | 引き取り担当（ユーザー選択推奨） |

※ `delivery_status=納品済` を「引き取り済み」の正とし、上記は監査・一覧用。

### 入金ストア（いずれか）

| 案 | 内容 |
|----|------|
| **S1. 店舗専用 App（推奨）** | `manage_no` 明細・個人ID・金額・取消。App21/35 に触れない |
| S2. App21 拡張 | `manage_no` 列追加＋`payment_channel=店舗`。法人充当ロジックを厳密にスキップする改修が必要 |

### App8

個人マスタが無いため、**App8 を個人台帳にするのは非推奨**（A550 は法人・店舗レコード）。個人は別 App または App16 上の ID 採番が妥当。

---

## 9. 既存 JavaScript の修正が必要な箇所（実装時・現時点では未着手）

| ファイル | 想定変更 | 必須度 |
|----------|----------|--------|
| `delivery_complete_sync.js` | **変更しない**（A550 除外維持） | — |
| `complete_register_engine.js` / `location_inbound_engine.js` | 原則変更なし。店舗画面が完了・移動後ステータスを前提にする | 低 |
| `store_deadline_*` | 任意で「引き取り可能」リンク | 低 |
| `payment_create.js` | S2 採用時のみ。S1 なら触らない | 条件付き |
| ポータルバナー | 店舗画面への導線追加 | 中 |

---

## 10. 新規 JavaScript の構成（案）

読込順例（新規店舗 App）:

1. `store_pickup_config.js` — App ID、フィールド、A550 定数、状態判定
2. `store_pickup_payment.js` — 入金 idempotent 登録・取消
3. `store_pickup_engine.js` — 検索・同一個人一覧・ガード・一括計画
4. `store_pickup_desktop.js` — バーコード UI・確認ダイアログ・iPad レイアウト
5. `store_pickup.css`

依存: 既存 `CAYANAS_INTERNAL_OPS` の状態定数を**参照のみ**で揃えると App30/34 と表現が一致する。

---

## 11. 入金登録・引き取り更新の整合性対策

### 11.1 順序（二重入金防止）

```text
1) App16 再読取（納品済なら入金も更新もしない）
2) 入金が必要なら「仮登録キー」で入金レコード作成
   - key = manage_nos sorted + payment_date + amount + terminal_id
   - 既存有効レコードがあれば再利用（再POSTしない）
3) 入金成功確定後にのみ App16 を納品済更新
4) App16 更新失敗時:
   - 入金は残す（取消しない）
   - 画面に「入金済・引き取り未反映」を表示し再実行は App16 のみ
```

これにより「入金成功後に App16 失敗」でも二重入金しない。

### 11.2 同時端末

- App16 PUT は `revision` 付きが望ましい（未確認: 現行他 JS は revision 未使用が多い）
- 先勝ち: 再読取で `delivery_status=納品済` なら成功扱いで終了

### 11.3 法人 App21 への影響

店舗入金を App21 に混ぜない（S1）か、混ぜるなら `customer_code=A550` かつ充当に `invoice_no` を必須にしない経路を分離し、`aggregateInvoiceFromPayments` から除外する。

---

## 12. 実装順序とテスト計画（実装フェーズ用）

1. 個人顧客 ID 方針の決定（§13）
2. App16 フィールド追加（支払・引き取り監査）
3. 入金ストア決定（S1/S2）とフォーム作成
4. 新規シェル App＋JS（読取→ガード→単件引き取り）
5. 入金＋一括
6. 訂正・権限
7. App92 / ポータル導線
8. 回帰: App19 法人納品、App21 法人入金、App30/34

### 例外ケース検証表

| ケース | 期待 |
|--------|------|
| 受付時全額入金済 | 入金スキップ、引き取りのみ |
| 引き取り時全額入金 | 入金1回→納品済 |
| 一部入金 | 残額表示。不足なら引き取りブロック or 許可はポリシー次第（未確定） |
| 3点中1点のみ | 選択行のみ更新 |
| 複数まとめて会計 | 1 入金レコードに複数 manage_no |
| 入金済だが工場に商品 | 警告。location≠店舗はデフォルトブロック |
| 加工未完了 | process≠完了はブロック |
| 再スキャン済 | 冪等で「済」表示 |
| 同姓同名 | 個人IDなしでは誤結合リスク → ID 必須化まで姓名のみ一覧は**補助** |
| 返品・キャンセル・返金 | 未確認（業務ルール要定義）。入金取消＋納品済戻しは権限者 |
| 入金後 App16 失敗 | §11.1 |
| 同時処理 | revision / 再読取 |

---

## 13. 判断が必要な未確定事項

1. **個人顧客の正 ID**（最重要）  
   - 現状: App8 に個人なし。App16 は `client_name` のみ。  
   - 案: (a) App16 に `personal_customer_id` を採番し受付時必須 (b) 個人マスタ App 新設 (c) 電話番号ハッシュ等（プライバシー要検討）
2. **税込金額の定義** — App16 に税フィールドなし。税込をスマレジ側正とするか、税抜 `amount` 合計か
3. **店舗入金の保管先** — S1（専用 App）vs S2（App21 拡張）
4. **引き取り済み時の `location_status`** — `店舗` のまま / `納品済` に合わせるか（法人は納品済）
5. **一部入金での引き取り可否**
6. **受付時入金の記録方法**（現状システム外の可能性）— 移行で過去分をどう埋めるか
7. **App85 店舗しみ抜き**の現行ホスト App — 本番 85 不存在。代替 App は未確認
8. **スマレジ確認**の運用（チェックボックス文言・必須か）
9. **返金・キャンセル**の会計と App16 `aggregation_status=取消` の関係
10. **「店舗移動待ち」を選択肢として追加するか** — 技術的には現行4軸で表現可能なため、追加はコスト対効果の判断

---

## 付録 A. A550 / 個人識別の現状と移行案

**現状**

- 店舗共通: `customer_code = "A550"`（App8 レコード ID 19、顧客区分=法人、部門=店舗）
- 個人: `client_name` のみ。同姓同名は運用で①②③等
- App16↔App8 個人連携: **なし**（`order_customer_search.js` は App8 の顧客コード選択のみ）

**移行案（段階）**

1. App16 に `personal_customer_id` 追加（空許容で開始）
2. 受付（受注登録）画面で A550 のとき個人 ID を必須化（新規のみ）
3. 既存オープン分は `client_name` + 電話（受付メモ）で手動突合、または一括で仮 ID 採番し名寄せ
4. 店舗画面の「同一人物一覧」は **personal_customer_id 一致のみ**（姓名一致はフォールバック表示に留める）

---

## 付録 B. 参照ファイル・設定情報

| 内容 | パス / 情報 |
|------|-------------|
| A550 除外 | `customize/delivery_complete_sync.js` |
| 完了 PUT | `customize/complete_register_engine.js` / `internal_ops_config.js` |
| 場所移動 | `customize/location_inbound_engine.js` |
| 店舗納期 | `customize/store_deadline_*.js` |
| 入金 V2 | `customize/payment_create.js`, `PAYMENT_V2_README.md` |
| 旧入金 docs（App36表記） | `docs/PAYMENT_APP.md`（現行本番は App21） |
| フィールド辞書（一部古い） | `docs/03_FieldDictionary.md` |
| 本番フォーム実測 | 2026-10-31 API GET app=8,16,19,21,30,34,78,88,92 |

---

## 付録 C. 設計上の結論（実装前サマリ）

1. **正本は App16**。引き取り済みは既存 `delivery_status=納品済` で足りる。  
2. **App19 の A550 除外は維持**し、店舗画面が App16 を更新する。  
3. **App21 は法人請求充当用**であり、現状 A550 入金ゼロ・`manage_no` なし → 店舗入金は専用モデルが必要。  
4. **個人特定は未整備**（`client_name` 依存）。本機能の前提として個人 ID 方針決定が先。  
5. **4軸は維持**。「店舗移動待ち／引き取り待ち」は現行値の組合せで表現可能。  
6. 実装は新規シェル App＋JS が既存法人フローへの影響最小。

---

## 付録 D. コードベース再確認で補強した点

（リポジトリ横断調査の追記。本番変更なし。）

| 項目 | 内容 | 参照 |
|------|------|------|
| **A550 を App16「納品済」にする自動経路が無い** | App19 同期は A550 をスキップ。他 JS にも A550 専用の納品済 PUT は見当たらない。店舗で App19 を使ってもスリップ採番のみ → **納品待ちのまま残りうる**。店舗専用画面が埋めるべき最大の穴 | `delivery_complete_sync.js` |
| **App19 ガードと同期の非対称** | `delivery_completion_guard.js` は A550 も完了補完しうる（`process=完了` / `delivery=納品待ち`）。一方同期だけ A550 除外。テストでも明示 | `scripts/test_delivery_completion_guard.js` ケース12 |
| **`customer_code` 空も App16 納品済同期スキップ** | A550 と同じく非法人扱い。一般客・空欄と店舗 A550 の切り分けは同期ロジック上ない | `isCorporateCustomer` |
| **店舗顧客マスタは未着手の予約コメントのみ** | ビジネスメニューに「アプリ完成後に追加」 | `customize/business_menu_config.js` |
| **和裁士支払率のみ A550 特例** | 既定 0.70、A550 は 0.65。入金・引き取りとは別系統 | `customize/wasai_config.js` |
| **店舗作業ポータル** | メニュー上 App87「店舗作業状況」。App85 しみ抜き docs は本番 App 不存在と整合（レガシー） | `business_menu_config.js`, `floor_portal_*` |
| **App92「引き取り候補」定義** | 表示専用: `process=完了` ∧ `delivery=納品待ち`（location 条件なし） | `store_deadline_engine.js` `isReadyForPickup` |

**現行 A550 フロー（ギャップ図示）**

```text
受注(A550 + client_name)
 → App34/作業/App30 … process=完了, delivery=納品待ち
 → App92/ポータルで「納品待ち」表示
 → App19 納品書: delivery_no 採番可 / App16 納品済は書かない
 → App21 入金: 請求(App35)がある場合のみ（店舗都度会計とは未接続）
 → App16 納品済: 手動 or 自動化なし ← 店舗専用画面の主目的
```

（本ドキュメント作成時点で、本番アプリ設定・JS・データの変更は行っていない。）
