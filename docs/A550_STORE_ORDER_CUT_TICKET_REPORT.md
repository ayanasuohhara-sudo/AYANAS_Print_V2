# 店舗受注表 — 切り取り式作業／完了登録票（v146）

- **作成**: 2026-11-02（Asia/Tokyo）
- **状態**: コード修正＋ローカル単体／プレビュー完了。**本番プラグイン更新は未実施（要承認）**

---

## 1. 変更内容

`store_order` のみを A4縦・上下2段に変更。

| 領域 | 内容 |
|------|------|
| 上部 | 店舗受注表（作業指示・現物管理）。管理番号／バーコード／氏名／商品名／着物種類／仕様／受注日／納期／加工／税込・入金／チェック3項目 |
| 切り取り線 | ミシン目風の破線＋「ここから下を切り取り」 |
| 下部 | 仕上げ完了登録票。同一 manage_no バーコード＋氏名／商品名／着物種類＋同一チェック3項目 |

作業チェック欄:

- □ 下洗い済み
- □ しみ抜き済み
- □ 修理済み

旧「受付・作業中・店舗保管・引取済」は削除。

印刷自体では App16 ステータスを変更しない（従来どおり）。

---

## 2. 変更ファイル

| ファイル | 内容 |
|----------|------|
| `js/templates/store_order.js` | 上下2段テンプレ |
| `css/print.css` | 切り取り式レイアウト |
| `js/preview.js` | 上下バーコード描画セレクタ修正（`.store-order-barcode__svg`） |
| `manifest.json` / `js/desktop.js` | **v146** |
| `scripts/test_store_print_payment.js` | 切り取り式アサーション |
| `scripts/build_store_order_preview.js` | ローカルプレビュー生成 |

非変更: 法人受注表、`store_delivery`、App97。

---

## 3. ローカルテスト

```text
node scripts/test_store_print_payment.js
node scripts/build_store_order_preview.js
```

確認項目:

- 1着1枚（単票ページ）
- 上下バーコードが同一 `manage_no`
- お客様名・商品名・着物種類名
- 切り取り線・チェック欄
- 法人テンプレ／ボタン非破壊

プレビュー: `docs/artifacts/store_print_preview/store_order_cut_ticket_preview.html`

---

## 4. App30 完了登録との連携調査

### 結論

**既存 App30 はバーコード連続読取に対応済み。切り取り票の流用で足り、追加開発は不要。**

### 根拠

- `customize/complete_register_desktop.js`（App30）
  - ヒント文言: 「バーコード連続読取→一括更新」
  - 管理番号入力欄で Enter ごとに `onScan` → App16 取得 → リスト追加
  - 重複拒否・一括更新（完了登録のみ／完了＋保管場所／保管場所のみ）
- エンジン: `customize/complete_register_engine.js`
  - `process_status=完了` / `work_status=仕上げ完了` / `delivery_status=納品待ち` 等

### 運用イメージ

1. 店舗受注表を印刷（上下同一バーコード）
2. 仕上げ後、下部の完了登録票を切り取り
3. App30 完了登録画面で切り取った票を連続スキャン
4. 「一括更新」で完了登録

### 残リスク／現場確認

- 切り取り後のバーコード余白が実リーダーで読めること（印刷倍率 100%）
- 下部票の物理サイズ・用紙の切りやすさ

連続読取の新規実装は不要のため、**追加案の提示は不要**（既存流用）。

---

## 5. 本番反映（承認後）

1. `npm run pack`（v146）
2. AYANAS Print を Import
3. App16 で店舗受注表を印刷確認（TEST のみ推奨）
4. App30 で切り取り票の連続読取を実機確認

一般公開・全店展開は別途判断。
