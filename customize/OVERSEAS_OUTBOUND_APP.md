# 海外外注出庫（App 28）設定

## kintone JavaScript 登録

| 用途 | ファイル | 登録先 |
|------|---------|--------|
| 連続バーコード出庫 | `customize/overseas_outbound_register.js` | App 28 |
| 海外入庫 | `customize/overseas_nyuuko.js` | App 29 |

## AYANAS Print プラグイン

App 28 一覧画面ボタン:

| ボタン | 内容 |
|--------|------|
| 勝矢和裁用 出庫表 | 出庫実績（入庫済み含む） |
| 社内保管用 出庫表 | 出庫実績 + 納期列 |
| 出庫明細表（未入庫） | 現在未入庫のみ |

## 出庫登録フロー

1. 出庫日 / 入庫予定日 / カートン番号を入力
2. 管理番号バーコードを連続読取
3. 1件登録ごとに管理番号のみクリア
4. カートン番号変更後も出庫日・入庫予定日は保持

## 使用フィールド

| 項目 | コード |
|------|--------|
| 出庫日 | `ship_date` |
| 入庫予定日 | `scheduled_arrival_date` |
| カートン番号 | `carton_no` |
| 管理番号 | `manage_no` |
| 入庫日 | `overseas_in_date` |
| 海外ステータス | `overseas_status` |

受注明細（16）更新: `process_status=海外外注中`, `location_status=海外`

## 帳票並び順

カートン番号昇順 → 登録順（レコードID昇順）
