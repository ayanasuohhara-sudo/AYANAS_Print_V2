# App94 納期・納品スケジュール管理 — 動作検証デプロイ手順

**App ID**: 94  
**URL**: https://o5nppg7kb4ly.cybozu.com/k/94/  
**状態**: アプリ作成済み。JS/CSS は管理者が手動アップロード（または自動注入完了後）。

## 既存アプリへの変更

禁止どおり **App16 / 19 / 30 / 78 / 89 / 92 および schedule_customer.js は変更しない**。

## 登録ファイル（PC用・この順）

1. `customize/schedule_hub.css`
2. `customize/schedule_hub_config.js`（`HOST_APP_ID: 94` 済み）
3. `customize/schedule_hub_engine.js`
4. `customize/schedule_hub_desktop.js`

場所: アプリ設定 → JavaScript / CSS でカスタマイズ

保存後、アプリを更新。

## 権限（当初）

- 利用者を **管理者のみ** に制限
- ポータルの業務トップメニューには追加しない
- Everyone には閲覧を付けない

## 動作確認チェック

1. https://o5nppg7kb4ly.cybozu.com/k/94/ を開く
2. 標準一覧が隠れ、3タブ UI が出る
3. ステータスに取得件数・API 回数・所要 ms・方式（cursor/id/offset）が出る
4. ①仕上げ予定・漏れ候補・納期未設定
5. ②顧客選択＋コード検索
6. ③全商品／納品可能・一覧／カレンダー
7. 管理番号クリックで App16 詳細
8. ネットワークに App16 への PUT/record 更新が無いこと

## ローカル単体テスト

```bash
node scripts/test_schedule_hub.js
```
