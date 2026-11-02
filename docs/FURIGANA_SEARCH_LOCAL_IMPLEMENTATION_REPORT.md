# App88 ふりがな予測検索 — ローカル実装報告

- **作成**: 2026-11-03（Asia/Tokyo）
- **範囲**: ローカル実装・単体テスト・画面デモまで
- **未実施（別承認）**: 本番 App16 フィールド追加、App88/App16 への JS/CSS 反映、既存データの更新

---

## 1. 変更ファイル

| ファイル | 内容 |
|----------|------|
| `customize/kana_normalize.js` | **新規** ひらがな寄せ・空白/全半角正規化 |
| `customize/order_search_config.js` | v1.1.0 ふりがな・着物種類・受注日・A550除外・上限 |
| `customize/order_search_engine.js` | クエリ／予測候補／ページング戻り値／表示上限 |
| `customize/order_search_desktop.js` | 予測UI・結果列・ふりがな登録リンク |
| `customize/order_search.css` | 候補・バッジ・上限注記 |
| `customize/order_client_kana_config.js` | **新規** App16 登録定数 |
| `customize/order_client_kana_engine.js` | **新規** 保存正規化・ヒント（漢字自動推測なし） |
| `customize/order_client_kana_desktop.js` | **新規** 新規/編集パネル |
| `customize/order_client_kana.css` | **新規** |
| `docs/APP16_CLIENT_NAME_KANA_FIELD_SPEC.md` | 本番フィールド追加仕様 |
| `docs/artifacts/furigana_search_local_demo.html` | 画面確認デモ |
| `scripts/test_kana_normalize.js` | テスト |
| `scripts/test_order_search_engine.js` | 既存＋ふりがな拡張テスト |
| `scripts/test_order_client_kana_engine.js` | 登録ロジックテスト |

### 本番反映時の登録順（承認後）

**App88**

1. `kana_normalize.js`
2. `order_search_config.js`
3. `order_search_engine.js`
4. `order_search_desktop.js`
5. `order_search.css`（＋既存 `app_nav_*` はそのまま先頭可）

**App16**（フィールド追加後）

1. （既存群）
2. `kana_normalize.js`
3. `order_client_kana_config.js`
4. `order_client_kana_engine.js`
5. `order_client_kana_desktop.js`
6. `order_client_kana.css`

---

## 2. テスト結果

```text
node scripts/test_kana_normalize.js          → ALL PASS
node scripts/test_order_client_kana_engine.js → all passed
node scripts/test_order_search_engine.js      → all passed（既存回帰＋ふりがな）
```

カバーした承認テスト観点:

| 観点 | 結果 |
|------|------|
| やまもときよこ / ヤマモトキヨコ / 空白あり | 同一キー・同一クエリ |
| 漢字氏名 | `client_name like` 維持 |
| 法人コード＋訪問着 | AND クエリ |
| ふりがな未登録行 | 行として残る／かな条件時のみサーバ like |
| 同音異字 | 氏名別に候補分離（統合しない） |
| A550除外 | `customer_code != "A550"` |
| ページング | limit 500 / offset 連鎖、戻り `{records,truncated}` |
| 既存受注登録 | フィールド未設置でも submit をブロックしない |
| App88 の更新API不使用 | 検索画面は GET のみ |

---

## 3. 検索性能設計

| 項目 | 値 |
|------|------|
| 予測 debounce | **300ms** |
| 予測最小文字 | **2** |
| 予測取得 | **50** 件 → 表示 **20** |
| 本検索ページ | **500** 件／リクエスト |
| offset 上限 | **10000** |
| 画面表示上限 | **500**（超過時メッセージ） |

法人顧客コードでの事前絞りを推奨。入力ごとの過剰呼び出しは debounce で抑制。

---

## 4. 画面確認

ローカルデモ: `docs/artifacts/furigana_search_local_demo.html`  
スクリーンショット: `/opt/cursor/artifacts/furigana-search/local_demo.png`

---

## 5. 残存課題（本番承認前）

1. **App16 に `client_name_kana` / `client_name_kana_status` が未設置**のため、本番検索のふりがな条件はフィールド追加後に有効
2. ふりがな未登録の過去データは、**かな alone ではヒットしない**（法人コード・着物・日付・管理番号・漢字で検索）— 仕様どおり
3. 漢字→かなの機械推測は**未実装**（誤読防止）。カタカナ入力のひらがな整形のみ
4. App88 結果からの「ふりがな登録」は **App16 編集画面を開くリンク**（インライン PUT はしない）
5. 本番 JS/CSS 反映・フィールド追加は**別途承認が必要**

---

## 6. 次の承認で行うこと（提案）

1. App16 フィールド追加（仕様書どおり・データ空）
2. App88 / App16 へ上記 JS/CSS を反映
3. 動作確認（法人コード＋ふりがな、A550除外、未登録データの他条件検索）
