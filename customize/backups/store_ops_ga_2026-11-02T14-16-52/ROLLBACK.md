# 店舗システム一般公開 — 復旧

- バックアップ: `/workspace/customize/backups/store_ops_ga_2026-11-02T14-16-52`
- 作成: 2026-11-02T14:17:07.828Z (UTC)

## App97 ACL を限定に戻す

- Stage1: `customize/backups/app97_stage1_acl_2026-11-01T15-13-50/`
- または `node scripts/_pickup_waiting_prod.js acl`

## App92 allowlist を戻す

1. `store_deadline_config.js` の `PICKUP_ALLOWED_LOGIN_CODES` を検証配列に戻し VERSION を下げる
2. App92 を再デプロイ（本ディレクトリの直前バックアップ、または `pickup_waiting_prod_*`）
