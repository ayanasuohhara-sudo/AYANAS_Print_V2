# App82 受注減少得意先 v1.7.2 — 本番反映報告

実施時刻: 2026-11-16 16:29 JST（UTC 07:29）

## 結果

**成功。** 本番 App82 はダッシュボード `1.7.2` / 月次エンジン `1.2.0`。

## バックアップ

- 反映前バックアップ: `customize/backups/app82_decline_v172_prod_2026-11-16T07-29-10/`
- 初回検証失敗分（復旧済）: `customize/backups/app82_decline_v172_prod_2026-11-16T07-27-31/`
  - 原因: 月次件数の期待値が午前の数値（海外936 / 合計1068）のままだった
  - 実態: 新規受注により 11月 186→197、海外 936→947（8〜10月は不変）
  - 復旧後に現行本番とローカル v1.2.0 が一致することを確認し、期待値更新のうえ再反映

## 差し替えファイル

| ファイル | 扱い |
|----------|------|
| `business_dashboard_config.js` | ローカル反映 |
| `business_dashboard_monthly_engine.js` | ローカル反映 |
| `business_dashboard_desktop.js` | ローカル反映 |
| `business_dashboard.css` | ローカル反映 |
| `business_dashboard_engine.js` | 本番維持（日次） |
| `ar_config.js` / `payment_create.js` / `ar_engine.js` / `business_dashboard_money.js` | 本番維持 |

## JS 読込順

1. config → 2. ar_config → 3. payment_create → 4. ar_engine  
5. business_dashboard_engine  
6. **business_dashboard_monthly_engine**（desktop より前）  
7. business_dashboard_money  
8. business_dashboard_desktop  

## 本番確認（すべて OK）

| 項目 | 結果 |
|------|------|
| 日次ダッシュボード | OK（9セクション・v1.7.2） |
| 月次枚数・金額ロジック | OK（本番 v1.7.1 と一致） |
| 受注減少ランキング | OK（57行） |
| 直近/比較前 | 2026-08〜10 / 2026-05〜07 |
| 終点月・閾値・区分・検索・並び替え | OK |
| 詳細12か月推移 | OK（12本） |
| App16リンク | `/k/16/?query=customer_code = "..."` |
| CSV | クリック動作 OK |
| 分類競合 | 1件別表示（`090526327`） |
| App16/13/8 元データ | 変更なし（読取のみ） |

## 実測照合

### 受注減少（一致）

| 指標 | 期待 | 実測 |
|------|------|------|
| 対象 | 57 | 57 |
| 停止 | 13 | 13 |
| 大幅減少 | 12 | 12 |
| 減少 | 7 | 7 |
| 安定 | 8 | 8 |
| 増加 | 17 | 17 |
| 競合 | 1 | 1 |

### 月次年度累計（現行ライブ）

| 指標 | 実測 |
|------|------|
| 海外 | 947 |
| 国内着物 | 30 |
| 帯 | 102 |
| 仕立て合計 | 1079 |
| 競合 | 1 |
| 全体 | 1080 |
| 8月 / 9月 / 10月 / 11月 | 297 / 250 / 335 / 197 |

※ 午前の v1.7.1 報告値（936/1068、11月186）からの差分は **新規受注によるデータ増加**。エンジン変更による差分ではない（復旧後の v1.7.1 と同一）。

## 速度

ソース読込 約 3.8秒 / 月次集計 約 2ms / 減少集計 約 2ms

## ユニットテスト

`node scripts/test_business_dashboard_monthly.js` → 全件 PASS
