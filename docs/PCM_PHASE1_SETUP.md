# PCM 第1段階 — 本番作成前の設定案（承認用）

- **作成日**: 2026-10-31（Asia/Tokyo）
- **状態**: **ユーザー承認待ち**（この時点では本番にアプリ未作成）
- 根拠: `personal_customer_master_design.md` / `A550_store_system_investigation.md` / 実装指示書

---

## 1. 設計資料との差異報告

実装指示を優先する。勝手に設計へ戻さない。差異は以下。

| 項目 | 設計資料 | 実装指示（第1段階） | 本フェーズの扱い |
|------|----------|---------------------|------------------|
| 氏名 | `display_name` / `family_name` / `given_name` | **`customer_name`** 単一 | 指示どおり `customer_name` |
| かな | `name_kana` | **`customer_kana`** | 指示どおり |
| 住所 | `post_no`, `address`, `building` | **`postal_code`, `address_line`, `building_name`** | 指示どおり。`prefecture` は指示どおり DROP_DOWN |
| 電話 | `phone_primary` / `phone_mobile` | **`phone` / `mobile_phone`** | 指示どおり |
| 登録経路 | `source_channel` | **`registration_source`** | 指示どおり |
| WEB確認 | `web_account_status` + `web_verified_at` | **`web_verified`**（DROP_DOWN） | 指示どおり（日時は未設置） |
| DM | `dm_*_opt_in` | **`dm_permission` / `email_permission` / `line_permission`** | 指示どおり |
| 休眠 | `dormant_flag` | **`dormant_status`** | 指示どおり |
| 会員 | `member_joined_date` 等 | **`member_type` / `member_start_date` / `member_expiry_date`** | 指示どおり |
| 集計 | 主に最終日 | **`first_order_date` / `order_count` / `lifetime_amount`** | 設置するが **App16 未連携・手入力しない**（ラベル／説明で明示） |
| `customer_status` / `merged_into_id` / `store_customer_code` | 設計にあり | 指示になし | **第1段階では未設置**（統合は今回対象外） |
| `line_account_id` | 設計に薄く言及 | 指示にあり | 設置 |
| App16 連携 | 設計に詳細 | **今回実装しない** | 既存 App 変更なし |

矛盾なし（方針一致）: App8/16/19/21/35 不変更、A550 維持、氏名電話の自動統合禁止、WEB は本人確認済み ID のみ、採番はカウンタ＋revision、欠番許容。

---

## 2. 新規アプリ（承認後に作成）

| アプリ名 | 用途 | App ID |
|----------|------|--------|
| 個人顧客マスタ | PCM 本体 | **作成後に記録**（仮定しない） |
| 個人顧客ID採番 | カウンタ1レコード | **作成後に記録** |

作成後、`customize/pcm_config.js` の `PCM_APP_ID` / `COUNTER_APP_ID` を実 ID に更新してから JS を登録する。

---

## 3. カウンタアプリ フィールド

| ラベル | コード | 種類 | 初期 |
|--------|--------|------|------|
| 採番キー | `counter_key` | 文字列1行 | `PCM_PERSONAL_ID`（1レコードのみ） |
| 次番号 | `next_seq` | 数値 | `1`（発行時に P000001 → 成功後 2） |
| 備考 | `remarks` | 複数行 | 運用メモ |

作成手順（承認後）:

1. アプリ作成「個人顧客ID採番」
2. 上記フィールド追加 → 公開
3. レコード1件: `counter_key=PCM_PERSONAL_ID`, `next_seq=1`
4. 権限: **管理者のみ** 閲覧・編集。一般スタッフはアクセス不可

---

## 4. PCM フィールド一覧（承認後に作成）

### 4.1 基本

| ラベル | コード | 種類 | 必須 | 選択肢・制約 |
|--------|--------|------|------|----------------|
| 個人顧客ID | `personal_customer_id` | 文字列1行 | ○※採番後 | 重複禁止。一般は編集不可（権限＋JS） |
| 氏名 | `customer_name` | 文字列1行 | ○ | |
| ふりがな | `customer_kana` | 文字列1行 | — | |
| 郵便番号 | `postal_code` | 文字列1行 | — | |
| 都道府県 | `prefecture` | DROP_DOWN | — | 全47都道府県 |
| 市区町村 | `city` | 文字列1行 | — | |
| 番地以下 | `address_line` | 文字列1行 | — | |
| 建物名 | `building_name` | 文字列1行 | — | |
| 電話番号 | `phone` | 文字列1行 | — | |
| 携帯電話 | `mobile_phone` | 文字列1行 | — | |
| メールアドレス | `email` | 文字列1行 | — | |
| 生年月日 | `birthday` | 日付 | — | |
| 性別 | `gender` | DROP_DOWN | — | 未設定 / 女性 / 男性 / その他 / 回答しない |

※新規時は JS が採番して埋める。空のまま手動保存させない。

### 4.2 店舗会員

| ラベル | コード | 種類 | 選択肢 |
|--------|--------|------|--------|
| 会員区分 | `member_type` | DROP_DOWN | 一般 / 店舗会員 / 優待 / その他 |
| 会員番号 | `member_no` | 文字列1行 | |
| 入会日 | `member_start_date` | 日付 | |
| 有効期限 | `member_expiry_date` | 日付 | |
| 会員状態 | `member_status` | DROP_DOWN | 非会員 / 会員 / 退会 / 停止 |

### 4.3 顧客管理

| ラベル | コード | 種類 | 選択肢・注記 |
|--------|--------|------|----------------|
| 初回利用日 | `first_order_date` | 日付 | **App16未連携（将来集計）** |
| 最終利用日 | `last_order_date` | 日付 | 同上 |
| 利用回数 | `order_count` | 数値 | 同上。手入力運用しない |
| 累計利用金額 | `lifetime_amount` | 数値 | 同上 |
| 休眠区分 | `dormant_status` | DROP_DOWN | 通常 / 休眠候補 / 休眠 |
| DM郵送可否 | `dm_permission` | DROP_DOWN | 未設定 / 可 / 不可 |
| メール配信同意 | `email_permission` | DROP_DOWN | 未設定 / 同意 / 不同意 |
| LINE配信同意 | `line_permission` | DROP_DOWN | 未設定 / 同意 / 不同意 |
| 顧客メモ | `customer_note` | 複数行 | |

フォーム説明文（利用回数・累計）に「App16未連携のため自動更新しません」と記載する。

### 4.4 WEB 連携

| ラベル | コード | 種類 | 選択肢 |
|--------|--------|------|--------|
| WEBアカウントID | `web_account_id` | 文字列1行 | 一般編集制限 |
| LINE連携ID | `line_account_id` | 文字列1行 | |
| 初回登録経路 | `registration_source` | DROP_DOWN | 店舗 / WEB / 移行 / その他 |
| WEB本人確認状態 | `web_verified` | DROP_DOWN | 未連携 / 本人確認済 / 停止 |

---

## 5. 採番方式（確定案）

```text
create.show
  → personal_customer_id を空にする（複製対策）

create.submit
  1. GET カウンタ（counter_key = PCM_PERSONAL_ID）
  2. id = "P" + pad(next_seq, 6)
  3. PUT カウンタ next_seq+1（revision 付き）
  4. 競合 → 再取得して最大5回リトライ
  5. event.record.personal_customer_id = id して return
  6. その後 kintone が PCM を保存
  7. PCM 保存失敗時: 欠番許容（再利用しない）

edit
  → 採番しない。ID 変更を submit で拒否
```

完全な原子性はない（指示・設計どおり）。クライアント表示制御に加え、submit 時の再採番防止と重複時エラーメッセージで防御する。

---

## 6. 権限（kintone 標準で設定・承認後）

| | 一般スタッフ（店舗） | 管理者 |
|--|---------------------|--------|
| PCM アプリ | 閲覧・追加・編集 | すべて |
| `personal_customer_id` | 閲覧のみ（編集不可） | 閲覧のみ推奨（システム採番） |
| `web_account_id` | 閲覧のみ | 編集可 |
| 利用回数・累計金額 | 閲覧のみ | 閲覧のみ（将来バッチ用） |
| カウンタアプリ | **アクセス不可** | 閲覧・編集 |
| レコード削除 | 不可推奨 | 可（管理者） |

グループ名は環境の実名に合わせて割当（未確認のため承認時に指定ください）。

---

## 7. JavaScript（リポジトリ）

登録順（PCM アプリのみ）:

1. `customize/pcm_config.js`
2. `customize/pcm_numbering.js`
3. `customize/pcm_engine.js`
4. `customize/pcm_desktop.js`
5. `customize/pcm.css`

カウンタアプリには JS 不要。

**既存アプリ（8/16/19/21/35 等）には JS・設定を追加しない。**

---

## 8. テストデータ方針

- 氏名プレフィックス: `[TEST]`（例: `[TEST]山田花子`）
- `registration_source = その他`、メモに `PCM第1段階テスト` 
- 本番顧客と区別。テスト完了後は `[TEST]` で一覧検索して削除または `member_status=停止`

---

## 9. 承認チェックリスト

承認いただければ次を実施します。

- [ ] カウンタアプリ作成＋初期レコード
- [ ] PCM アプリ作成＋フィールド／権限／一覧
- [ ] App ID を `pcm_config.js` に反映
- [ ] JS/CSS 登録
- [ ] テスト項目（指示 §10）の実施と報告

**ご承認ください。** 都道府県・性別・会員区分などの選択肢文言の変更希望があれば併せて指示ください。
