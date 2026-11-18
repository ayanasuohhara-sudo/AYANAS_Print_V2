# 和裁士別仕事予定カレンダー — 第1段階 実装報告

**日付**: 2026-11-14（Asia/Tokyo）  
**範囲**: 第1段階のみ（閲覧カレンダー）  
**本番反映**: **未実施**（別途承認後）

---

## 1. 成果物

| ファイル | 役割 |
|----------|------|
| `customize/wasai_schedule_config.js` | 定数・App ID・フィールドコード |
| `customize/wasai_schedule_engine.js` | 集計エンジン（読取のみ） |
| `customize/wasai_schedule_desktop.js` | 一覧 UI（和裁士選択・月ナビ・カレンダー） |
| `customize/wasai_schedule.css` | スタイル |
| `scripts/test_wasai_schedule_engine.js` | 単体テスト |
| `docs/WASAI_WORK_SCHEDULE_HOST_APP_SETUP.md` | ホスト App 作成・JS 登録手順（本番用） |

`HOST_APP_ID` は **`null`（未設定）**。ホスト App を作成して ID を入れたあと、承認デプロイで登録する。

---

## 2. 第1段階の動作

1. ホスト App 一覧でカレンダーを表示（レコード一覧は CSS で隠す）
2. App73 の **有効** 和裁士をセレクト（`registration_statu` / `registration_status` 両対応）
3. App74 の **出庫確定** 明細を取得し、**返却予定日**（なければ出庫日）のセルに配置
4. セル／明細に **品目**（`processing_summary`）・**枚数**（`eligible_line_coun`）・状態を表示
5. App78 の **入庫確定 × 和裁士ルート** を参照し、App74 がまだ「出庫中」でも入庫済みなら **返却済** と区別
6. 前月／翌月／今日、返却済表示トグル

**書込なし**: App73/74/78/16 への PUT/POST なし。出庫・入庫・受注 JS は未変更。

---

## 3. 状態区分（第1段階）

| 表示 | 判定 |
|------|------|
| 出庫中 | App74 行が空/`出庫中`、かつ App78 に当該 `manage_no` の和裁士確定入庫なし |
| 返却済 | App74 が `入庫済` 以降、または App78 和裁士確定入庫あり |
| 再加工 | App74 `再加工` |

表示軸は **返却予定月**（月またぎ出庫も返却予定日の月に載る）。第4段階 KPI も同軸を使う前提。

---

## 4. テスト結果

### 4.1 単体テスト

```text
node scripts/test_wasai_schedule_engine.js
→ ALL PASSED（27 件）
```

主な確認: 月またぎ帰属、取消除外、App78 補強、返却済トグル、GET のみ。

### 4.2 本番データ読取スモーク（書込なし）

和裁士 `002` 西口陽子・2026年11月:

| 項目 | 結果 |
|------|------|
| マスタ有効 | 5 名 |
| App74 取得 | 7 件 |
| 集計 | 出庫中 2 枚 / 返却済 5 枚 |
| App78 補強例 | `100326812` が `via78: true` で返却済 |

UI スモーク画面（ホスト未作成のため一時マウント）:

![第1段階カレンダー](/opt/cursor/artifacts/wasai_schedule_phase1_calendar.png)

---

## 5. 本番反映（未実施）に必要なこと

1. 空のホスト App を新規作成（推奨名: `和裁士別仕事予定カレンダー`）
2. `wasai_schedule_config.js` の `HOST_APP_ID` をその App ID に設定
3. ホスト App の JS/CSS に 4 ファイルを登録（PC・全ユーザー）
4. アプリ権限: App73/74/78 の **閲覧** をホスト利用者に付与

詳細: [WASAI_WORK_SCHEDULE_HOST_APP_SETUP.md](./WASAI_WORK_SCHEDULE_HOST_APP_SETUP.md)

---

## 6. 次段階（未着手）

| 段階 | 内容 |
|------|------|
| 第2 | App73 に `monthly_capacity` |
| 第3 | 新規予定 App・`manage_no` リンク |
| 第4 | 能力／出庫済／予約／追加可能の KPI |

拡張余地: `PLAN_APP_ID`、`CAYANAS_WASAI_SCHEDULE_HOST_APP_ID` オーバーライド、本人スマホは予定 App 権限分離。
