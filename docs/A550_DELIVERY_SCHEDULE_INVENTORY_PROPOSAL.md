# 店舗A550 — 納品書作成後のスケジュール／納品待ち在庫（調査・変更案）

- **作成**: 2026-11-01（Asia/Tokyo）
- **範囲**: 調査結果と変更案のみ。**既存 JS 修正・本番反映は未実施（承認待ち）**
- **独立性**: S1（App97 入金）とは分離。本変更は工程・場所・納品状態と表示のみ

---

## 0. 要約

| 現状 | 変更後（案） |
|------|----------------|
| 法人: App19 保存 → App16 を **納品済**（location も納品済）→ スケジュール対象外 | **変更しない** |
| A550: App19 保存 → App16 **更新なし** → App92 に残る | App19 保存 → App16 を **納品待ち**＋納品書識別を保持。`process` / `location` / `work` は触らない |
| 「納品待ち在庫」専用画面は **未実装** | App92 拡張または店舗専用画面に一覧を新設 |
| 引き取り完了 UI は未実装（S1 と連携予定） | 店舗画面で `delivery_status=納品済` → 在庫一覧から除外 |

**重要**: App30 完了登録が既に `delivery_status=納品待ち` を立てる。App92 は現状 **`納品済` のみ除外**。したがって「納品書作成済み」の識別は **`delivery_status` だけでは足りず、`delivery_no`（または専用フラグ）が必須**。

---

## 1. 調査結果（依頼 9 項目）

### 1.1 App92 のスケジュール表示条件

| 項目 | 内容 |
|------|------|
| App | **92**（店舗納期カレンダー）。JS: `store_deadline_{config,engine,desktop}.js` |
| 正本 | App16 読取専用。更新しない |
| 顧客 | `customer_code = "A550"` のみ |
| 月次カレンダー | 当月 `deadline` 範囲。**取消除外**。**`delivery_status = 納品済` を除外**（`aggregateMonth(..., {excludeDelivered:true})`） |
| KPI 納期超過 / 本日 / 7日以内 | 未納品済（`not in 納品済`）＋納期条件 |
| KPI「完了・納品待ち」 | クライアント側: `process_status=完了` **かつ** `delivery_status=納品待ち`（**location 条件なし**） |
| クエリ制約 | `process_status` は `=` 不可（GAIA_IQ03）のため完了判定は取得後フィルタ |

→ **納品待ちのままではスケジュールから消えない。** 消すには除外条件の追加が必要。

### 1.2 App19 納品書保存時の更新 JS

本番 App19 デスクトップ JS 順（実測）:

1. `internal_ops_config.js`
2. `complete_register_engine.js`
3. `delivery_completion_guard.js`（保存前・未完了なら完了補完確認）
4. `barcode_delivery.js`（バーコードで明細追加）
5. **`delivery_complete_sync.js`**（保存成功後の本処理）
6. `price_master_register.js`
7. `delivery_additional_item_guard.js` / `additional_item_engine.js`

`delivery_complete_sync.js` の流れ:

1. `create/edit.submit.success`
2. `delivery_no` 未採番かつ create かつ `delivery_date` あり → `N{YYYYMMDD}-{recordId}` を App19 に PUT
3. `isCorporateCustomer`（`customer_code !== '' && !== 'A550'`）のときだけ App16 同期
4. 明細の **ユニーク `manage_no`** ごとに App16 を GET → 1件なら PUT

法人 PUT 内容: `location_status=納品済`, `delivery_status=納品済`, `delivery_date`, `delivery_no`  
前提: `process_status=完了` でなければスキップ。`manage_no` 0件/複数件は更新せずアラート。

### 1.3 App19 の A550 除外処理

```text
isCorporateCustomer = customerCode !== '' && customerCode !== 'A550'
A550 / 空コード → App16 更新なし（console.info のみ）
delivery_no 採番は A550 も実行（App19 側）
```

→ 依頼どおり「法人の納品済更新」は現状維持可能。A550 向けは **別分岐の追加**になる（除外の「完全スキップ」をやめる）。

### 1.4 App16 ↔ App19 の管理番号関連

| 側 | フィールド |
|----|------------|
| App19 | サブテーブル `delivery_detail.manage_no`（1納品書に複数可） |
| App16 | ヘッダ `manage_no`（1受注1番号） |

紐付けキーは **`manage_no` 完全一致**。App16 `$id` は同期に使っていない。  
重複時は現行どおり更新停止。欠番（例: App19 #335 の `081326952`）は App16 0件。

実測: App19 A550 約12件。1枚に複数 `manage_no`（例 #608 に5件）／1件のみ（#643）の両方あり。

### 1.5 修正・削除・再作成

| 操作 | 現状 |
|------|------|
| **編集保存** | `edit.submit.success` でも同期実行。法人は再 PUT（既反映なら no-op） |
| **削除** | App19 に `delete` ハンドラ **なし**。App16 は巻き戻されない |
| **再作成** | 新規 create → 新しい `delivery_no`。旧番号の App16 側クリア処理なし |
| **明細から行削除して保存** | 法人: 残った manage_no のみ再同期。**外した行の App16 は戻さない** |

A550 でも同様のリスクがあるため、変更案で方針を明示する必要がある（§3.4）。

### 1.6 1枚だけ納品書を作成した場合

明細に載った `manage_no` **だけ**が対象。同じお客様の他商品は触らない。現行法人同期と同じ単位。

### 1.7 同一お客様の複数商品をまとめた場合

1 App19 レコード＋`delivery_detail` 複数行。各 `manage_no` を順に処理。失敗分はアラート列挙（法人現行）。A550 案も同型を推奨。

### 1.8 「納品待ち在庫」一覧の実装場所

| 候補 | 現状 |
|------|------|
| **専用 App / 画面** | **存在しない** |
| App92 KPI「完了・納品待ち」 | 近似だが **location=店舗を見ない**。納品書有無も見ない |
| App85 店舗作業 | しみ抜き用。在庫一覧ではない |
| App34 場所移動 | 入庫。一覧用途ではない |
| 店舗会計・引き取り UI | 設計のみ（S1 / A550 調査）。未実装 |

→ **新規表示ロジックが必要**（推奨: App92 に「納品待ち在庫」パネル、または次段の店舗画面）。

### 1.9 既存法人向け処理との競合

| 処理 | 競合 |
|------|------|
| 法人 `delivery_complete_sync` 納品済 PUT | A550 分岐を分離すれば **非干渉** |
| App30 完了登録（`delivery=納品待ち`） | **意味の二重利用**（完了時点でも納品待ち） |
| App16 `schedule_customer.js`（VIEW） | 納品済除外のみ。A550 も法人も同条件 |
| S1 入金 | 状態軸を触らない前提で **独立維持可** |
| 過去 A550 で既に `納品済`+`delivery_no` の行 | 旧運用／手修正の可能性。移行方針が必要 |

---

## 2. セマンティクス上の論点（承認前に固定したい）

### 2.1 `delivery_status=納品待ち` の二重意味

| タイミング | 現行の立て方 |
|------------|----------------|
| App30 / App19 完了補完 | `process=完了`, `work=仕上げ完了`, **`delivery=納品待ち`**（location は触らない） |
| 本依頼の納品書保存後 | **`delivery=納品待ち`**（process/location/work 不変） |

完了登録直後〜納品書前の商品も既に「納品待ち」。  
**スケジュール除外を「納品待ち」だけにすると、納品書未作成品まで消える**（注意事項違反）。

### 2.2 推奨: 納品書作成済みフラグは `delivery_no`

App16 に既存の `delivery_no` / `delivery_date` を A550 でも書き込む。

| 状態 | 判定案 |
|------|--------|
| スケジュール対象 | A550 かつ **未納品済** かつ **`delivery_no` 空**（＋現行の取消除外） |
| 納品待ち在庫 | A550 かつ `process=完了` かつ `location=店舗` かつ `delivery_status` ∈ {納品待ち} かつ **`delivery_no` 非空**（任意で強化） |
| 引き取り済 | `delivery_status=納品済` → 在庫・スケジュール双方から除外 |

`delivery_status→納品待ち` は依頼どおり実施しつつ、**除外キーは `delivery_no`** とする。

代替案（非推奨）: 新 DROP_DOWN 値「納品書作成済」— App30/34/92/一覧ビュー全体に波及。

---

## 3. 変更案

### 3.1 状態遷移（A550）

```text
[受注〜作業]
  delivery_status: 未納品（または空）
  delivery_no: 空
  → App92 スケジュール表示

[App30 完了登録]
  process=完了 / work=仕上げ完了 / delivery=納品待ち
  delivery_no: まだ空
  → App92 スケジュールに残す（納品書未作成）
  → KPI「完了・納品待ち」対象（現行）
  → 「納品待ち在庫」には出さない（納品書未作成）※方針A
     または location=店舗なら在庫に出す ※方針B（非推奨: 依頼は納品書後に在庫へ）

[App19 納品書保存（A550）]  ★新規
  delivery_status = 納品待ち（既に同じなら維持）
  delivery_no / delivery_date = App19 の値をコピー
  process / location / work = 変更しない
  → App92 スケジュールから除外（delivery_no 非空）
  → 納品待ち在庫: process=完了 AND location=店舗 のときのみ表示

[店舗画面で引き取り完了]  ★次段 UI
  delivery_status = 納品済
  （location は店舗のまま推奨。法人の location=納品済 には合わせない）
  → 納品待ち在庫から除外
```

**法人**: 現行のまま（location+delivery=納品済）。分岐を混ぜない。

### 3.2 修正対象（承認後）

| ファイル / 箇所 | 変更内容 |
|-----------------|----------|
| `customize/delivery_complete_sync.js` | A550 分岐を追加。`syncStoreOrdersAfterSlip`（仮）: manage_no 単位で App16 に `delivery_status=納品待ち`, `delivery_no`, `delivery_date` のみ PUT。法人関数は触らない |
| `customize/store_deadline_engine.js` (+ config/desktop) | 月次・KPI 納期系: **`delivery_no` 非空も除外**。新 KPI/パネル「納品待ち在庫」: 完了∧店舗∧（納品待ち）∧delivery_no 非空 |
| 単体テスト | `test_delivery_sync_*`, `test_store_deadline_engine.js` に A550 ケース追加 |
| 店舗引き取り UI | 別承認。S1 成功後に `delivery_status=納品済`（本提案の出口） |

**変更しない**: App8 / App21 / App35、法人向け PUT、`complete_register_engine` の完了定義（当面）、S1。

### 3.3 App19 A550 更新ルール（詳細）

1. `customer_code === 'A550'` のときのみ店舗同期
2. 対象は明細のユニーク `manage_no`
3. App16 GET: `manage_no` 一致が **ちょうど1件**以外はスキップ＋警告（法人と同型）
4. 既に `delivery_status=納品済` なら **上書きしない**（引き取り済の巻き戻し防止）
5. `delivery_no` が別番号で埋まっている場合: **警告してスキップ**（二重納品書）。運用で訂正
6. PUT フィールド: `delivery_status`, `delivery_no`, `delivery_date` のみ
7. `process_status !== 完了` でも依頼どおり delivery 更新は可。ただし **在庫一覧には出さない**（工場・未完了を店舗在庫に出さない）
8. 冪等: 同一 `delivery_no` / 日付 / 納品待ちなら no-op

### 3.4 修正・削除・再作成方針（要承認）

| 操作 | 推奨 |
|------|------|
| 明細追加して再保存 | 追加分のみ同期。既存は冪等 |
| 明細から外して再保存 | **自動で App16 を未納品に戻さない**（誤消し防止）。手動訂正手順を文書化 |
| App19 レコード削除 | v1 は自動戻しなし。必要なら後続で delete ハンドラ |
| 再作成（新 delivery_no） | 旧番号のまま残る可能性 → 二重防止ルール（§3.3-5）で検知 |

### 3.5 納品待ち在庫 UI（案）

**推奨実装場所: App92**（既存 A550 表示ハブ）

- タブまたは KPI カード「納品待ち在庫」
- 条件: `A550` ∧ `process=完了` ∧ `location=店舗` ∧ `delivery_status≠納品済` ∧ `delivery_no≠""`
- 表示: manage_no / お客様名 / 着物 / 納品番号 / 納期
- 工場・本社の完了品は出さない（依頼の注意事項）

代替: 店舗専用画面の「引き取り待ち」リストに統合（S1 連携時）。

### 3.6 引き取り時（次段・本提案の出口定義のみ）

店舗専用画面（未実装）で:

1. （任意）S1 入金成功
2. App16: `delivery_status=納品済`（+ `delivery_date` 当日など）
3. `location_status` / `process` / `work` は変更しない（推奨）
4. 結果として納品待ち在庫・App92 双方から消える

### 3.7 既存データの扱い

実測メモ（2026-11-01）:

- A550: 未納品50 / 納品待ち7 / 納品済30
- 納品待ち7件は多くが **本社・工場**。店舗かつ納品待ちは少数（例 `091026379`）
- 直近 App19 A550（#643,#608）紐づき App16 は既に **納品済** だが `delivery_no` 空のものあり（手修正または別経路の可能性）
- 古い A550 は `delivery_no` 付き納品済あり（除外ロジック導入前の同期痕跡の可能性）

移行: 自動一括はしない。本番反映後は **新規保存分から適用**。必要なら対象 manage_no の洗い出しスクリプトを別承認で。

---

## 4. テスト計画（承認・実装後）

| # | ケース | 期待 |
|---|--------|------|
| 1 | 法人納品書保存 | 従来どおり App16 納品済。回帰 |
| 2 | A550・1 manage_no 納品書 | delivery=納品待ち + delivery_no 設定。process/location/work 不変 |
| 3 | A550・複数 manage_no | 行ごと反映。一部失敗は他に影響しアラート |
| 4 | 納品書前の完了品 | delivery_no 空 → **スケジュール残存** |
| 5 | 納品書後・工場在庫 | スケジュール除外。**在庫一覧に出ない** |
| 6 | 納品書後・店舗在庫 | スケジュール除外。**在庫一覧に出る** |
| 7 | 引き取り完了 | 納品済 → 在庫から消える |
| 8 | manage_no 重複 / 欠落 | 更新しない |
| 9 | 既に納品済 | 上書きしない |
| 10 | S1 入金のみ | 工程・在庫状態が変わらない |

---

## 5. 承認してほしい事項

1. **スケジュール除外キー**を `delivery_no` 非空とする（§2.2）でよいか  
2. A550 の App19 保存時 PUT を `delivery_status` / `delivery_no` / `delivery_date` のみに限定してよいか  
3. **納品待ち在庫**を App92 に追加する案でよいか（別 App 不要）  
4. App19 削除・明細除外時の **自動戻しは v1 でやらない**でよいか  
5. 引き取り時の `location_status` は **店舗のまま**でよいか  
6. 実装・本番 JS 反映の承認（本ドキュメントは調査・案のみ）

---

## 6. 参考コード位置

| 内容 | パス |
|------|------|
| A550 除外・法人同期 | `customize/delivery_complete_sync.js` |
| 完了補完（納品待ち） | `customize/complete_register_engine.js` `buildCompletePutRecord` |
| App92 除外・KPI | `customize/store_deadline_engine.js` |
| App16 顧客別スケジュール | `customize/schedule_customer.js`（納品済除外のみ） |
| 店舗全体調査 | `A550_store_system_investigation.md` |
