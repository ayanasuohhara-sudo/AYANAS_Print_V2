# A550 P0 limited deploy backup

- Created: 2026-11-01 23:01 JST (Asia/Tokyo) / 2026-11-01T14:01:57Z UTC
- Apps: **19**, **92**
- Path: `customize/backups/a550_p0_limited_2026-11-01T14-01-52/`

## Contents

- `app19/customize.json` / `acl.json` / `files_meta.json` + 各 JS 実体
- `app92/customize.json` / `acl.json` / `files_meta.json` + JS/CSS 実体

## Rollback（推奨）

```bash
# バックアップパスを明示
export A550_P0_BACKUP=/workspace/customize/backups/a550_p0_limited_2026-11-01T14-01-52
node scripts/_a550_p0_limited_prod.js rollback
```

これで App19/App92 の customize をバックアップ版へ戻し、ACL もバックアップどおりに復元する。

## Manual rollback

1. `files_meta.json` の index 順で各ファイルを `/k/v1/file.json` へ upload
2. `preview/app/customize.json` PUT → `preview/app/deploy.json` POST
3. `acl.json` を preview ACL に PUT → deploy

## Notes

- App16 / App97 のカスタマイズはこのバックアップ対象外（本 P0 で未変更）
- 検証用レコード（`TP0*` / App8 `Z9P0`）はロールバックしても残る。必要なら手削除
