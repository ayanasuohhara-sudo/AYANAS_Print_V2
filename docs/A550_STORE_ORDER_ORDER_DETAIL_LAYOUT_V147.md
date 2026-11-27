# 店舗受注表 — 受注明細表と同構成（v147）

## 概要

`store_order`（A550）を **受注明細表（order_detail）と同じ A4横・左右2面構成** に変更。
追加表示のみ:

- 作業チェック: □ 下洗い済み / □ しみ抜き済み / □ 修理済み
- 入金状態: **入金済** または **未入金**（一部入金は未入金として表示）

## 変更点

| 項目 | 内容 |
|------|------|
| レイアウト | A4縦切り取り式 → A4横・左右2面（`OrderDetailShared` 再利用） |
| 入金 | バッジ＋金額表（税抜/税/税込/入金額/残額） |
| 作業チェック | 左右とも3項目 |
| 法人帳票 | 非変更（`order_detail` / 納品書） |

## バージョン

- `manifest.json` / `js/desktop.js` … **147**
- 本番 Import 済み（AYANAS Print Plugin V147）

## 検証

- 単体: `node scripts/test_store_print_payment.js`
- 本番: `TSP815835U` で店舗受注表 → 左右構成・未入金・作業チェック確認
- 法人 `110226491`: 店舗受注表ボタン非表示・受注明細表正常

バックアップ: `customize/backups/store_order_v147_2026-11-02T13-21-57/`
証跡: `/opt/cursor/artifacts/store_order_v147/`
