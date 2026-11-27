# AYANASU 業務メニュー再構成 v2 — 本番反映報告

- **反映**: 2026-11-14（Asia/Tokyo）
- **結果**: **SUCCESS（PROD_OK）**
- **バックアップ**: `customize/backups/business_menu_restructure_v2_prod_2026-11-14T06-00-16/`（メタ＋ファイル実体＋ROLLBACK.md）

---

## 反映バージョン

| 対象 | 版 | 内容 |
|------|----|------|
| ポータル banners | **2.0.0** | 01店舗／02工場＋6分類 |
| App91 | **2.0.0** | 6分類＋共通ナビ |
| App90 | **2.0.0** | App98追加＋共通ナビ |
| App87 / App86 | floor **1.8.0** | 共通ナビ・App97通常リンク非表示 |
| hub_nav | **1.0.0** | TOP／店舗／工場 |
| app_nav_banner（16等） | **1.3.0** | TOP／店舗／工場表記 |

## 読み込み順（本番）

- **91**: `hub_nav_config` → `hub_nav` → `business_menu_config` → `business_menu_desktop` ／ CSS: `hub_nav` → `business_menu`
- **90**: `hub_nav_*` → `factory_menu_*`
- **87/86**: `work_status_labels` → `hub_nav_*` → `floor_portal_*`
- **App89/92/94/98**: 今回未展開（方針どおり）

## App87 混入防止

- 本番は **1.8.0**（1.6.1 ベース）
- App97「入金登録」通常リンクなし
- 1.7.0「入金状況（受注一覧）」未混入
- App92 店舗納期カレンダー（引き取り）維持

## 本番テスト結果

| 項目 | 結果 |
|------|------|
| App91 → 87 / 90 リンク | OK |
| App87 → TOP / 工場 | OK |
| App90 → TOP / 店舗 | OK |
| App86 → TOP | OK |
| App16 → TOP/店舗/工場 | OK |
| active 表示（TOP/店舗/工場） | OK |
| モバイル幅スクリーンショット | 取得済 |
| App97 リンク非表示 | OK |
| App90 に App98 | OK |

証跡: `/opt/cursor/artifacts/menu_v2_shot_app{91,90,87,86,16}.png` および `*_mobile.png`

## 変更ファイル（リポジトリ）

`hub_nav_*` 新規、`business_menu_*` / `factory_menu_*` / `floor_portal_*` / `app_nav_banner_config` / `portal_business_banners_config`、デプロイ脚本、本報告。
