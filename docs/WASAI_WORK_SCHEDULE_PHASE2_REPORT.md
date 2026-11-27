# 和裁士別仕事予定カレンダー — 第2段階 実装報告

**日付**: 2026-11-14（Asia/Tokyo）  
**範囲**: App73「月間処理可能枚数」の設計反映とカレンダー表示  
**本番反映**: **未実施**（App73 フィールド追加・ホスト App・JS デプロイは別途承認後）

---

## 1. バックアップ

`customize/backups/wasai_schedule_phase2_2026-11-14T05-06-08Z/`

- Phase1 の `wasai_schedule_*` 一式
- `app73_fields_snapshot.json`（読取）
- `RESTORE.md`

---

## 2. 確認事項の結果

| 確認 | 結果 |
|------|------|
| App73 既存フィールドとの重複 | **`monthly_capacity` なし**。capacity / 月間 / 枚数系もなし（27 フィールド） |
| 未設定の表示 | 空・欠落 → **「未設定」**（`0` は「0枚」） |
| 和裁士切替 | マスタ配列の `monthlyCapacityLabel` を選択和裁士で再表示 |
| 月切替 | `loadMasters({ force: true })` で能力を再取得して表示維持／更新 |
| App73 閲覧権限 | ホスト利用者に App73 **閲覧**が必要（変更は App73 編集権限者のみ） |
| 既存5名への影響 | フィールド追加時は値空のまま。**既存データは破壊しない**（本番追加は未実施） |

---

## 3. ローカル実装

| 変更 | 内容 |
|------|------|
| `wasai_schedule_config.js` | v**1.1.0**、`FIELDS.monthlyCapacity`、表示文言 |
| `wasai_schedule_engine.js` | `parseMonthlyCapacity` / `formatMonthlyCapacity` / マスタ正規化 |
| `wasai_schedule_desktop.js` | 能力バナー表示、月読込時マスタ再取得、フィールド未追加時 GET フォールバック |
| `wasai_schedule.css` | 能力表示スタイル |
| セットアップ docs | App73 フィールド追加手順 |

**しないこと（遵守）**

- App74 / App78 / App16 の処理変更なし
- カレンダーから `monthly_capacity` を書き込まない
- 追加可能枚数の自動計算は **第4段階**
- 本番 App73 フィールド追加・JS デプロイなし

---

## 4. フィールド仕様（本番追加時）

| 項目 | 値 |
|------|-----|
| ラベル | 月間処理可能枚数 |
| コード | `monthly_capacity` |
| 型 | 数値 |
| 必須 | いいえ |
| 小数 | 0（整数） |
| 最小 | 0（画面で設定可能な場合） |
| 初期 | 空（＝未設定） |

---

## 5. テスト

```text
node scripts/test_wasai_schedule_engine.js
→ ALL PASSED
```

追加検証: 空→未設定、`0`→0枚、`20`→20枚、負数・小数→未設定、切替でラベル変化、PUT/POST なし。

本番読取（フィールド未追加）: GET フォールバックで全和裁士「未設定」表示可能な実装。

---

## 6. 本番承認後の手順（実施しない）

1. App73 に上記フィールドを追加して運用開始  
2. ホスト App 作成（未作成なら）と `HOST_APP_ID` 設定  
3. ホストに JS/CSS 登録（v1.1.0）  
4. 各和裁士の月間処理可能枚数を App73 で入力  

詳細: [WASAI_WORK_SCHEDULE_HOST_APP_SETUP.md](./WASAI_WORK_SCHEDULE_HOST_APP_SETUP.md) §6
