# 海外外注出庫（App 28）設定

## 役割分離

| ファイル | 種別 | 登録先 | 役割 |
|---------|------|--------|------|
| `overseas_outbound_register.js` | kintone JS | App 28 レコード追加 | 連続バーコード出庫登録 |
| `overseas_outbound_index.js` | Print プラグイン | App 28 一覧 | 出庫表印刷（3種） |

**混在させないこと。** register は登録専用、index は印刷専用。

## kintone JavaScript 登録（移行手順）

### 段階1：並行テスト（現行）

| ファイル | App 28 |
|---------|--------|
| `overseas_syuko.js`（現行本番） | 登録済み |
| `overseas_outbound_register.js`（新方式） | **追加** |

> ⚠ 両方同時登録時は `create.submit` が競合します。テスト時は **syuko を一時無効化** するか、register のみで検証してください。

### 段階2：本番切替（動作確認後）

| 操作 | 内容 |
|------|------|
| 追加 | `overseas_outbound_register.js` |
| 削除 | `overseas_syuko.js`（kintone 登録から外すのみ。ファイルは残す） |

## 出庫登録フロー（新方式）

1. 出荷日 / 入庫予定日 / カートン番号を入力
2. 管理番号バーコード連続読取（change または Enter）
3. 1件ごと App 28 POST + App 16 更新
4. 管理番号のみクリア → 自動フォーカス
5. **初回登録成功後、出荷日は固定**（変更不可）
6. **入庫予定日・カートン番号は読取中に変更可**（次の読取から反映）

## App 28 フィールド

| 項目 | コード |
|------|--------|
| 出荷日 | `ship_date` |
| 入庫予定日 | `scheduled_arrival_date` |
| カートン番号 | `carton_no` |
| 管理番号 | `manage_no` |
| 顧客コード | `customer_code` |
| お客様名 | `client_name` または `customer_name`（App28のフォームに存在する方） |
| 着物種類 | `kimono_type` |
| 着物仕様 | `kimono_spec` |
| 納期 | `deadline` |
| 入庫日 | `overseas_in_date` |
| 海外ステータス | `overseas_status` |
| バーコード入力 | `barcode_input` / `manage_no` / `barcode` |

## App 16 更新（出庫成功時のみ）

| フィールド | 値 |
|-----------|-----|
| `process_status` | 海外外注中 |
| `location_status` | 海外 |

## 重複防止

1. セッション内 Set（同一画面での連続読取）
2. App 28 未入庫レコード（`overseas_in_date` 空）
3. App 16 が既に 海外外注中 + 海外

## AYANAS Print プラグイン（overseas_outbound_index.js）

| ボタン | データ |
|--------|--------|
| 勝矢和裁用 出庫表 | 出庫日の全件（入庫済み含む） |
| 社内保管用 出庫表 | 同上 + 納期 |
| 出庫明細表（未入庫） | `overseas_in_date` 空のみ |

## syuko → register 機能比較

| 項目 | overseas_syuko.js | overseas_outbound_register.js |
|------|-------------------|------------------------------|
| 管理番号検索 | ○ App16 GET | ○ App16 GET |
| 存在チェック | ○ alert | ○ 仕様メッセージ |
| 重複チェック | △ テーブル内のみ | ○ セッション + App28 + App16 |
| App28 登録 | サブテーブル + 保存 | 1件1レコード POST |
| process_status 更新 | ○ 海外外注中 | ○ 同左 |
| location_status 更新 | ○ 海外 | ○ 同左 |
| 出庫日/入庫予定日/カートン | × | ○ |
| 連続バーコード（保存不要） | × | ○ |
| Enter キー | ×（保存） | ○（登録トリガ） |
| エラー後フォーカス復帰 | × | ○ |

**register で上記がすべてカバーされたら、syuko を kintone 登録から外してよい。**
