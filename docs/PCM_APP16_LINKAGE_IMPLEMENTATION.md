# PCM × App16 連携 — 実装記録（本番未反映）

- **実装日**: 2026-11-01（Asia/Tokyo）
- **本番反映**: 2026-11-01（Asia/Tokyo）— 承認後に App16/96 反映・E2E 完了
- **状態**: **本番反映済み**（店舗入金 S1 は未着手）
- 承認: ユーザー指示（`personal_customer_name` 非追加 / 新規必須・編集警告 / 別タブ新規 / 本番再承認）

---

## 1. 追加フィールド（本番）

| App | コード | ラベル | 種類 | 結果 |
|-----|--------|--------|------|------|
| 16 | `personal_customer_id` | 個人顧客ID | 文字列1行 | **追加済** unique=false required=false。既存レコードは空のまま |
| 16 | `personal_customer_name` | — | — | **追加しない**（`client_name` を使用） |

バックアップ: `customize/backups/pcm_app16_deploy_20261101/`（fields / customize / JS・CSS 実体 / RESTORE.md）

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

## 5. テスト結果

### リポジトリ単体
```text
node scripts/test_order_pcm.js  → all passed
node scripts/test_pcm_phase1.js → all passed
```

### 本番 E2E（2026-11-01 Asia/Tokyo）— 17/17 OK

| ケース | 結果 | メモ |
|--------|------|------|
| A550+PCM選択→保存 | OK | レコード **3383** `P000002` / `manage_no=103126383` |
| 保存後 ID 残存 | OK | saiban 後も `personal_customer_id` 維持 |
| 管理番号自動採番 | OK | 既存 saiban どおり 9桁 |
| 複製で ID 引き継ぎ | OK | レコード **3384** も `P000002` |
| 複製後 manage_no 新規 | OK | `103126384` ≠ `103126383` |
| App96 受注履歴 | OK | 103126383/384 表示 |
| 既存 A550 空 ID 編集 | OK | warnEmptyOnEdit（レコード未変更） |
| 法人 A545 | OK | レコード **3385** personal 空・採番 OK |
| 氏名不一致警告 | OK | warnMismatch |

テストデータ: `client_name` / `kimono_type` に `[TEST]`。作成 ID: 3383, 3384, 3385（必要なら後で整理）。

本番 JS 順（App16）: 既存10本（saiban〜schedule_customer）の後に `order_pcm_config/engine/desktop` + `order_pcm.css`。  
App96: `pcm_config` → `numbering` → `engine` → `desktop` → **`pcm_order_history`** + `pcm.css`。

---

## 6. 未解決・次アクション

- [x] 本番フィールド追加・JS デプロイ・E2E  
- [ ] 既存 A550 移行は引き続き対象外  
- [ ] テストレコード 3383/3384/3385 の運用整理（任意）  
- [ ] **店舗入金管理 S1 — 未着手（指示どおり進めていない）**  
