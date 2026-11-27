# Rollback

本番反映前の customize メタとファイル実体をこのディレクトリに保存しています。

- `before_app{ID}_customize.json` … 反映前メタ
- `files/app{ID}/` … 反映前ファイル実体

復旧時は各アプリのデスクトップ JS/CSS をバックアップ内容で再アップロードし、deploy してください。
ポータルは beforeScripts（deploy 結果 JSON）を参照。
