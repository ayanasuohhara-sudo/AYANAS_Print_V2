# 店舗専用ポータル実装報告（ローカル完了・本番未反映）

- **実施**: 2026-11-03（Asia/Tokyo）
- **版**: floor_portal **v1.3.0**
- **本番反映 / ACL / 一般公開**: **未実施（別途承認）**

構成根拠: `docs/STORE_PORTAL_COMPOSITION.md`

---

## 1. 変更ファイル

| ファイル | 内容 |
|----------|------|
| `customize/floor_portal_config.js` | v1.3.0、A550、`STORE_MENU_GROUPS`、KPI 文言、App34=保管場所移動 |
| `customize/floor_portal_engine.js` | 店舗クエリに A550、日次サマリ、未取得扱い |
| `customize/floor_portal_desktop.js` | 店舗メニュー／サマリ描画、入金取得（失敗時未取得） |
| `customize/floor_portal.css` | メニュー・サマリ・iPad タッチ |
| `scripts/test_floor_portal_engine.js` | メニュー／A550／サマリ／工場分離テスト |
| `docs/STORE_PORTAL_COMPOSITION.md` | 構成更新 |
| `docs/artifacts/store_portal_plan/*` | 画面イメージ |

**非変更**: App16/19/30/34/84/92/96/97 の処理ロジック、ACL

---

## 2. 画面イメージ

- PC: `docs/artifacts/store_portal_plan/store_portal_pc.png`
- iPad 幅: `docs/artifacts/store_portal_plan/store_portal_ipad.png`
- HTML: `docs/artifacts/store_portal_plan/store_portal_v130_preview.html`

### 店舗メニュー

| グループ | リンク |
|----------|--------|
| 受付 | 個人顧客マスタ(96) / 受注登録(16) |
| 作業 | **保管場所移動(34)** / **社内作業登録(84)** / 検品・仕上げ完了(30) |
| 納品・在庫 | 納品書(19) / 納期・引き取り在庫(92) |
| 会計・引き取り | 店舗入金管理(97) |
| — | **App85 なし** |

権限注記を表示（メニュー≠ACL）。App92／App97 の権限制限はポータルでは変更しない。

### 本日の店舗状況（先頭）

| 指標 | 取得元 | 失敗時 |
|------|--------|--------|
| 本日の店舗受注 | App16 `customer_code=A550` ∧ `order_date=今日` | **未取得** |
| 本日納期 | A550・店舗在庫の納期=今日 | **未取得** |
| 引き取り待ち | 店舗在庫の `引き取り待ち`／`納品待ち` | **未取得** |
| 本日入金金額 | App97 有効・入金・当日合計 | **未取得**（0としない） |
| 納期超過 | 店舗在庫の納期超過 | **未取得** |

取得成功時の **0件／0円は 0 と表示**。失敗時のみ「未取得」。

---

## 3. 工場ポータルへの影響

| 項目 | 結果 |
|------|------|
| App86 モード | `resolveMode(86)=factory` のまま |
| 工場クエリ | `location_status in ("工場")` のみ（A550 なし） |
| ショートカット | 従来3ボタン（社内入庫登録／社内作業登録／検品・仕上げ完了） |
| サマリ帯 | 店舗のみ表示 |

---

## 4. テスト結果

```text
node scripts/test_floor_portal_engine.js
→ All floor portal engine tests passed.
```

確認観点:

| 観点 | 結果 |
|------|------|
| 店舗メニューリンク（34/84/30/96/16/19/92/97） | OK |
| App85 非掲載 | OK |
| App34=保管場所移動 / App84=社内作業登録 | OK |
| 工場クエリ非破壊・モード分離 | OK |
| A550 以外の店舗在庫除外 | OK |
| サマリ未取得≠0 | OK |
| 取得済0件は「0件」 | OK |

PC／iPad はプレビュー HTML＋スクリーンショットでレイアウト確認（本番 App87 未デプロイのためライブ UI は旧版のまま）。

権限制限: ポータルはリンクのみ。App97／App92 の ACL・allowlist は本作業で変更していない。

---

## 5. 承認後の本番手順（参考・未実施）

1. App87 に JS/CSS を v1.3.0 順で登録・デプロイ  
   `work_status_labels` → `floor_portal_config` → `engine` → `desktop` + `floor_portal.css`
2. ハードリロードで店舗／工場を目視
3. ACL 変更が必要なら **別承認**

---

## 6. 結論

ローカル実装・単体テスト完了。**本番反映・ACL・一般スタッフ向け周知は別途承認待ち。**
