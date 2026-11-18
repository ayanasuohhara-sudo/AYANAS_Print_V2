# App16 work_status フルバックアップ

- 取得: 2026-11-01（UTC）
- 件数: 3214
- 内容: `fields.json` / `layout.json` / `records.jsonl(.gz)`

## 復旧（work_status のみ戻す例）

1. 選択肢に「未着手」が存在することを確認
2. `records.jsonl` から対象 `$id` の旧 `work_status` を読む
3. `/k/v1/records.json` PUT で `work_status` だけ戻す（他フィールドは触らない）

フル JSONL は顧客データを含むため、リポジトリには **コミットしない**（ローカル/エージェント保管）。
