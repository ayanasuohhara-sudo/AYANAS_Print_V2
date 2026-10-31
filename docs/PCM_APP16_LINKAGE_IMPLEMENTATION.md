# PCM × App16 連携 — 実装記録（本番未反映）

- **実装日**: 2026-11-01（Asia/Tokyo）
- **状態**: リポジトリ実装・単体テスト完了。**本番 kintone へのフィールド追加・JS 登録は未実施（再承認待ち）**
- 承認: ユーザー指示（`personal_customer_name` 非追加 / 新規必須・編集警告 / 別タブ新規）

---

## 1. 追加フィールド（本番では未追加）

| App | コード | ラベル | 種類 | 備考 |
|-----|--------|--------|------|------|
| 16 | `personal_customer_id` | 個人顧客ID | 文字列1行 | unique にしない。一般は JS で disabled |
| 16 | `personal_customer_name` | — | — | **追加しない**（`client_name` を使用） |

任意スペース: `pcm_customer_search_space`（無ければ既存 `customer_search_space` / 顧客コード付近に DOM 挿入）

---

## 2. 変更・追加ファイル

| ファイル | 内容 |
|----------|------|
| `customize/order_pcm_config.js` | **新規** App16/PCM 定数 |
| `customize/order_pcm_engine.js` | **新規** 検索・検証 |
| `customize/order_pcm_desktop.js` | **新規** A550 UI・submit・複製時 ID 維持 |
| `customize/order_pcm.css` | **新規** パネル样式 |
| `customize/pcm_order_history.js` | **新規** PCM 詳細の受注履歴 |
| `customize/pcm_config.js` | `ORDER_APP_ID` / 履歴フィールド / VERSION `1.1.0-app16-link` |
| `customize/pcm_desktop.js` | 詳細バナー文言 |
| `customize/pcm.css` | 履歴パネル样式 |
| `scripts/test_order_pcm.js` | **新規** 単体テスト |
| `docs/PCM_APP16_LINKAGE_PROPOSAL.md` | 提案（既存） |
| `docs/PCM_APP16_LINKAGE_IMPLEMENTATION.md` | 本記録 |

**非変更（方針どおり）**: `saiban.js`, `saiban1.js`, `order_customer_search.js`, App19/21/35 関連。

---

## 3. 本番登録手順（再承認後）

### App16

1. フィールド `personal_customer_id` を追加して公開  
2. JS/CSS を既存の末尾に追加（`order_customer_search.js` の後推奨）:
   - `order_pcm_config.js`
   - `order_pcm_engine.js`
   - `order_pcm_desktop.js`
   - `order_pcm.css`
3. `saiban.js` / `saiban1.js` の順序・内容は触らない  

### App96

1. 既存の後に `pcm_order_history.js` を追加  
2. 更新した `pcm_config.js` / `pcm_desktop.js` / `pcm.css` を再アップロード  

---

## 4. 動作要点

- A550 のみ PCM パネル表示。選択で `personal_customer_id` + `client_name` をセット  
- 新規 A550: ID 必須。既存 ID 空の編集: 警告のみ  
- 氏名手動変更 / PCM 上の氏名との不一致: confirm 警告（キャンセルで保存中止）  
- PCM 氏名変更 → 過去 App16 は自動更新しない  
- 複製: ID・お客様名引き継ぎ。`manage_no` は既存 saiban1/saiban でクリア→再採番  
- 法人: PCM 処理スキップ  

---

## 5. テスト結果（リポジトリ）

```text
node scripts/test_order_pcm.js  → all passed
node scripts/test_pcm_phase1.js → all passed
```

検証したロジック:

- A550 / 非 A550 分岐  
- 新規必須・編集空警告  
- ID 形式・氏名不一致 warn  
- 検索クエリ（氏名のみ自動確定なし、ID 完全一致は `=`）  
- saiban1 相当で `manage_no` のみ空にしても `personal_customer_id` が残る  
- `order_customer_search.js` に OrderPcm 依存が無いこと  

本番 UI テスト（選択→保存→ID 残存、複製、履歴表示）は **フィールド追加＋JS デプロイ後** に実施。

---

## 6. 未解決・次アクション

- [ ] 本番 App16 に `personal_customer_id` 追加（再承認後）  
- [ ] 本番 JS/CSS デプロイ（再承認後）  
- [ ] 本番 E2E: A550 選択保存・複製・法人回帰・PCM 履歴  
- [ ] 既存 A550 移行は引き続き対象外  
