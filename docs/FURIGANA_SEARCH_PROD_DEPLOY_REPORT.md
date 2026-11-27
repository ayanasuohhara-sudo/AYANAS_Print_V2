# ふりがな予測検索 — 本番反映レポート

反映日時: 2026-11-03（Asia/Tokyo）  
バックアップ: `customize/backups/furigana_search_prod_2026-11-02T16-54-53/`

## 実施内容

| 対象 | 内容 |
|------|------|
| App16 フィールド | `client_name_kana`（文字列1行）/ `client_name_kana_status`（未確認・確認済・不明）を **POST 追加** |
| App16 レイアウト | `client_name` 直下に `client_kana_space` + 上記2フィールド |
| App88 customize | `kana_normalize` + `order_search_*` v1.1.0 |
| App16 customize | 既存 JS を維持し、`order_customer_search.js` の直後に kana 4 ファイル挿入 + CSS |

## 検証結果

- App88: `CAYANAS_ORDER_SEARCH_VERSION === 1.1.0`、ふりがな入力あり
- App16: ふりがなパネル表示・入力可
- `client_name_kana like "やまもと"` クエリ成功（件数 0＝過去データ一括 PUT なし）

## 未実施（意図的）

- 過去レコードへのふりがな一括 PUT
- App8 / App96 の変更
