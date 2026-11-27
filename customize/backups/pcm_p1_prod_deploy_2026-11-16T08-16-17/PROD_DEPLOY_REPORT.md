# App96 P1 顧客カルテ 本番反映報告

- **実施日時**: 2026-11-16T08-16-17 (UTC) / Asia/Tokyo +9
- **結果**: 要確認
- **バックアップ**: `/workspace/customize/backups/pcm_p1_prod_deploy_2026-11-16T08-16-17`

## 実施内容

1. App96 に `measure_history` サブテーブル追加（衝突なし確認後）
2. App96 JS: `pcm_config.js → pcm_numbering.js → pcm_engine.js → pcm_measure_engine.js → pcm_desktop.js → pcm_order_history.js → pcm_measure_panel.js` + `pcm.css`
3. App87 floor_portal **1.8.1**（顧客カルテ featured）
4. App86 も floor_portal 1.8.1 に同期

## 非変更

- 既存顧客の一括更新なし（テストは `[TEST]PCM_P1_MEASURE` 新規レコードのみ）
- 未紐付け70件なし
- App8 / App16 / App19 フィールドなし
- 採番 JS（saiban）なし

## テスト結果

- 既存顧客 P000075 読取: undefined
- 既存顧客詳細 UI: true
- 寸法3行登録・現行1件化・旧値保持: undefined行 / finishCurrent=undefined / oldKept=undefined
- 詳細パネル: measure=undefined cards=undefined
- 利用履歴 App16: count=undefined
- App87 顧客カルテ: ver=1.8.1 href=https://o5nppg7kb4ly.cybozu.com/k/96/
- iPad幅: false w=undefined
- テストレコード ID: undefined PID=undefined
