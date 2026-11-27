# App 34（保管場所移動）JavaScript — 取得元メモ

## kintone REST API

- `GET /k/v1/app/customize.json?app=34` … **未実行**（環境に `KINTONE_API_TOKEN` なし）

## 本フォルダの内容

| ファイル | 取得元 |
|----------|--------|
| `hokan_move.js` | `C:\Users\user\Desktop\code\hokan_move.js` |
| `locatinal.js` | `C:\Users\user\Desktop\code\locatinal.js` |

**CSS**: 見つかっていません。

## App16 更新（要約）

- **`process_status` は更新しない**
- **`location_status` のみ** PUT（値は App34 フォーム上の `location_status` 選択）

`工場作業中` / `店舗作業中` への **process_status 変更はなし**。
