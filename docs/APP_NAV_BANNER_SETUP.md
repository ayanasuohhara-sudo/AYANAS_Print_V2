# アプリリンクバナー — セットアップ

各 kintone アプリの **一覧・詳細・編集** 画面上部に、主要アプリへのリンクバナーを表示します。

## ファイル（`customize/`）

1. `app_nav_banner_config.js` — リンク一覧（**ここを編集**）
2. `app_nav_banner.js`
3. `app_nav_banner.css`（CSS ファイルとして登録）

## 登録順（各アプリで同じ）

1. `app_nav_banner_config.js`
2. `app_nav_banner.js`
3. `app_nav_banner.css`

**業務ダッシュボード App 82** では、既存の `business_dashboard_*.js` より **前** に登録すると、ダッシュボード本体の上にバナーが付きます。

## 一括適用のコツ

- リンク先が同じ環境なら、**同じ3ファイル** を運用中のアプリすべてに登録します（コピペで可）。
- App ID が違う環境では `app_nav_banner_config.js` だけ差し替えます。

## 設定の編集

`app_nav_banner_config.js` の `groups` 配列:

```javascript
{ appId: 82, label: '業務ダッシュボード' }
```

- **現在のアプリ**は青く強調されます（`highlightCurrent: false` でオフ）。
- `portalLink: null` にするとポータルリンクを非表示にできます。

## 初期リンク（通常運用のみ・マスタ除外）

| グループ | App |
|----------|-----|
| 経営 | 82 業務DB, 22 売掛 |
| 受注・納品 | 16 受注登録, 19 納品書, 34 社内入庫, 84 社内作業登録, 30 検品・仕上げ完了 |
| 請求・入金 | 35, 21 |
| 物流 | 78 外注入庫, 27, 28, 74, 75 和裁士支払明細 |

見出しは **AYANASU**。右上リンクは **TOPメニューへ戻る**（ポータル `#/portal`）。各リンクは `tone` で色分け（CSS と対応）。

商品・顧客などマスタ系はバナーに含めていません。App 30 / 34 の ID が環境と違う場合は config を修正してください。

実際の App ID は kintone 管理画面で確認し、config を正してください。
