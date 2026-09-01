# 海外入庫（App 29）JavaScript 設定

## 目的

App 29（海外入庫）で管理番号を入力すると、次を自動更新する。

| アプリ | App ID | 更新フィールド |
|--------|--------|---------------|
| 受注明細 | 16 | `overseas_in_date` |
| 海外外注出庫 | 28 | `overseas_in_date`, `overseas_status`（全戻り） |

## 配置ファイル

`customize/overseas_nyuuko.js`

## kintone への登録手順

1. kintone 管理画面 → **App 29（海外入庫）** → 設定 → JavaScript / CSS でカスタマイズ
2. 既存の `overseas_nyuuko.js` / `overseas_com.js` を確認
3. **`overseas_nyuuko.js` のみ** を最新版に差し替え（重複登録は避ける）
4. 保存 → アプリを更新

## 対応する入力フィールド

次のいずれかが App 29 にあれば自動認識する。

- `barcode_input`
- `manage_no`
- `barcode`

## 動作

- 管理番号入力（バーコード読取含む）→ 200ms 後に自動処理
- 保存ボタン押下時も同処理を実行
- 入庫日は **JST（日本時間）の当日**
- App 28 は `manage_no` で検索、見つからない場合 `overseas_manage_no` でも検索

## 確認方法

1. App 29 で管理番号を入力
2. 「○○○○ 海外入庫完了」と表示される
3. App 16 / App 28 の該当レコードで `overseas_in_date` に当日が入る

## 注意

- App 28 に該当管理番号が無い場合、App 16 のみ更新される（警告はコンソール）
- `overseas_com.js` を同時に登録している場合は削除し、`overseas_nyuuko.js` に統一すること
