# 和裁士別仕事予定カレンダー — 第1・第2段階 本番反映報告

**実施日時**: 2026-11-14（Asia/Tokyo）  
**結果**: 成功

---

## 実施内容

| # | 作業 | 結果 |
|---|------|------|
| 1 | App73 バックアップ | `customize/backups/wasai_schedule_phase12_prod_*` |
| 2 | App73 に `monthly_capacity`（月間処理可能枚数）追加 | SUCCESS。型 NUMBER・最小0・単位「枚」 |
| 3 | 既存5名の値 | すべて空欄（未設定）を維持 |
| 4 | ホスト App 新規作成 | **App98** `和裁士別仕事予定カレンダー` |
| 5 | `HOST_APP_ID` | **98**（`wasai_schedule_config.js`） |
| 6 | JS/CSS 登録 | CSS → config → engine → desktop / deploy SUCCESS |
| 7 | App73/74/78 閲覧 | いずれも GET 成功（5 / 23 / 65 件） |
| 8 | 本番スモーク | UI マウント・和裁士選択・月切替・出庫集計・能力「未設定」表示 |

**未変更**: App74 / App78 / App16 の処理・カスタマイズ

---

## 検証サマリ

- ホスト: App98 / VERSION 1.1.0（反映時点）
- 能力表示: 「月間処理可能 **未設定**」
- 002 西口・当月集計例: 出庫中 2 / 返却済 5
- 月切替ボタン動作確認

![本番カレンダー](/opt/cursor/artifacts/wasai_schedule_phase12_prod.png)

URL: `https://o5nppg7kb4ly.cybozu.com/k/98/`

---

## 運用メモ

- 月間処理可能枚数は App73 レコード編集で入力する（空＝未設定、0＝0枚）。
- 第3段階（予定管理 App）の本番作成・JS 再デプロイは別承認。
