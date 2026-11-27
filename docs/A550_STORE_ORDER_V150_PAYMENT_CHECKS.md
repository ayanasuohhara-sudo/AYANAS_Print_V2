# A550 店舗受注表 入金状態チェックボックス（v150）

## 変更内容
- 入金状態バッジ（入金済／未入金の2値）を廃止
- チェックボックス4択に変更: **黒字 / 入金済み / 未入金 / 一部入金**
- 現在状態に `☑`、他は `□`
- 過剰入金（残額マイナス）は帳票上 **黒字**

## 対象
- `js/templates/store_order.js`（template v150）
- `js/store_print_payment.js`（黒字集計）
- `js/store_print_bundle.js`（再バンドル）
- `css/print.css`
- `manifest.json` → **Version 150**

## 本番反映
| 項目 | 値 |
| --- | --- |
| 反映時刻 | 2026-11-27 16:20 JST（Asia/Tokyo） |
| プラグイン | AYANAS Print **v150** |
| 検証 | A550 `112626964` → ☑ 入金済み／`112626963` → ☑ 未入金 |
| バックアップ | `customize/backups/store_order_v150_2026-11-27T07-20-29/` |
| 証跡 | `/opt/cursor/artifacts/store_order_v150/` |

## テスト
`node scripts/test_store_print_payment.js` 全件 OK
