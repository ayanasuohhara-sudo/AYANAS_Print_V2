# 本番反映状況確認

- **確認**: 2026-11-02（Asia/Tokyo）
- **結果**: 追加デプロイ不要（本番 = リポジトリ）

## App19
- JS 順・`delivery_complete_sync.js` / `delivery_a550_edit_guard.js`：**本番一致**
- ACL: everyone 利用可（納品書業務アプリ）

## App92
- store_deadline v1.1.0（config/engine/desktop/css）：**本番一致**
- ACL: everyone 利用可

## App97
- store_payment_* 一式：**本番一致**
- ACL（段階運用）:
  - `info@ayanas.co.jp` / `matsuura@ayanas.co.jp` / `ayanas20126@gmail.com`
  - Administrators / CREATOR
  - **everyone: view/add false**（一斉公開していない）

## 補足
「全スタッフへの everyone 開放」は未実施。別途明示承認が必要。
