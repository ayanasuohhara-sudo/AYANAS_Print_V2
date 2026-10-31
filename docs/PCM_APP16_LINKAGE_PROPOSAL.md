# PCM × App16 受注明細連携 — 実装前変更案（承認用）

- **作成**: 2026-11-01（Asia/Tokyo）
- **状態**: **実装承認済み・コード実装済み**。本番 kintone 反映は**再承認待ち**（`docs/PCM_APP16_LINKAGE_IMPLEMENTATION.md`）
- **前提**: PCM 第1段階は完了済み（App96 / 採番 App95）

---

## 1. 事前確認結果

### 1.1 PCM（完了済み）

| 項目 | 値 |
|------|-----|
| PCM App | **96**（個人顧客マスタ） |
| 採番 App | **95**（個人顧客ID採番） |
| 個人顧客ID | `personal_customer_id`（`P000001` 形式・unique） |
| 氏名 / かな | `customer_name` / `customer_kana` |
| 電話 | `phone` / `mobile_phone` |
| 検索・採番 JS | `customize/pcm_{config,numbering,engine,desktop}.js` + `pcm.css`（App96 登録済） |

### 1.2 App16（01_受注明細管理）現状

| コード | ラベル | 備考 |
|--------|--------|------|
| `customer_code` | 顧客コード | LOOKUP（App8）。A550 = 店舗 |
| `customer_name` | 顧客名 | 店舗は多く `ayanasu` |
| `client_name` | お客様名 | **現状の個人区別の主キー（表示）** |
| `manage_no` | 管理番号 | unique。採番は下記 JS |
| `order_date` / `deadline` | 受注日 / 納期 | |
| `kimono_type` | 着物種類名 | |
| `detail_table` | 加工内容（サブテーブル） | `item_name` 等 |
| `process_status` | 工程ステータス | |
| `location_status` | 保管場所ステータス | 必須 |
| `delivery_status` | 納品状態 | |
| `personal_customer_id` | — | **未設置** |
| `personal_customer_name` | — | **未設置** |

登録済デスクトップ JS（本番・変更しないもの）:

1. `saiban.js` — `create.submit.success` で `manage_no = MMDDYY + (recordId % 1000)` を PUT  
2. `saiban1.js` — `create.submit` で `manage_no` を空にする（複製時の旧番号持ち越し防止）  
3. `price_master_search11.js` / `category.js` / `price_master_register.js`  
4. `order_customer_search.js` — **App8** 顧客名部分一致（法人向け）  
5. `order_record_form.js` / `additional_item_engine.js` / `order_price_unconfirmed_clear.js` / `schedule_customer.js`

スペース: `customer_search_space`（既存・App8 検索用）

A550 例: `customer_code=A550`, `customer_name=ayanasu`, `client_name=個人名`。法人例: `A545` 等。App19/21/35 は本提案の対象外。

### 1.3 第1段階

**完了済み**のため本連携の設計・承認に進める。未完了ではない。

---

## 2. フィールド追加案（App16 のみ）

| コード | ラベル | 種類 | 必須 | 方針 |
|--------|--------|------|------|------|
| `personal_customer_id` | 個人顧客ID | 文字列1行 | なし（JS で A550 新規のみ検証） | unique にしない（同一個人の複数受注） |
| `personal_customer_name` | （追加しない） | — | — | 下記 §2.1 |

既存フィールドは削除・型変更・LOOKUP 差し替えしない。

### 2.1 `personal_customer_name` の要否

**結論: 追加しない（推奨）。**

| 案 | 内容 | 判定 |
|----|------|------|
| A. 追加しない | PCM 選択時に `client_name` ← `PCM.customer_name` | **採用**。既存印刷・一覧・現場が既に `client_name` 前提 |
| B. 追加する | ID と別スナップショット | 二重管理。ID と氏名の不一致が増える |

氏名確認表示は「選択結果バナー / 確認ラベル」で行い、保存値の氏名は従来どおり `client_name`。

フォーム配置案: `customer_code` / `client_name` 付近に `personal_customer_id`（閲覧中心・一般は JS で disabled）。空白スペース `pcm_customer_search_space` を新規追加（無ければ `customer_search_space` の下に DOM 挿入）。

---

## 3. JavaScript 変更案（リポジトリ新規＋PCM 追記）

### 3.1 新規（App16 に追加登録）

| ファイル | 役割 |
|----------|------|
| `customize/order_pcm_config.js` | `ORDER_APP_ID=16`, `PCM_APP_ID=96`, `STORE_CUSTOMER_CODE=A550`, フィールド対応 |
| `customize/order_pcm_engine.js` | PCM 検索（ID/氏名/かな/電話）。**氏名のみでの自動確定なし** |
| `customize/order_pcm_desktop.js` | A550 時のみ UI。選択・新規誘導・複製整合・submit 検証 |
| `customize/order_pcm.css` | 検索パネル／候補リスト |

登録順（既存の末尾付近・`order_customer_search.js` の後を推奨）:

`… order_customer_search.js` → **`order_pcm_config.js` → `order_pcm_engine.js` → `order_pcm_desktop.js` → `order_pcm.css`**

**触らない**: `saiban.js` / `saiban1.js`（管理番号採番を壊さない） / App8 検索の法人ロジック本体 / App19・21・35。

### 3.2 PCM App96 追記

| ファイル | 変更 |
|----------|------|
| `customize/pcm_desktop.js`（または `pcm_order_history.js`） | 詳細画面に「受注履歴」パネル |
| `customize/pcm_config.js` | `ORDER_APP_ID=16` と履歴表示フィールド定義を追加 |

履歴は App16 を `personal_customer_id = "..."` で GET（読取のみ）。

### 3.3 法人 App8 検索との関係

- `customer_code ≠ A550`: 現状どおり `order_customer_search.js` のみ。PCM UI **非表示**。`personal_customer_id` は空のまま（submit で触らない）。
- `customer_code = A550`: PCM 検索 UI を表示。App8 名検索は法人マスタ用として残すが、個人確定には使わない（候補クリックで個人を特定しない）。A550 固定は既存 LOOKUP／手入力を維持。

---

## 4. A550 受注時の動作（詳細）

```text
create/edit.show
  customer_code === "A550" ?
    YES → PCM 検索パネル表示
          personal_customer_id は disabled（手入力禁止・選択でのみセット）
    NO  → パネル非表示。個人IDをクリアしない（誤操作防止のため
          customer_code 変更イベントでのみクリア）

検索: personal_customer_id / customer_name / customer_kana / phone / mobile_phone
結果: 必ず ID + 氏名 + かな + 電話を並べ、クリックで選択（自動1件確定は「完全一致IDのみ」可）

選択時セット:
  personal_customer_id = PCM.personal_customer_id
  client_name          = PCM.customer_name
  （customer_code / customer_name は変更しない）

未ヒット:
  「PCMに新規登録」→ /k/96/edit を別タブ（または同窓）で開き、
  登録後に App16 側で再検索する導線（インライン完全新規フォームは第1段では任意。最小は別タブ誘導）

create.submit / edit.submit（A550）:
  - personal_customer_id 空 → エラー「店舗受注は個人顧客を選択してください」
    ※既存レコード編集で空のままの過去データは: 警告のみ許可（移行しない方針）。新規作成のみ必須。
  - ID 形式が P###### 以外 → エラー
  - client_name と PCM 上の氏名が食い違う場合（ID はあるが氏名を手で改変）:
      確認ダイアログ or エラー「個人顧客とお客様名が一致しません。再選択してください」
```

氏名だけで顧客を自動特定しない（候補クリック必須。例外は ID 完全一致の1件のみ）。

---

## 5. レコード複製

既存:

- kintone 複製（`#mode=copy`）はフィールド値をコピーする  
- `saiban1.js` が create.submit で `manage_no` を空にする  
- `saiban.js` が success 後に新規 `manage_no` を採番  

本機能:

| 項目 | 動作 |
|------|------|
| `personal_customer_id` | **引き継ぐ**（同一顧客の別着物向け） |
| `client_name` | 引き継ぐ |
| `manage_no` | 既存 saiban により **新規採番**（本 JS は触らない） |
| 複製後に別個人へ変更 | PCM 再選択で ID と `client_name` をセットし直し。ID だけ残して氏名だけ変えた保存は拒否 |

PCM アプリ側の「複製で ID クリア」とは逆方向（受注は同一顧客継続が目的）。

---

## 6. 顧客別受注履歴（PCM 詳細）

App96 レコード詳細にパネル「受注履歴（App16）」:

| 表示 | App16 フィールド |
|------|------------------|
| 受注日 | `order_date` |
| 管理番号 | `manage_no`（詳細リンク） |
| 着物種類 | `kimono_type` |
| 加工内容 | `detail_table` の `item_name` を連結（例: 最大3件+件数） |
| 納期 | `deadline` |
| 工程 | `process_status` |
| 現物場所 | `location_status` |
| 納品状況 | `delivery_status` |

クエリ: `personal_customer_id = "{id}" order by order_date desc, manage_no desc limit 50`  
未連携の旧 A550（ID 空）は出ない（移行しない方針どおり）。

---

## 7. 対象外・非変更

- App19 / App21 / App35 — 変更しない  
- 既存 A550 データの自動移行 — 行わない  
- `delivery_complete_sync.js` の A550 除外 — 維持  
- `saiban.js` / `saiban1.js` — 変更しない  
- 法人の顧客コード・顧客名・お客様名・価格検索・工程 — ロジック変更しない  
- WEB API・統合 UI・店舗会計 — 対象外  

---

## 8. テスト計画（承認後）

| # | ケース | 期待 |
|---|--------|------|
| 1 | A550 で既存 PCM を検索・選択 | ID・`client_name` 反映、保存可 |
| 2 | A550 で PCM 未登録 → 新規誘導 → 再選択 | 新規 ID で受注可 |
| 3 | 同姓同名が複数 | 候補に ID 並記、クリック選択のみ |
| 4 | 同一個人で連続登録（複製） | ID 引き継ぎ、`manage_no` は別番号 |
| 5 | 複製後に別顧客へ変更 | ID と氏名が一致 |
| 6 | 法人（A550 以外） | PCM UI なし、従来どおり |
| 7 | 管理番号自動採番 | 既存 saiban 動作のまま |
| 8 | PCM 詳細の受注履歴 | 同一 ID の App16 が一覧表示 |
| 9 | A550 新規で未選択保存 | エラー |
| 10 | 旧 A550（ID 空）の編集保存 | 警告のみで可（移行なし） |

テストデータは PCM と同様 `[TEST]` プレフィックス。

---

## 9. 実装手順（承認後）

1. リポジトリに `order_pcm_*` と PCM 履歴 UI を追加＋単体テスト  
2. App16 に `personal_customer_id` フィールド追加（フォーム配置）  
3. 必要ならスペース `pcm_customer_search_space`  
4. App16 に JS/CSS 登録（既存 saiban 等の順序を維持）  
5. App96 に履歴用 JS を更新デプロイ  
6. §8 テスト → 完了報告  

**本番反映は本提案の承認後のみ。**

---

## 10. 承認チェックリスト

- [x] App16 に `personal_customer_id` のみ追加（`personal_customer_name` は追加しない）  
- [x] A550 **新規**は個人顧客必須、**既存空レコードの編集**は警告のみ  
- [x] PCM 未登録時は別タブで App96 新規  
- [x] リポジトリ実装・単体テスト完了  
- [ ] **本番**フィールド追加・JS デプロイ（再承認後）  
