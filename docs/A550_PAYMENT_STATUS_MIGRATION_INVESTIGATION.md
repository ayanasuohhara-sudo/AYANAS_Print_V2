# A550 入金状況 過去データ移行調査（上書きなし）

- 生成: 2026-11-14T03:54:57.824Z（UTC）
- モード: **mock**（本番一括更新なし）

## 判定規則

| App97 残額 | 候補 |
|-----------|------|
| 残額 ≤ 0 | 入金済み |
| 充当あり・残額あり | 一部入金 |
| 充当なし | 未入金 |
| 判定不能 | 一覧報告（上書きしない） |

## サマリ（モック）

```json
{
  "total": 4,
  "candidate_paid": 1,
  "candidate_partial": 1,
  "candidate_unpaid": 1,
  "undetermined": 0,
  "skipped_non_a550": 1,
  "deliveredCaution": 1,
  "multiDetail": 1,
  "alreadySet": 0
}
```

## 判定不能

（なし）

## 注意

- 既存データの無条件上書きはしない
- 納品済レコードは `deliveredCaution`
- 複数明細は受注単位ステータス（整合性は注文合計ベース）
- **一括更新は別途承認後**
