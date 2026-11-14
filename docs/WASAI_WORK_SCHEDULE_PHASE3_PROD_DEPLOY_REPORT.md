# 和裁士仕事予定 — 第3段階 本番適用報告

**実施日時**: 2026-11-14（Asia/Tokyo）  
**結果**: 成功

---

## 作成・変更した App

| App | ID | 内容 |
|-----|-----|------|
| 和裁士仕事予定管理（新規） | **99** | 設計どおり全12フィールド |
| 和裁士別仕事予定カレンダー | **98** | JS/CSS を **v1.2.1** に更新（`PLAN_APP_ID: 99`） |
| 和裁士マスタ | 73 | 変更なし（第2段階の `monthly_capacity` を表示） |
| 和裁士出庫 / 総合入庫 / 受注 | 74 / 78 / 16 | **変更なし** |

URL:
- カレンダー: https://o5nppg7kb4ly.cybozu.com/k/98/
- 予定管理: https://o5nppg7kb4ly.cybozu.com/k/99/

---

## 変更ファイル（リポジトリ）

- `customize/wasai_schedule_config.js` — `PLAN_APP_ID: 99`, VERSION 1.2.1
- `customize/wasai_schedule_engine.js` — 予定集計・二重計上防止（既存）
- `customize/wasai_schedule_desktop.js` — 予約登録／**変更**／取消 UI
- `customize/wasai_schedule.css`
- バックアップ: `customize/backups/wasai_schedule_phase3_prod_2026-11-14T05-28-33/`

---

## 本番テスト結果

| テスト | 結果 |
|--------|------|
| 予約登録 | OK（record id 1） |
| 予約変更 | OK（品目・枚数 2→3） |
| 予約取消 | OK（`plan_status=取消` で履歴保持、カレンダー非表示） |
| 和裁士切替クエリ | OK |
| 月切替 bounds | OK |
| 出庫済／予約の kind 色分け | OK（outbound/returned + planned 共存） |
| App74 二重計上防止 | OK（実出庫 manage_no の予約を suppress） |
| 同一管理番号の重複予約防止 | OK（validate で拒否） |
| App73 月間処理可能枚数表示 | OK（未設定） |
| UI マウント | OK |

テスト用レコードは `[TEST-P3]` 付き。取消状態で残置（削除せず履歴保持）。  
二重計上用 bait も取消に整理済み。

![本番カレンダー](/opt/cursor/artifacts/wasai_schedule_phase3_prod.png)

---

## 復旧

問題時は `customize/backups/wasai_schedule_phase3_prod_2026-11-14T05-28-33/` の App98 旧 JS/CSS を再アップロードしてデプロイ。  
予定 App99 のテスト取消レコードは業務データと管理番号プレフィックス `TEST-P3-` で区別可能。
