# App16 `work_status` 本番移行 完了報告

- **実施**: 2026-11-01（Asia/Tokyo）
- **作業ディレクトリ**: `customize/backups/app16_work_status_cutover_2026-11-01T12-51-55/`

---

## 1. 移行前後の件数

| 項目 | 移行前 | 移行後 |
|------|-------:|-------:|
| 総レコード | 3214 | **3214** |
| 空欄 | 2059 | **2059**（調査時 2062 との差分 3 件は移行前から安定） |
| 未着手 | 403 | **0**（選択肢削除済） |
| 未着 | 0 | **403** |
| しみ抜き待ち | 0 | **0**（選択肢削除済） |
| しみ抜き中 | （選択肢なし） | **0** |
| 仕上げ中 | 98 | 98 |
| 仕上げ完了 | 624 | 624 |

更新成功 **403** / 失敗 **0**。PUT は `work_status` のみ。サンプル 7 件で process / location / delivery 不変を確認。

---

## 2. 最終 9 項目

1. 未着（既定値）
2. 問合せ・見積り
3. 丸洗い待ち
4. 丸洗い中・乾燥
5. しみ抜き中
6. 修理中
7. 再直し中
8. 仕上げ中
9. 仕上げ完了

---

## 3. JS 反映結果

| App | 結果 | 先頭 |
|-----|------|------|
| 30 | SUCCESS | `work_status_labels.js` → internal_ops → … complete_register |
| 84 | SUCCESS | `work_status_labels.js` → internal_ops → … internal_work |
| 87 | SUCCESS | `work_status_labels.js` → floor_portal_* |
| 85 | アプリ不存在（削除済） | — |

スモーク: App30/84 の `WORK.sortPending=未着`、App87 カードに未着/しみ抜き中。

---

## 4. 回帰テスト結果

`scripts/_app16_work_status_regression.js` → **ok: true**

- 単体テスト一式 PASS
- App16 選択肢・件数・法人/A550 未着サンプル
- App84 選択可ラベル / put は work_status のみ
- App87 新カード
- App30 仕上げ完了定数
- App92 / App97 ロード
- 入庫・振り分け・丸洗い完了・店舗しみ完了の書込先が仕上げ中/しみ抜き中

---

## 5. 残存する旧ステータス参照

書き込みは新ラベルのみ。旧文言は **dual-read 互換**として意図的に残置:

- `work_status_labels.js` READ_ALIASES
- `factory_*` / `floor_portal_*` / `store_work_*` の normalize / equals
- `store_work` の旧「しみ抜き待ち」開始分岐（残存データ救済）

本番 App85 は無し。factory_* は App84 では DISABLE_LEGACY により未使用（リポジトリ正本として追随済）。

---

## 6. 発生した問題と対応

| 問題 | 対応 |
|------|------|
| file.json upload で CB_JH01 | XHR + `X-Requested-With` に変更して解消 |
| 旧選択肢クエリが count=0 で成功 | フォーム labels で削除確認（件数 0 も確認） |
| 空欄 2062→2059 | 移行前から 2059 で安定。今回の移行では空欄未変更 |

ロールバック資材: 同ディレクトリ `full_backup/records.jsonl(.gz)` + `docs/APP16_WORK_STATUS_MIGRATION_RUNBOOK.md`
