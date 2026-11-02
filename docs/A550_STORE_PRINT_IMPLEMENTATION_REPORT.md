# 店舗専用受注表・納品書 — 実装報告

- **作成**: 2026-11-02（Asia/Tokyo）
- **状態**: コード実装＋ローカル単体テスト完了。**本番プラグイン／JS反映は未実施（要別途承認）**

---

## 1. 変更ファイル一覧

### Print プラグイン（v145）

| ファイル | 内容 |
|----------|------|
| `manifest.json` | v145。store 系 JS 追加 |
| `js/store_print_payment.js` | **新規** App97 残高照会（表示のみ）・PCM取得 |
| `js/templates/store_order.js` | **新規** 店舗受注表（A4縦・単票） |
| `js/templates/store_delivery.js` | **新規** 店舗納品書（A4縦・複数点・改ページ） |
| `js/layout.js` | `store_order` / `store_delivery` 登録 |
| `js/desktop.js` | A550時のみ店舗ボタン。印刷直前 enrich（PUTなし） |
| `js/preview.js` | 縦向き・バーコード・読込リスト |
| `css/print.css` | 店舗帳票スタイル |

### App19 / App16 カスタマイズ

| ファイル | 内容 |
|----------|------|
| `customize/store_delivery_pcm.js` | **新規** 同一PCM拘束・保存前検証・バナー |
| `customize/barcode_delivery.js` | 読取時に PCM ゲート接続 |
| `customize/store_order_create_link.js` | **新規** App16 A550「店舗納品書を作成」導線 |

### テスト・プレビュー

| ファイル | 内容 |
|----------|------|
| `scripts/test_store_print_payment.js` | 入金状態・PCM拒否・改ページ・法人非破壊 |
| `docs/artifacts/store_print_preview/store_order_preview.html` | 受注表プレビュー |
| `docs/artifacts/store_print_preview/store_delivery_preview.html` | 納品書プレビュー（複数ページ） |

---

## 2. 帳票仕様（実装）

### 店舗受注表 `store_order`

- App16・`customer_code=A550` のときだけボタン表示
- 1レコード1枚、A4縦
- 管理番号＋CODE39、App96お客様名、着物／仕様／加工／納期
- 印刷直前に App97 `getOrderBalance` 同型計算 → 税込・入金・残・状態

### 店舗納品書 `store_delivery`

- App19・A550 のときだけ「店舗納品書」ボタン（既存法人／一般／松葉は維持）
- 明細ごと管理番号・商品・加工・金額・入金状態・残額
- フッタ: 税込合計・入金額・未入金残
- 12行超で改ページ（フッタは最終ページのみ）
- **印刷だけでは App16 を更新しない**（作成保存時の既存 sync のみ）

### 作成時 PCM

- 同一 PCM のみ追加可。不一致・法人混在は拒否
- 保存前に再検証
- 既存の別 `delivery_no` 上書き防止（sync）は維持

---

## 3. テスト結果

```text
node scripts/test_store_print_payment.js  → All passed
node scripts/test_delivery_a550_store_sync.js → 別番号 warn 維持 OK
```

カバー: 1枚受注表 / 先払い・未入金・一部入金 / 複数点改ページ / PCM混入防止 / 法人帳票ボタン・テンプレ非破壊 / 取消入金除外 / 再計算用ヘルパ

---

## 4. 本番反映手順（承認後）

1. **Print プラグイン**を v145 で再パッケージ・アップロード（App16/19 等に適用済みのプラグイン更新）
2. **App19** カスタマイズ読込順に追加:
   - `store_delivery_pcm.js`（`barcode_delivery.js` より前）
   - 既存 `barcode_delivery.js`（更新版）
3. **App16** カスタマイズに `store_order_create_link.js` を追加（任意・導線用）
4. 限定 E2E（TEST データ）: 店舗受注表印刷、店舗納品書作成（PCM拒否含む）、法人帳票回帰
5. 実顧客一括更新は行わない

---

## 5. 既存機能への影響

| 機能 | 影響 |
|------|------|
| 法人受注表／受注明細表／海外用 | 変更なし（ボタン・テンプレ維持） |
| 法人納品書／一般客／松葉 | 変更なし |
| App19 法人同期 | 変更なし |
| App97 入金登録 | 参照のみ。印刷で更新しない |
| App92 在庫 | 印刷では不変。作成保存時は従来どおり明細分のみ sync |

---

## 6. プレビュー

- `docs/artifacts/store_print_preview/store_order_preview.html`
- `docs/artifacts/store_print_preview/store_delivery_preview.html`
