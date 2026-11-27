# AYANASU 業務メニュー再構成 v2 — ローカル実装報告

- **実施**: 2026-11-14（Asia/Tokyo）
- **範囲**: ローカル実装・単体テスト・プレビューのみ
- **本番反映**: **未実施**（別途承認後）

---

## 1. バックアップ

| 場所 | 内容 |
|------|------|
| `customize/backups/business_menu_restructure_impl_2026-11-14T05-51-02Z/` | 改修前 JS/CSS ソースコピー |
| 同上 `prod_customize_meta.json` | 本番 App91/90/87/86 の customize メタ（読取のみ） |
| 調査時バックアップ | `business_menu_restructure_invest_2026-11-14T05-44-23/` |

---

## 2. App87 本番 1.6.1 ↔ リポジトリ 1.7.0 差分（混入防止）

| 項目 | 1.6.1（本番） | 1.7.0（リポジトリ未承認） | **本改修 1.8.0** |
|------|---------------|---------------------------|------------------|
| 店舗入金リンク | App97「入金登録」featured | App16「入金状況」＋App97「履歴」 | **App97 通常業務リンクなし**（承認方針） |
| KPI 文言 | 本日の店舗入金額 | …（参考・App97） | 1.6.1 に戻す |
| 共通ナビ | 旧ハブ文言 | 同左 | **TOP/店舗/工場** 部品化 |

→ 1.7.0 の入金状況リンクは**混入していない**。

---

## 3. 画面構成

### 共通ナビ（部品化）

- `customize/hub_nav_config.js` / `hub_nav.js` / `hub_nav.css`
- リンク: **TOP→91 / 店舗→87 / 工場→90**
- 現在画面は `aria-current` ＋色付き active
- 利用: App91・App90・App87・**App86**（floor_portal 共通）

### App91（2.0.0）— 6分類

1. 店舗業務 → 87 中心（16/88/96）
2. 工場業務 → 90・86・16・88・84・30・34・**98**
3. 外注管理 → 27・28・74・78・26・23
4. 売上・経理 → 19・35・21・22・75・82
5. 予定・納期 → 89・94・**98**
6. マスタ・設定 → 8・96・11・13・14・73・23・26

- App92/97/95/99 非掲載
- 旧 `?cat=order` 等は `CATEGORY_ALIASES` で新分類へ

### ポータルバナー（2.0.0）

01 店舗87／02 工場90／03–08 上記6分類

### App90（2.0.0）

- **App98** 追加、App86 維持
- 表示名を正式名称ベースに統一

### App87（floor 1.8.0）

- App92 店舗納期（引き取り）維持
- App97 通常リンク削除（アプリ・データは残置）
- 既存サマリ／カード／検索は維持

---

## 4. 変更ファイル一覧

| ファイル | 内容 |
|----------|------|
| `customize/hub_nav_{config,js,css}` | **新規** 共通ナビ部品 |
| `customize/business_menu_config.js` | 6分類 v2.0.0 |
| `customize/business_menu_desktop.js` | HubNav 接続・alias |
| `customize/factory_menu_config.js` | App98・名称統一 v2.0.0 |
| `customize/factory_menu_desktop.js` | HubNav 接続 |
| `customize/floor_portal_config.js` | 1.8.0・App97外し・名称 |
| `customize/floor_portal_desktop.js` | HubNav 接続（87/86） |
| `customize/app_nav_banner_config.js` | 独立画面の TOP/店舗/工場 1.3.0 |
| `portal-customize/portal_business_banners_config.js` | 店舗・工場先頭＋6分類 |
| `scripts/test_business_menu_config.js` | 再構成テスト |
| `scripts/test_floor_portal_engine.js` | 1.8.0 期待値更新 |
| `docs/artifacts/business_menu_restructure_v2/preview.html` | ローカルプレビュー |

---

## 5. App86 など独立画面への TOP 戻り（調査）

| 画面 | 現状 | 本改修 |
|------|------|--------|
| App86 工場作業状況 | 旧ハブリンクあり | **共通 HubNav を floor 経由で表示**（工場 active） |
| App16/19/27/30/34/35/78/84/88 | `app_nav_banner` | ラベルを TOP/店舗/工場に統一（1.3.0） |
| App89/92/94/98 等 | バナー未配備の可能性 | 承認後に `hub_nav` または `app_nav_banner` 追加を推奨 |

---

## 6. ローカルテスト結果

```
node scripts/test_business_menu_config.js  → ALL PASSED
node scripts/test_floor_portal_engine.js → ALL PASSED
```

プレビュー: `docs/artifacts/business_menu_restructure_v2/preview.html` をブラウザで開く。

---

## 7. 本番反映時の注意（未実施）

1. **App91 / 90 / 87 / 86** の desktop JS に `hub_nav_config.js` → `hub_nav.js` を **既存 desktop より前**に追加、CSS に `hub_nav.css`
2. ポータル全体カスタマイズに banners config 更新
3. ACL・App74/78/16 等の業務処理は変更しない
4. ロール別 JS フィルタは入れない（方針どおり）

---

## 8. 承認待ち事項

- 本番デプロイの可否
- App89/92/94/98 への共通ナビ展開範囲
- App97 をメニューから外したことの店舗オペ確認
