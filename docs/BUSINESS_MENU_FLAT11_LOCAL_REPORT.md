# App91 業務メニュー 11項目フラット再構成 — ローカル確認報告

**日付:** 2026-11-16（Asia/Tokyo）  
**対象:** App91「AYANASU 業務メニュー」  
**バージョン:** `business_menu_*` **3.0.0**  
**本番反映:** **未実施**（本報告の承認後に実施）

## バックアップ

| 項目 | パス |
|------|------|
| バックアップ一式 | `customize/backups/business_menu_flat11_2026-11-16T05-11-36Z/` |
| 対象 | `business_menu_config.js` / `business_menu_desktop.js` / `business_menu.css`（変更前 = v2.0.0 6分類） |

## 変更方針の実装結果

| 要求 | 結果 |
|------|------|
| 6分類 → 11項目 | ホームに11タイルを表示順固定で配置 |
| 店舗・工場は各1つ | `店舗→App87` / `工場→App90` の direct のみ（重複なし） |
| 受注・外注等は直接オープン | 1〜7, 9〜10 は `directAppId` で `/k/{id}/` |
| 外注入庫 → App78 | `inbound.directAppId = 78`（総合入庫） |
| 削除済み旧入庫に非接続 | App85 / 95 / 99 をリンクに含めない（テスト確認済み） |
| 納期 | サブメニュー `?cat=deadline`（下記推奨） |
| マスタ | 既存8マスタを `?cat=masters` で維持 |
| 共通ナビ TOP/店舗/工場 | `CAYANAS_HubNav` 維持（App87/90 内部は未変更） |
| PC・タブレット配置 | PC 4列 / 〜960px 3列 / 〜900px 2列 |

## ホーム11項目とリンク先

| # | ラベル | 種別 | リンク |
|---|--------|------|--------|
| 1 | 受注登録 | direct | `/k/16/` |
| 2 | 外注出庫 | direct | `/k/27/` |
| 3 | 和裁士出庫 | direct | `/k/74/` |
| 4 | 外注入庫 | direct | `/k/78/` |
| 5 | 海外出庫 | direct | `/k/28/` |
| 6 | 納品書作成 | direct | `/k/19/` |
| 7 | 請求書作成 | direct | `/k/35/` |
| 8 | 納期 | menu | `/k/91/?cat=deadline` |
| 9 | 店舗 | direct | `/k/87/` |
| 10 | 工場 | direct | `/k/90/` |
| 11 | マスタ | menu | `/k/91/?cat=masters` |

旧 URL（`?cat=store` / `factory` / `outsourcing` 等）は `CATEGORY_ALIASES` でホームへ吸収。`schedule` → `deadline`。

## 納期リンク先の提案（調査結果）

| App | 役割 | メニュー上の位置付け |
|-----|------|----------------------|
| **89** | 納期負荷カレンダー（日次の納期・作業負荷） | **推奨の主入口**（サブ先頭） |
| **94** | 納期・納品スケジュール管理（顧客別・横断） | サブ2番目 |
| **98** | 和裁士別仕事予定カレンダー（和裁士入庫予定） | サブ3番目（工場メニュー側にも既存） |

**提案:** 「納期」は単一アプリ直結ではなく、上記3つをサブ表示し、日次確認は **App89** を推奨と注記。店舗専用の App92（納期・バーコード引き取り）は店舗ポータル内に残し、全体メニューには載せない（従来方針どおり）。

## ローカル検証

```bash
node scripts/test_business_menu_config.js
node scripts/_verify_business_menu_flat11_render.js
# 任意プレビュー: scripts/_preview_business_menu_flat11.html
```

- config / hub / 工場・店舗ポータル非破壊テスト: **PASS**
- ホーム11件・納期3件・マスタ8件・旧 alias・削除アプリ非接続: **PASS**
- App87 / App90 のポータル内部ファイル: **未変更**

## 変更ファイル

- `customize/business_menu_config.js`（3.0.0）
- `customize/business_menu_desktop.js`（ホームタイル描画）
- `customize/business_menu.css`
- `scripts/test_business_menu_config.js`
- `scripts/_verify_business_menu_flat11_render.js`（検証用）
- `scripts/_preview_business_menu_flat11.html`（ローカルプレビュー）

## 本番反映について

**未実施。** 承認後に App91 カスタマイズ（JS×2 + CSS）を差し替え予定。  
反映時はバックアップ `business_menu_flat11_2026-11-16T05-11-36Z` からロールバック可能。
