# 店舗しみ抜き作業 V1 — App85 セットアップ

## 1. アプリ

- **店舗入庫・ステータス管理** App ID **85**
- App84（工場）とは JS・スペースを共有しません

## 2. フォーム

| 種類 | 要素ID | 用途 |
|------|--------|------|
| スペース | **`store_work_space`** | 店舗しみ抜き UI |

要素IDを **`store_work_space`** に設定（フィールドコードは任意）。

## 3. JavaScript 登録（App85 のみ）

1. `customize/order_line_classifier.js`
2. `customize/store_work_config.js`
3. `customize/store_work_engine.js`
4. `customize/store_work_desktop.js`

## 4. 権限

- App85: レコード閲覧・編集
- App **16**: GET / PUT（`location_status`, `work_status`）
- App **13**: GET（商品マスタ）

## 5. V1 操作

| 操作 | 条件 | 更新 |
|------|------|------|
| しみ抜き開始 | 店舗 / しみ抜き待ち | work → しみ抜き中 |
| しみ抜き完了・工場へ | 店舗 / しみ抜き中 | location → 工場、work → 仕上げ待ち |

`process_status` / `delivery_status` は更新しません。

## 6. 変更しないもの

App84 / App34 / App30 他 — 本 V1 では JS 変更なし
