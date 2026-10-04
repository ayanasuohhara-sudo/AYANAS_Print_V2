# 工場入庫 V1 — kintone セットアップ

## 1. 専用アプリ（工場入庫）

1. kintone で新規アプリ **「工場入庫」**（名称は任意）を作成
2. 作成された **App ID** を `customize/factory_inbound_config.js` の **`FACTORY_INBOUND_APP_ID`** に設定

## 2. フォーム（最小）

| 種類 | フィールドコード | 用途 |
|------|------------------|------|
| 文字列1行 | `barcode_input` | 任意（将来 App34 連携用。V1 UI はパネル内入力） |
| スペース | **`factory_inbound_space`** | **必須** — 工場入庫パネル表示 |
| スペース | **`factory_sorting_space`** | **推奨** — 振り分けパネル表示（工場入庫と別エリア） |
| スペース | **`factory_work_space`** | **推奨** — 工場作業パネル表示 |

**スペースの追加手順（3エリア）**

1. App84 → **フォームの編集**
2. パーツ一覧から **スペース** を3つ配置（横並び1行がおすすめ）
3. 各スペースをクリック → 設定（歯車）→ **要素ID** を次のとおり **完全一致** で入力  

   | 用途 | 要素ID（必須） |
   |------|----------------|
   | 工場入庫 | `factory_inbound_space` |
   | 振り分け | `factory_sorting_space` |
   | 工場作業 | `factory_work_space` |

4. **フィールドコード** は任意で構いません。**要素ID** が JS の参照先です。
5. フォーム保存 → **アプリを更新** → レコード画面を再読み込み

要素ID未設定時は **工場入庫スペース内** に振り分け・工場作業も表示します（コンソールに案内が1回出ますが、**エラーではありません**）。

代替: 工場入庫のみ `factory_inbound_space` が無い場合は `message_space` にフォールバックします。

レコードは **1件だけ** 作成し、常にそのレコードを開いて運用しても構いません（履歴は App16 側）。

## 3. JavaScript 登録（工場入庫アプリのみ）

**この順序で** デスクトップに登録:

1. `customize/order_line_classifier.js`
2. `customize/factory_inbound_config.js`（App ID 設定後）
3. `customize/factory_inbound_engine.js`
4. `customize/factory_inbound_desktop.js`
5. `customize/factory_sorting_engine.js`
6. `customize/factory_sorting_desktop.js`
7. `customize/factory_work_engine.js`
8. `customize/factory_work_desktop.js`
9. `customize/factory_portal_layout.js`（3エリア横並び — **最後**に登録）

**横並び表示:** フォームで3スペースを **同じ行** に並べると自動で横並びになります。スペース未設定で1つにまとまっている場合も横並びです。狭い画面では折り返し（wrap）します。

## 4. 権限

- 工場入庫アプリ: レコード閲覧・編集
- App **16**: GET / PUT（`location_status`, `work_status`）
- App **13**: GET（商品マスタ全件 — 初回表示時）

## 5. 変更しないアプリ

App34 / App30 / App78 / App27 / App28 / App74 / App19 / App35 / App82 — **JS 変更なし**

## 6. 運用

1. 工場入庫アプリのレコードを開く
2. 管理番号をスキャン → 確認表示
3. **工場入庫する** で App16 更新
4. 連続スキャンは入力欄が自動クリアされ次を待機

**App34** は従来どおり `location_status` のみ（工場以外の単純移動）。

## 7. 振り分け（同一 App84）

1. フォームに **【工場入庫】**（`factory_inbound_space`）と **【振り分け】**（`factory_sorting_space`）を別スペースで配置
2. 管理番号を **連続スキャン** → 現在地・作業ステータスを表示 → **ドロップダウンで操作を手選択** → 実行
3. 状態によるボタンの自動出し分けは **しません**（イレギュラー対応）。確認ダイアログ → PUT 直前に再 GET
4. `process_status` / `delivery_status` は更新しません

| ボタン | location_status | work_status |
|--------|-----------------|-------------|
| 丸洗いへ | 工場 | 丸洗い待ち |
| 店舗しみ抜きへ | 店舗 | しみ抜き待ち |
| 仕上げへ | 工場 | 仕上げ待ち |

## 8. 工場作業（同一 App84）

1. スペース **要素ID `factory_work_space`**（未設定時は `factory_inbound_space` 下に暫定表示）
2. **連続スキャン** → **ドロップダウンで作業を手選択** → 実行（自動判別なし）
3. 丸洗い開始／完了は PUT **`work_status` のみ**。仕上げ完了も同様
4. 確認ダイアログ → PUT 直前に再 GET（最新の現在地・作業を確認表示）

| 現在 work_status | ボタン | 更新後 work_status |
|------------------|--------|-------------------|
| 丸洗い待ち | 丸洗い開始 | 丸洗い中 |
| 丸洗い中 | 丸洗い完了 | 仕上げ待ち |
| 仕上げ待ち | 仕上げ完了 | 仕上げ完了 |

振り分け待ち・仕上げ完了済み・工場以外は操作不可。App30 完了登録は別工程のまま。
