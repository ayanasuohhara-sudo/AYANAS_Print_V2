# 店舗専用帳票 — 限定本番反映・E2E 完了報告

- **実施**: 2026-11-02（Asia/Tokyo）
- **範囲**: A550 検証データ（PCM `P000002` / `[TEST]山田花子`）のみ
- **一般公開**: **不可（別途承認待ち）**

---

## 1. プラグイン v145 反映結果

| 項目 | 結果 |
|------|------|
| `private.ppk` | Initial commit から復元（同一プラグインID維持） |
| pack | `npm run pack` 成功。`desktop/js` は 30 件上限対応で `js/store_print_bundle.js` に店舗3ファイルを同梱 |
| Import | システム管理 > プラグインへ Import 成功 |
| 確認 | 一覧に **AYANAS Print Plugin V145 (store order / store delivery)** を確認 |
| App16 実画面 | A550 詳細に **店舗受注表** 表示。法人詳細には非表示 |

バックアップ／復旧手順: `customize/backups/store_print_limited_2026-11-02T11-55-09/ROLLBACK.md`

---

## 2. JS 登録・読み込み順

### App19（反映済み）

```
internal_ops_config.js
complete_register_engine.js
delivery_completion_guard.js
store_delivery_pcm.js          ← 追加（barcode より前）
barcode_delivery.js            ← 更新版（PCM ゲート接続）
store_pickup_shared.js
delivery_complete_sync.js
delivery_a550_edit_guard.js
price_master_register.js
delivery_additional_item_guard.js
additional_item_engine.js
```

### App16

- `store_order_create_link.js` は **追加しない**（任意導線。App19 新規＋プラグイン店舗納品書で足りる／既存操作との重複回避）
- 既存カスタマイズは維持

### 法人帳票設定

- 既存法人用ボタン／テンプレ／カスタマイズ順を維持

---

## 3. 実画面 E2E 結果

対象: TEST 受注 `TSP801856U/P/F/X` および混在用 `TSPX95191`（P000006）。実顧客一括更新なし。

### 店舗受注表

| 確認 | 結果 |
|------|------|
| 1レコード1枚印刷 | OK（U/P/F それぞれ単票プレビュー） |
| 管理番号・バーコード | OK（CODE39 SVG） |
| お客様名・加工・納期 | OK（`[TEST]山田花子` / PCM / 加工金額） |
| 未入金 | OK（U → 未入金） |
| 一部入金 | OK（P に App97 部分入金後 → 一部入金） |
| 入金済み | OK（F に App97 全額入金後 → 入金済） |
| App97 入金後の再印刷 | OK（最新残高・状態） |

### 店舗納品書

| 確認 | 結果 |
|------|------|
| 同一 PCM 複数明細 | OK（例: TSP815835U + TSP801856X） |
| 異なる PCM 混入拒否 | OK（`evaluateScan` / `validateStoreSlipBeforeSave`） |
| 明細ごとの入金状態 | OK |
| 税込合計・入金額・残額 | OK |
| 一部商品のみ掲載 | OK（X を含む／含まないケースを作成） |
| 非掲載商品の納品状態 | 印刷のみで App16 一括更新なし（仕様どおり） |
| 改ページ | 単体テスト＋静的プレビューで 12 行超を確認。今回の実データは 2 明細のため 1 ページ |

### 法人帳票

| 確認 | 結果 |
|------|------|
| 法人詳細に店舗受注表なし | OK |
| 既存「受注明細表」印刷 | OK（プレビュー取得） |
| レイアウト／保存処理の破壊なし | OK（テンプレ・ボタン残存、App16 カスタマイズ未変更） |

---

## 4. 印刷品質（A4縦）

| 項目 | 結果 |
|------|------|
| 文字欠け・重なり | キャプチャ上問題なし |
| バーコード | SVG 出力あり（実機リーダーは現場確認推奨） |
| 金額・入金状態 | 未入金／一部入金／入金済が区別可能 |
| 改ページ欠落 | 単体テストでカバー |
| 店舗受注表 1点1枚 | OK |

証跡: `docs/artifacts/store_print_limited_e2e/`

---

## 5. 不具合と残存リスク

| 項目 | 内容 |
|------|------|
| 実機バーコード読取 | 本環境ではリーダー未接続。SVG/CODE39 出力のみ確認 |
| 大量明細の実画面改ページ | ロジック検証済み。13行超の実データ印刷は一般公開前に再確認推奨 |
| `store_order_create_link.js` | 未登録。必要なら別途承認後に追加 |
| 一般公開 | **未実施**。限定反映のまま |
| kimono_type が空の TEST 行 | 一部 TEST fixture で「—」。帳票ロジックではなく fixture 値 |

---

## 6. 一般公開の可否

**不可。** 限定本番（A550 検証）までの反映完了。一般公開は別途承認後に実施すること。

---

## 7. 復旧

1. プラグイン: バックアップ zip を Import（または旧版再 pack）
2. App19: `customize/backups/store_print_limited_2026-11-02T11-55-09/app19/` の順で再登録 → アプリ更新
3. App16: 今回カスタマイズ未変更のため通常不要
