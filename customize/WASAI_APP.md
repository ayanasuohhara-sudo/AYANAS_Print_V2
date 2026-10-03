# 和裁士管理 JS 登録手順

**Version**: 1.0.0  
**App ID**: W1=73 / W2=74 / W3=75 / App16=16 / App13=13

---

## ファイル一覧

| ファイル | 登録先アプリ | 役割 |
|---------|-------------|------|
| `wasai_config.js` | 74, 75（必須）／統合入庫（入庫時） | 共通定数・API |
| `wasai_outbound_register.js` | **74** | 連続バーコード出庫 |
| `wasai_inbound.js` | **登録しない（将来・統合入庫のみ）** | `CAYANAS_WasaiInbound.applyWasaiInbound` |
| `wasai_inspection.js` | **74** | 詳細画面の検品ボタン |
| `wasai_payment_create.js` | **75** | 支払明細ロジック |
| `wasai_payment_desktop.js` | **75** | 一覧「支払明細作成」・詳細「確定/支払済」 |

---

## App 74（和裁士出庫）

**JavaScript/CSS でカスタマイズ**（PC）の読み込み順:

1. `wasai_config.js`
2. `wasai_outbound_register.js`
3. `wasai_inspection.js`

**操作**

1. 「レコード追加」で **出庫日**・**和裁士コード**（ルックアップ）を入力
2. **管理番号**を連続スキャン（1スキャン = App74 レコード1件 POST）
3. App16 が `和裁士作業中` / `和裁士` に更新

**出庫条件**

- App13 中分類が `国内仕立` または `修理` の明細が1件以上
- 和裁士マスタ（73）が `有効`

**入庫・検品**（App74 レコード **詳細 / 編集**）: `wasai_inspection.js` がスペースに UI を表示。

- **要素 ID = `action_space`**（推奨）— **レコード詳細・編集のレイアウトにも配置**（追加画面だけでは足りません）
- 無い場合は **`message_space`** にフォールバック（出庫登録用と共用可）

統合入庫 JS は **未組み込み**。

---

## App 75（和裁士支払明細）

**読み込み順**

1. `wasai_config.js`
2. `wasai_payment_create.js`
3. `wasai_payment_desktop.js`

**フォーム前提**

- レコード **詳細** にスペース **要素 ID = `action_space`**（確定・支払済ボタン）
- `payment_status` 選択肢: **作成中** / **確定** / **支払済** / **取消**（JS の `PAYMENT_STATUS` と一致）
- 対象期間From: 設計 `period_from` / 実機 **`period_fro`** の誤記あり → JS は両方に対応

**操作**

1. 一覧 → **支払明細作成** → 和裁士コード・入庫月（YYYY-MM）
2. 詳細 → **明細を確定** → 出庫側 `計上済`
3. **支払済にする** → 実支払日入力

**支払予定日**: 入庫月の **翌月末**（例: 入庫月 2026-10 → `2026-11-30`）

**抽出条件**

- `inbound_date` が対象月内
- `billing_status = 未計上`
- `line_status` が `支払対象` または `検品OK`
- `inspection_result` が `再加工` / `保留` / `検品NG` **以外**

---

## App16 前提

出庫 JS は App74 POST **成功後**に App16 を更新します。選択肢が無い場合は **App74のみ登録**し警告を表示します。

| フィールド | 出庫時 | 入庫時（将来） |
|-----------|--------|----------------|
| `process_status` | **和裁士作業中** | **和裁士戻り**（または 外注戻り） |
| `location_status` | **和裁士** | **本社** |
| `wasai_in_date` | — | 任意（あれば入庫日を設定） |

**単体テスト**: App16 に上記を追加するまで、警告付きで App74 出庫のみ進みます。

---

## 端数処理

未確定のため **生の積み上げ**（`transaction_price × payment_rate` をそのまま保存）。

---

## App74 / App75 単体テスト（統合入庫なし）

**登録する JS**

| App | ファイル |
|-----|---------|
| 74 | `wasai_config.js` → `wasai_outbound_register.js` → `wasai_inspection.js` |
| 75 | `wasai_config.js` → `wasai_payment_create.js` → `wasai_payment_desktop.js` |

**`wasai_inbound.js` は kintone に登録しない。** `docs/INBOUND_UNIFIED_*` も触らない。

### 和裁士出庫伝票（AYANAS Print プラグイン）

- **App 74** レコード詳細 → **和裁士出庫伝票** ボタン（外注出庫伝票と同じ A4 横・左半分×2）
- **加工内容**: App16 `detail_table` の **`item_name`**（App13 中分類が「国内仕立」「修理」「修理・直し」の行のみ）
- **備考**: App74 の備考（`remarks` 等）を入力したときだけ伝票に印刷（未入力・`-` は非表示）
- 出庫時に保存した **`wasai_payment_item_snapshots`** があればそちらを優先。なければ受注を再取得
- プラグイン **v125** 以降。`npm run pack` 後に kintone へ再アップロード

### 1. 出庫（74）

1. W1（73）に和裁士1件、`registration_status = 有効`
2. App16 に `detail_table` で **国内仕立**（＋任意で丸洗い）の受注
3. 74「レコード追加」→ 出庫日・和裁士 → 管理番号スキャン
4. 確認: 74 に `wasai_outbound_lines` / `wasai_payment_item_snapshots`、App16 が和裁士出庫工程

### 2. 入庫（74 詳細 / 編集 + `wasai_inspection.js`）

1. 出庫済みレコードを **詳細**（または編集）で開く
2. `action_space` の **【入庫】** で入庫日を指定 → **入庫登録**
3. 確認（App74 明細）: `inbound_date`、`line_status = 入庫済`
4. 確認（App16）: `process_status = 和裁士戻り`、`location_status = 本社`、（任意）`wasai_in_date`

**注意**: サブテーブルを **手入力して保存しただけ** では App16 は更新されません。必ず `action_space` の **入庫登録**（または **App16へ入庫を反映**）を使ってください。

### 3. 検品（74 詳細 / 編集）

1. **入庫済** の行に **【検品】** ボタンが表示される
2. **検品OK** → `inspection_result = OK`、`inspection_date = 当日`、`line_status = 検品OK`（支払対象・`billing_status` は未計上のまま）
3. **再加工** → `rework_note` 入力、`line_status = 再加工`（支払対象外）
4. **保留** → `line_status = 保留`（支払対象外）

### 4. 支払明細（75）

**印刷**: レコード詳細 → AYANAS Print **支払明細書 印刷**（`payment_statement_lines` の保存値を使用。v127+）。詳細は `docs/WASAI_PAYMENT_STATEMENT_PRINT.md`。

1. 一覧 **支払明細作成** → 和裁士コード・入庫月（手順2の `inbound_date` の年月）
2. プレビュー件数・合計を確認 → 作成
3. 詳細 **明細を確定** → 74 行が `計上済` / `billing_status = 計上済`
4. （任意）**支払済にする**

### 5. 除外確認（任意）

- 同管理番号で **再加工** または **保留** にした行は 75 抽出 **対象外**
- **丸洗いのみ** の App16 は 74 出庫 **不可**

---

## テスト手順（最小・一覧）

1. 国内仕立＋丸洗い → 出庫・スナップショット金額
2. 手動入庫 → 検品OK
3. 75 明細作成 → 確定
