# App 30（完了登録）JavaScript — 取得元メモ

## kintone REST API

- `GET /k/v1/app/customize.json?app=30` … **未実行**（環境に `KINTONE_API_TOKEN` なし）
- kintone 実機の登録順・ファイル名は **管理画面で要確認**

## 本フォルダの内容

| ファイル | 取得元 |
|----------|--------|
| `kanryou.js` | `C:\Users\user\Desktop\code\kanryou.js`（本番 JS ミラー、2026-10-04） |
| `kanryou1.js` | `C:\Users\user\Desktop\code\kanryou1.js`（同上） |

**CSS**: Desktop\code および本リポジトリ内に App30 専用 CSS は **見つかっていません**。

## App16 更新（要約）

両ファイルとも App16 PUT:

- `process_status` = **完了**
- `delivery_status` = **納品待ち**（App16 フィールド）
- `location_status` = **PUT しない**（現在地維持）

`location_status = 納品済` への更新は **なし**。
