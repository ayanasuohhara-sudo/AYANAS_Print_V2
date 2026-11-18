# 店舗引き取り管理 — 復旧手順

- バックアップ: `/workspace/customize/backups/pickup_waiting_prod_2026-11-02T14-00-16`
- 作成: 2026-11-02T14:00:30.017Z (UTC)

## 復旧

1. App16: `fields16.json` / `delivery_status_before.json` を参照し、必要なら選択肢を戻す（通常は「引き取り待ち」残置で可）
2. App19/34/92/97: 各 `appXX/customize.json` と `desktop_js*` / `desktop_css*` を元の順で再アップロード → アプリを更新
3. App97 ACL: `app97_acl.json` の before、または `customize/backups/app97_everyone_open_*` / stage1 バックアップから復元
4. 対象アプリをハードリロード

## 注意

- E2E で作成した `PK******` テスト受注は削除または取消してよい
- 実顧客データの一括更新は行っていない
- 一般スタッフへの公開は別承認まで行わない
