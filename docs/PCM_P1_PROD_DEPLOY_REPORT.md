# App96 P1 顧客カルテ 本番反映報告

- **実施日時**: 2026-11-16 17:16–17:19（Asia/Tokyo）
- **結果**: **成功**
- **バックアップ**: `customize/backups/pcm_p1_prod_deploy_2026-11-16T08-16-17/`
- **検証ログ**: `customize/backups/pcm_p1_prod_verify_2026-11-16T08-18-38/`

---

## 反映前確認

| 項目 | 結果 |
|------|------|
| App96 / App87 / App86 設定・customize バックアップ | OK |
| `PCM_P1_FIELD_ADD_REPORT.md` / `APP96_MEASURE_HISTORY_FIELDS.json` | 確認済 |
| フィールドコード衝突 | **なし**（`measure_history` 未存在） |
| 既存レコード影響 | 一括変更なし。既存 P000075 の寸法は空のまま |

---

## 実施内容

1. **App96** に `measure_history` サブテーブル追加（20子フィールド）→ deploy SUCCESS  
   レイアウト: `customer_note` の直後に配置
2. **App96 JS/CSS**（順）  
   `pcm_config` → `pcm_numbering` → `pcm_engine` → `pcm_measure_engine` → `pcm_desktop` → `pcm_order_history` → `pcm_measure_panel` → `pcm.css`  
   VERSION `1.2.0-p1-measure`
3. **App87** `floor_portal` **1.8.1**（顧客カルテ featured）
4. **App86** も floor_portal 1.8.1 に同期（バージョン齟齬防止）

---

## 非変更

- 既存顧客の一括更新なし
- 未紐付け70件なし
- App8 / App16 / App19 フィールドなし
- 採番 JS（saiban）なし

---

## 本番テスト結果

| 観点 | 結果 | メモ |
|------|------|------|
| 既存顧客カルテ表示 | OK | P000075 / record=71。寸法パネル＋利用履歴表示 |
| 利用履歴（金額・納品日・入金） | OK | 2件。列「金額」「納品日」「入金」あり |
| 寸法新規登録 | OK | `[TEST]PCM_P1_MEASURE` (P000076 / id=72) |
| 複数履歴保存 | OK | 3行 |
| 現行サマリ表示 | OK | カード2（身体＋長着訪問着） |
| 現行フラグ重複防止 | OK | 同キーは1件。旧行は非現行 |
| 過去寸法保持 | OK | 初回行 mitake 158.5 残存 |
| 小数 cm | OK | 158.5 / 49.5 等 |
| App87 → 顧客カルテ | OK | ver 1.8.1 / `/k/96/` |
| PC 表示 | OK | 詳細パネル表示 |
| iPad 相当操作 | OK | パネル・カード表示（CSS min-height 48px 等） |

テストレコード: **P000076** `[TEST]PCM_P1_MEASURE`（運用で削除可）

---

## 本番 JS 登録順（現在）

```text
pcm_config → pcm_numbering → pcm_engine → pcm_measure_engine
  → pcm_desktop → pcm_order_history → pcm_measure_panel → pcm.css
```
