# App16 `work_status` 本番変更手順・ロールバック

- **作成**: 2026-11-01（Asia/Tokyo）
- **現状**: **本番移行完了**（2026-11-01）。完了報告: `docs/APP16_WORK_STATUS_CUTOVER_REPORT.md`

---

## 1. 決定事項（承認済）

| 項目 | 内容 |
|------|------|
| 新 9 項目 | 未着 / 問合せ・見積り / 丸洗い待ち / 丸洗い中・乾燥 / しみ抜き中 / 修理中 / 再直し中 / 仕上げ中 / 仕上げ完了 |
| データ移行 | 未着手 **403 件** → 未着（`work_status` のみ） |
| しみ抜き待ち | 廃止（件数 0）→ しみ抜き中 |
| 仕上げ待ち | 書込廃止 → **仕上げ中**（業務: 待ち工程を使わず仕上げ工程へ進める。INTERNAL_OPS_SETUP 準拠） |
| 非変更 | `process_status` / `location_status` / `delivery_status` / 空欄 2059 件 |

---

## 2. 「仕上げ待ち」の変更内容（業務確認結果）

| 書込箇所 | 旧 | 新 | 根拠 |
|----------|----|----|------|
| 工場入庫（店舗・丸洗いなし） | 仕上げ待ち | **仕上げ中** | 待ちを挟まず仕上げ工程へ |
| 振り分け「仕上げへ」 | 仕上げ待ち | **仕上げ中** | 同上 |
| 丸洗い完了 | 仕上げ待ち | **仕上げ中** | 乾燥完了後は仕上げ工程 |
| 店舗しみ抜き完了→工場 | 仕上げ待ち | **仕上げ中** | 同上 |

読み取り互換: 万一残存する旧「仕上げ待ち」は dual-read で「仕上げ中」として扱う（データは勝手に置換しない）。

---

## 3. 修正 JS 一覧

| ファイル | 内容 |
|----------|------|
| `customize/work_status_labels.js` | **新規** 正本 9 値・ALIAS・normalize |
| `customize/internal_ops_config.js` | App30/84 共有定数 → 未着 / しみ抜き中、SELECT 8 値 |
| `customize/internal_work_engine.js` | 変更なし（config 追随） |
| `customize/floor_portal_config.js` | App87 カードを新ラベル |
| `customize/floor_portal_engine.js` | KPI/絞り込み dual-read |
| `customize/factory_inbound_config.js` | 新ラベル + equals |
| `customize/factory_inbound_engine.js` | 丸洗いなし → 仕上げ中 |
| `customize/factory_sorting_engine.js` | 未着 dual-read、しみ抜き中 / 仕上げ中 書込 |
| `customize/factory_sorting_desktop.js` | UI 文言 |
| `customize/factory_work_engine.js` | 丸洗い完了→仕上げ中、dual-read |
| `customize/factory_work_desktop.js` | UI 文言 |
| `customize/store_work_config.js` / `engine` / `desktop` | 残置 App85 追随 |

**デプロイ時（確認後）**: App30/84 は `work_status_labels.js` を `internal_ops_config.js` **の前**に追加。App87 は `work_status_labels.js` → `floor_portal_config.js` 順。

---

## 4. 移行準備物（取得済）

| パス | 内容 |
|------|------|
| `customize/backups/app16_work_status_prep_YYYYMMDD/` | フォーム + 件数 + **未着手 403 ID CSV/JSON** |
| `customize/backups/app16_work_status_full_YYYYMMDD/` | 全レコード JSONL（実行時） |
| `scripts/_app16_work_status_prep.js` | 件数・ID 再取得 |
| `scripts/_app16_work_status_full_backup.js` | 全件バックアップ |
| `scripts/_app16_work_status_migrate.js` | DRY-RUN 既定。本番は `CONFIRM_MIGRATE=YES EXECUTE=1` |

---

## 5. 本番変更手順（最終確認後）

### 安全条件

1. App16 の同時編集を停止（告知）
2. 直近で prep / full backup を再実行し件数照合
3. 空欄は更新しない / 3 軸は触らない

### 順序

1. **JS デプロイ**（App30 / 84 / 87。必要なら factory_* 残置分）
2. **第3段階**: 選択肢に `未着`・`しみ抜き中` を追加し、**未着手と未着を併存**。既定値を **未着** に変更。`しみ抜き待ち` はまだ残してよい
3. **第4段階**:  
   `CONFIRM_MIGRATE=YES EXECUTE=1 node scripts/_app16_work_status_migrate.js`  
   - 前後件数照合（未着手→0、未着≈403+既存）  
   - 失敗 ID は `failures.json` → 再実行
4. **第5段階**: 未着手=0・しみ抜き待ち=0 を確認後、旧選択肢削除 → 新 9 項目のみ
5. **第6段階**: 回帰（App16/84/87/30/92/97、法人・A550）

---

## 6. ロールバック

| 段階 | 戻し方 |
|------|--------|
| JS のみ | 旧カスタマイズファイルを再アップロードしてデプロイ |
| 選択肢追加直後（データ未移行） | 既定値を未着手に戻し、未着/しみ抜き中を削除 |
| 403 移行後 | `records.jsonl` の当該 ID の `work_status` を未着手へ戻す（`work_status` のみ PUT）。併存選択肢が残っている必要あり |
| 旧選択肢削除後 | 先に未着手を選択肢へ再追加してからデータ戻し |

復旧スクリプトは移行失敗時に `failures.json` とバックアップ JSONL を突合して個別 PUT する。

---

## 7. このターンでやらないこと

- 本番フォームの選択肢変更
- 403 件の一括 UPDATE
- App30/84/87 への本番 JS デプロイ

→ いずれも最終確認後に実施。
