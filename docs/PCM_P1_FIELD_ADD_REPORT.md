# App96 P1 フィールド追加報告（本番未実施）

- **作成日**: 2026-11-16（Asia/Tokyo）
- **対象**: App96 個人顧客マスタ（店舗個人顧客カルテ）
- **状態**: **ローカル実装のみ完了。本番フィールド追加・JS反映は未実施（承認待ち）**

---

## 1. 今回の結論

App96 にサブテーブル `measure_history`（寸法履歴）の追加が必要です。  
仕様 JSON は `docs/APP96_MEASURE_HISTORY_FIELDS.json` に用意済みです。

**本報告時点では本番 API でのフィールド追加・デプロイは行っていません。**

---

## 2. 追加フィールド（要約）

| コード | ラベル | 型 | 必須 | 備考 |
|--------|--------|----|------|------|
| `measure_history` | 寸法履歴 | SUBTABLE | — | 履歴の容器。過去行は削除しない |
| └ `measured_at` | 採寸日 | DATE | ○ | |
| └ `measure_kind` | 寸法区分 | DROP_DOWN | ○ | `身体寸法` / `仕上がり寸法` |
| └ `garment_type` | 対象 | DROP_DOWN | ○ | 身体・長着・長襦袢・羽織・コート・袴・その他 |
| └ `measure_label` | 寸法名称 | 文字列1行 | — | 例「初回採寸」 |
| └ `is_current` | 現行 | CHECK_BOX | — | 選択肢 `現行` のみ |
| └ `manage_no` | 関連管理番号 | 文字列1行 | — | |
| └ `height_cm` ほか | 各寸法(cm) | NUMBER | — | 小数1桁表示。身丈・裄・袖丈・袖幅・前幅・後幅等 |
| └ `measure_note` | 備考 | 複数行 | — | |

単位はすべて **cm**。既存 App96 フィールドの削除・型変更はありません。

---

## 3. 現行フラグの重複防止

| 項目 | 内容 |
|------|------|
| 一意キー | **寸法区分 × 対象 × 寸法名称**（名称空は「（無名称）」） |
| 保存時 | `pcm_measure_engine.normalizeCurrentFlags` が同キー内の `現行` を1件に正規化 |
| 履歴保全 | 行削除・数値クリアは行わない。外すのは他行の `is_current` のみ |
| 運用 | 修正時は旧行の現行を外し、新行を追加 |

---

## 4. ローカル実装（リポジトリ）

| ファイル | 内容 |
|----------|------|
| `customize/pcm_config.js` | `MEASURE` / VERSION `1.2.0-p1-measure` |
| `customize/pcm_measure_engine.js` | 検証・現行正規化（新規） |
| `customize/pcm_measure_panel.js` | 詳細の現行サマリ＋履歴表（新規） |
| `customize/pcm_order_history.js` | 利用履歴列拡張（金額・納品日・入金）。既存維持 |
| `customize/pcm.css` | カルテ／iPad向けスタイル |
| `customize/pcm_desktop.js` | カルテ文言 |
| `customize/floor_portal_config.js` | App87「顧客カルテ」featured（`1.8.1`） |
| `scripts/test_pcm_measure.js` | 単体テスト |

**本番 JS 登録順（承認後）:**

```text
pcm_config → pcm_numbering → pcm_engine → pcm_measure_engine
  → pcm_desktop → pcm_order_history → pcm_measure_panel → pcm.css
```

---

## 5. 非変更（今回・承認後も維持）

- App8 / App16 / App19 の既存フィールド
- 管理番号自動採番 JS
- P2 未紐付け70件のデータ更新
- 既存顧客情報・利用履歴パネルの削除

---

## 6. 本番反映に必要な承認事項

1. App96 に `measure_history` を追加（上記 JSON）
2. フォームレイアウトへサブテーブル配置（基本情報の下〜利用履歴の上を推奨）
3. App96 カスタマイズへ measure 系 JS 追加・既存 pcm_* / CSS 更新
4. App87（＋必要なら App86）へ `floor_portal_config.js` `1.8.1` 反映

承認後に実施スクリプト／手順を別途用意します。
