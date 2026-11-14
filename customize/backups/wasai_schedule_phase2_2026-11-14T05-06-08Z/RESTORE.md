# 和裁士予定カレンダー Phase2 前バックアップ

**日時**: 2026-11-14 05:06:08 UTC（Asia/Tokyo 14:06）  
**内容**: Phase1 時点の `wasai_schedule_*` と App73 フォーム・マスタ一覧スナップショット

## ファイル

- `wasai_schedule_config.js`
- `wasai_schedule_engine.js`
- `wasai_schedule_desktop.js`
- `wasai_schedule.css`
- `app73_fields_snapshot.json`（読取のみ。`monthly_capacity` は当時未作成）

## 復元（リポジトリ）

```bash
cp customize/backups/wasai_schedule_phase2_2026-11-14T05-06-08Z/wasai_schedule_*.js customize/
cp customize/backups/wasai_schedule_phase2_2026-11-14T05-06-08Z/wasai_schedule.css customize/
```

## 注意

- 本番 App73 / ホスト App へのフィールド追加・JS デプロイは本バックアップ時点では未実施。
- App74 / App78 / App16 は変更していない。
