# 店舗入金管理 S1 — 設計書（承認用）

- **作成**: 2026-11-01（Asia/Tokyo）
- **状態**: **S1 App97 作成済・コード実装済・本番 JS 未反映**（税仕様ロック → [`STORE_PAYMENT_S1_TAX_CONFIRMATION.md`](./STORE_PAYMENT_S1_TAX_CONFIRMATION.md)）
- **前提**: PCM App96 / App16 `personal_customer_id` 本番連携・E2E 完了済み
- **方針**: App21（法人入金）と分離。App8 / App19 / App21 / App35 は**変更しない**
- **確定仕様**: 税込正 / 一部入金引き取り原則禁止（管理者承認例外）/ 返金はマイナス別レコード / S1 先行・店舗 UI は次段

---

## 0. 事前確認結果

| 項目 | 結果 |
|------|------|
| PCM App96 | 稼働中。採番 App95。`personal_customer_id` = `P######` |
| App16 `personal_customer_id` | **本番追加済**（unique=false）。A550 新規は選択必須 |
| PCM×App16 E2E | **17/17 OK**（選択保存・ID残存・複製・履歴・法人非干渉） |
| App16 `detail_table.amount` | **CALC** `unit_price * qty`。税フィールドなし |
| 税込計算 | App16 に税なし。App19 は `tax = subtotal*0.1`, `total = subtotal+tax`。App35 は数値フィールド（プラグイン設定） |
| App21 | 1入金＋`payment_allocation`（**invoice_no 単位**）。`manage_no` / `transaction_id` なし。A550 入金 **0 件** |
| App19 A550 | `delivery_complete_sync.js` で **App16 納品済更新を除外**（維持） |

**結論**: S1 新規アプリが必要。法人 App21 に混ぜない。請求対象金額の正は当面 **App16 明細金額合計（税抜）** とし、税込は §3 で定義する。

---

## 1. S1 フィールド一覧

**アプリ名**: 店舗入金管理  
**App ID**: **97**（`STORE_PAYMENT_APP_ID` 設定済。本番 JS は未デプロイ）

### 1.1 ヘッダ

| コード | ラベル | 種類 | 必須 | 備考 |
|--------|--------|------|------|------|
| `store_payment_no` | 入金番号 | 文字列1行 | ○（採番後） | 例: `SP-YYMMDD-######`。JS 採番＋unique 推奨 |
| `personal_customer_id` | 個人顧客ID | 文字列1行 | ○ | PCM と同一。氏名のみでの特定禁止 |
| `client_name_snapshot` | お客様名（当時） | 文字列1行 | — | 登録時コピー。PCM 改名の影響を受けない |
| `payment_date` | 入金日 | 日付 | ○ | |
| `payment_amount` | 入金額 | 数値 | ○ | ヘッダ合計。明細充当合計と一致必須 |
| `payment_method` | 入金方法 | DROP_DOWN | ○ | 現金 / クレジットカード / その他（初期）。スマレジ連携時に拡張 |
| `pos_transaction_id` | スマレジ取引番号 | 文字列1行 | — | 手入力／将来 API。空可 |
| `payment_staff` | 担当者 | ユーザー選択 | ○ | 操作者 |
| `transaction_id` | 処理ID | 文字列1行 | ○ | **unique**。重複登録防止（§6） |
| `payment_status` | 入金処理状態 | DROP_DOWN | ○ | 有効 / 取消 / 返金済（§4） |
| `payment_channel` | 入金チャネル | DROP_DOWN | ○ | 店舗 / WEB / 移行（将来 WEB 拡張） |
| `payment_timing` | 入金タイミング | DROP_DOWN | — | 受付時 / 引き取り時 / その他 |
| `related_refund_of` | 返金元入金番号 | 文字列1行 | — | 返金レコードが元 `store_payment_no` を参照 |
| `cancel_reason` | 取消・返金理由 | 複数行 | — | |
| `cancel_datetime` | 取消日時 | 日時 | — | |
| `notes` | メモ | 複数行 | — | |

### 1.2 採番

- `store_payment_no`: カウンタ App または S1 内 revision 排他（PCM 採番と同型）。欠番許容。
- `transaction_id`: クライアント生成 UUID（または `端末ID + 時刻ms + 乱数`）。**サーバ側 unique 制約で最終防御**。

---

## 2. 商品別充当テーブル

サブテーブルコード案: `store_payment_lines`

| コード | ラベル | 種類 | 必須 | 備考 |
|--------|--------|------|------|------|
| `order_record_id` | App16レコードID | 数値 | ○ | 正の識別子 |
| `manage_no` | 管理番号 | 文字列1行 | ○ | 検索・バーコード表示用 |
| `personal_customer_id_line` | 個人顧客ID（行） | 文字列1行 | ○ | ヘッダと一致必須 |
| `kimono_type_snapshot` | 着物種類（当時） | 文字列1行 | — | |
| `billed_amount` | 請求対象額（スナップショット） | 数値 | ○ | 登録時点の受注請求額（§3） |
| `allocated_amount` | 今回充当額 | 数値 | ○ | ≥0。取消行は 0 のままヘッダ取消 |
| `previously_paid_amount` | 充当前累計入金 | 数値 | ○ | 登録時点の有効入金合計 |
| `balance_after_line` | 充当後残額 | 数値 | ○ | `billed_amount - previously_paid - allocated`（計算 or JS セット） |
| `line_note` | 行メモ | 文字列1行 | — | |

**制約（保存時 JS）**

1. 全行の `personal_customer_id_line` === ヘッダ `personal_customer_id`  
2. `Σ allocated_amount === payment_amount`  
3. 各行 `allocated_amount ≤ billed_amount - previously_paid_amount`（過剰充当禁止）  
4. 同一 `transaction_id` の有効レコードが既にあれば拒否  
5. 同一 `order_record_id` が「残額 0 の入金済」なら新規充当拒否（再入金防止。取消後は可）

---

## 3. 金額計算仕様

### 3.1 App16 現状（実測）

| 項目 | 内容 |
|------|------|
| 明細金額 | `detail_table.amount` = **CALC** `unit_price * qty` |
| ヘッダ税 | **未設置**（税抜・税込フィールドなし） |
| 実測例 | 変色直し 単価 8000 × 1 → amount 8000 |

### 3.2 法人側との整合（参照のみ・変更しない）

| App | 税の扱い |
|-----|----------|
| App19 納品 | `subtotal = SUM(unit_price)`, `tax = subtotal*0.1`, `total = subtotal+tax`（CALC。端数は kintone 計算の既定） |
| App35 請求 | `subtotal` / `tax` / `total` / `invoice_amount` は数値（プラグインが設定）。入金消込の正は**税込請求額** |
| App21 | 充当先は `invoice_no`。店舗 manage_no 非対応 |

### 3.3 S1 での請求対象額（提案）

```text
order_billed_ex_tax(order) = Σ detail_table.amount   // 税抜
order_billed_in_tax(order) = round_tax(order_billed_ex_tax)  // 税込表示・スマレジ突合用
```

| モード | 定義 | 用途 |
|--------|------|------|
| ~~A. 税抜正~~ | — | 不採用（ユーザー確定: 税込正） |
| **B. 税込正（採用）** | 充当・残額は税込 | 店舗会計・スマレジ突合 |

**端数処理（確定）**

- 受注単位: `tax = Math.round(ex_tax * 0.1)`, `in_tax = ex_tax + tax`  
- 根拠: 印刷プラグイン `js/core.js` / 納品テンプレと同型  
- スマレジ店舗の税丸めが切り捨て/切り上げの場合は運用前に `TAX_ROUNDING` を変更し POS 突合

### 3.4 残額

```text
paid_to_date(order) = Σ S1.allocated_amount
  where payment_status = 有効
    and line.order_record_id = order.$id

balance(order) = billed(order) - paid_to_date(order)
```

- `balance <= 0` → 入金済  
- `0 < paid < billed` → 一部入金  
- `paid == 0` → 未入金  

### 3.5 金額変更後（App16 改訂）

| ケース | 扱い |
|--------|------|
| 値上げ後 `billed > paid` | 残額増加。追加入金可 |
| 値下げ後 `billed < paid` | **過剰充当**検出。新規入金ブロック。取消または返金フローへ誘導 |
| 明細追加・削除 | 都度 `billed` を再計算。スナップショットは各入金時点の値を履歴として残す |

S1 は登録時に `billed_amount` をスナップショット保存する。一覧の「現在残額」は **都度 App16 再計算 − 有効充当合計**。

---

## 4. 入金状態の判定方法

### 4.1 S1 ヘッダ `payment_status`

| 値 | 意味 |
|----|------|
| 有効 | 通常の入金。残額計算に含める |
| 取消 | 誤登録取消。履歴残置。残額計算から除外 |
| 返金済 | 元入金に対する返金側、または元側を返金完了にした印（運用は一方を正とする §10） |

### 4.2 受注（App16）側の導出状態（フィールド追加は任意）

計算のみでも可。一覧高速化のため後続で App16 に非必須フィールドを足す案:

| 導出 | 条件 |
|------|------|
| 未入金 | `paid_to_date == 0` |
| 一部入金 | `0 < paid < billed` |
| 入金済 | `paid >= billed` かつ `billed > 0` |
| 過剰入金 | `paid > billed`（異常） |

**氏名だけでは判定しない。** キーは `personal_customer_id` + `order_record_id` / `manage_no`。

### 4.3 ユースケース対応

| # | ケース | 判定・処理 |
|---|--------|------------|
| 1 | 受付時全額入金 | 受注直後に `allocated = billed` の S1 作成。引き取り時は入金スキップ可 |
| 2 | 引き取り時全額入金 | 残額全額を 1 レコードで充当 → 成功後に引き取り更新（別シェル App） |
| 3 | 一部入金 | `allocated < balance`。状態=一部入金。引き取り可否はポリシー（§10） |
| 4 | 複数商品一括 | 1 ヘッダ＋複数行。同一 `personal_customer_id` のみ |
| 5 | 商品ごと残金 | 行ごと `balance_after_line` / 画面再計算 |
| 6 | 再入金防止 | 残額 0 の order は選択不可 |
| 7 | 取消・返金 | §5 |
| 8 | 重複防止 | `transaction_id` unique + 画面二重送信ガード |

---

## 5. 入金・返金・取消処理

### 5.1 入金登録（正常系）

```text
1. 店舗画面で personal_customer_id 確定（PCM）
2. App16 から未完了/対象受注を取得（ID 一致）
3. 各 order の billed / paid / balance を計算
4. ユーザーが行選択・充当額入力
5. transaction_id を発行
6. バリデーション（§2・§3）
7. S1 レコード POST（payment_status=有効）
8. 成功後のみ「引き取り完了」等の後続へ進む
   ※ 入金失敗時は App16 を納品済にしない
```

### 5.2 取消

- `payment_status` を **取消** に変更（物理削除しない）
- `cancel_reason` / `cancel_datetime` / 担当を記録
- 権限: 管理者または店舗責任者
- 取消後、当該充当は残額計算から除外 → 再入金可能
- 既に引き取り済（App16 `delivery_status=納品済`）の場合は **取消前に警告**。納品戻しは別権限・別操作（S1 だけでは自動戻ししない推奨）

### 5.3 返金

| 方式 | 内容 |
|------|------|
| **推奨** | 新規 S1 レコード（`payment_amount` 負、または `payment_status` 専用＋正額＋種別=返金）で `related_refund_of` に元 `store_payment_no` |
| 明細 | 元と同じ `order_record_id` に負の `allocated_amount`、または返金額を行按分 |

返金後の `paid_to_date` は有効入金 − 有効返金。

### 5.4 失敗時

| 失敗箇所 | 対応 |
|----------|------|
| S1 POST 失敗 | リトライ。App16 は未変更 |
| S1 成功・引き取り PUT 失敗 | 入金は残す。画面「入金済・引き取り未反映」。再実行は App16 のみ |
| 途中で二重クリック | 同一 `transaction_id` で 2 件目を unique エラー |

---

## 6. 同時処理・重複防止

| 層 | 対策 |
|----|------|
| UI | 送信中ボタン disabled。`transaction_id` を submit 前に固定 |
| S1 | `transaction_id` **unique**。衝突時は「既に処理済み」として既存を返す（冪等） |
| 業務キー（任意） | 補助インデックス: `personal_customer_id + payment_date + payment_amount + sorted(manage_nos)` の警告（App21 と同様、完全ブロックは transaction_id に任せる） |
| App16 | 引き取り PUT は可能なら `revision` 付き。競合時は再読取し納品済なら成功扱い |
| 過剰充当 | 保存直前に App16 金額と有効 S1 合計を再取得して検証 |

---

## 7. 店舗専用画面との連携仕様

S1 は **データストア**。操作 UI は別シェル（案: 「店舗会計・引き取り」スペース App、A550 調査の案 A）を想定。

### 7.1 画面 → S1

| 操作 | API |
|------|-----|
| 顧客確定 | PCM 検索（既存 `order_pcm_*` / PCM App96） |
| 商品一覧 | App16 GET `personal_customer_id =` かつ未納品等 |
| バーコード | App16 `manage_no` 完全一致 → 行選択 |
| 会計確定 | S1 POST（本設計のバリデーション） |
| 引き取り | App16 PUT（`delivery_status=納品済` 等）。**App19 は使わない**（A550 除外維持） |

### 7.2 S1 → 画面表示

- 選択中商品の `paid_to_date` / `balance`
- 直近入金履歴（同一 `personal_customer_id`）
- 取消・返金は権限者メニュー

### 7.3 JS 構成案（実装フェーズ・承認後）

```text
store_payment_config.js
store_payment_numbering.js
store_payment_engine.js      # 金額・残額・冪等
store_payment_desktop.js     # S1 アプリ上の管理画面（任意）
store_pickup_desktop.js      # シェル App（別承認）
```

App16 の `saiban*` / `order_pcm_*` / 工程 JS は変更しない（必要なら読取のみ）。

---

## 8. WEB 決済への拡張方法

| 拡張点 | 内容 |
|--------|------|
| 識別 | 同一 `personal_customer_id`（WEB は PCM `web_verified=本人確認済` + `web_account_id`） |
| チャネル | `payment_channel=WEB` |
| 決済ID | `pos_transaction_id` の代わりに `psp_payment_intent_id` 等を追加、または同フィールドを汎用化 |
| 金額 | サーバ側で App16 billed を再計算し、クライアント額を信じない |
| 冪等 | WEB webhook の event id を `transaction_id` に使用 |
| 禁止 | 氏名・未確認メールのみでの入金紐付け |

店舗 S1 と WEB は **同一アプリ・チャネル分岐** を推奨（消込ロジック共通）。

---

## 9. テスト計画（実装・本番反映後）

| # | ケース | 期待 |
|---|--------|------|
| 1 | 受付時全額 1 商品 | 残額 0、再入金不可 |
| 2 | 引き取り時全額 | S1 成功後のみ納品済 |
| 3 | 一部入金 | 残額表示、追加入金可 |
| 4 | 同一個人 3 商品一括 | 1 ヘッダ複数行、合計一致 |
| 5 | 入金済の再選択 | ブロック |
| 6 | 同一 transaction_id 再送 | 2 件目作られない |
| 7 | App16 値上げ後 | 残額増、追加可 |
| 8 | App16 値下げで過剰 | 検出・新規入金不可 |
| 9 | 取消後の再入金 | 可 |
| 10 | 返金で related 紐付け | 残額復元 |
| 11 | 入金成功・引き取り失敗 | 入金残り、再実行で App16 のみ |
| 12 | 法人 App21 回帰 | 既存入金・消込が不変 |
| 13 | App19 法人納品 | A550 除外のまま |
| 14 | 氏名のみ検索で確定しようとする | UI 上不可 |
| 15 | PCM 未選択 | 入金不可 |

テストデータは `[TEST]` プレフィックス。実顧客データは変更しない。

---

## 10. 未確定事項

1. **税抜正 vs 税込正** — 初期推奨は税抜（App16 一致）。スマレジ税込突合が必須なら端数ルールを実機確認のうえ確定  
2. **一部入金での引き取り可否** — 禁止 / 許可（残金あり警告）  
3. **引き取り後の `location_status`** — `店舗` 維持 vs `納品済`（法人は後者）  
4. **返金レコードの符号モデル** — 負額 vs 別ステータス＋正額  
5. **App16 への `store_payment_status` 等の冗長フィールド** — 持つか、都度 S1 集計か  
6. **受付時入金の過去データの移行** — システム外（スマレジ）履歴の取り込み要否  
7. **店舗シェル App の新設タイミング** — S1 データモデル先行か UI 同時か  
8. **スマレジ API** — 対象外のまま手入力か、将来連携か  
9. **S1 入金番号の採番 App** — PCM カウンタ流用 vs S1 専用  
10. **取消時に納品済を自動戻すか** — 推奨は手動・権限者のみ  

---

## 11. 既存アプリへの影響（再確認）

| App | 影響 |
|-----|------|
| App8 | なし |
| App16 | 読取＋（任意）店舗状態フィールド追加は別承認。採番・PCM・工程 JS は維持 |
| App19 | **変更なし**（A550 除外維持） |
| App21 / App35 | **変更なし**（法人入金の正系） |
| App96 | 参照のみ（顧客識別） |

---

## 12. 承認後の実装順序（参考）

1. 本設計の未確定事項（特に税・一部入金引き取り）を決定  
2. S1 アプリ作成・フィールド・権限・unique  
3. 採番・`store_payment_*` JS・単体テスト  
4. （任意）店舗シェル App で入金 UI  
5. 引き取り連携（App16 PUT）は入金成功後のみ  
6. §9 テスト → 本番反映は都度承認  

**今回はアプリ作成・本番変更を行わない。**
