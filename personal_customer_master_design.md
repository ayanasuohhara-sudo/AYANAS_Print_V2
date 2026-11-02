# 店舗・WEB共通 個人顧客マスタ設計

- **作成日**: 2026-10-31（Asia/Tokyo）
- **範囲**: 調査・設計のみ（新規アプリ作成・既存変更・本番データ更新なし）
- **整合先**: [`A550_store_system_investigation.md`](./A550_store_system_investigation.md)

---

## 0. 方針サマリ

| 項目 | 決定（本設計） |
|------|----------------|
| 法人マスタ | **App8 を維持**（A550＝店舗請求先として継続） |
| 個人マスタ | **新規 kintone アプリ**（仮称: 個人顧客マスタ） |
| 個人キー | `personal_customer_id`（`P000001` 連番） |
| 店舗請求先 | App16 / 入金とも **`customer_code = A550` を維持** |
| 受注正本 | App16。個人は `personal_customer_id` で紐付け |
| 店舗入金 | A550調査の **S1（店舗入金専用 App）** を前提。同じ `personal_customer_id` |
| 自動統合 | **氏名・電話のみでの自動統合は禁止** |
| WEB紐付け | **本人確認済みアカウント ID のみ**を信頼キーとする |

現状ギャップ（再掲）:

- App8 に個人 ID／会員番号なし（本番実測）
- App16 は `client_name` のみで個人を区別（同姓同名・①②③表記あり）
- App21 は法人請求充当用で A550 入金 0 件・`manage_no` なし
- ビジネスメニューに「店舗顧客マスタはアプリ完成後に追加」の予約コメントのみ（`customize/business_menu_config.js`）

---

## 1. 新規個人顧客マスタ — フィールド一覧と設定案

### 1.1 アプリ概要

| 項目 | 案 |
|------|-----|
| 表示名 | 個人顧客マスタ |
| 仮 App ID | 実装時採番（本設計では **PCM** と表記） |
| レコード単位 | 個人1人＝1レコード |
| ルックアップ元 | App16 / 店舗受付 / 店舗入金 /（将来）WEB API |

### 1.2 フィールド設計

#### A. 識別・状態（必須核）

| フィールドコード | ラベル | 種類 | 必須 | 備考 |
|------------------|--------|------|------|------|
| `personal_customer_id` | 個人顧客ID | 文字列1行 | ○ | `P000001`。採番後は原則変更不可（フィールドの編集不可推奨） |
| `customer_status` | 顧客状態 | DROP_DOWN | ○ | `有効` / `統合済` / `停止` / `削除予定` |
| `merged_into_id` | 統合先個人顧客ID | 文字列1行 | — | `統合済` 時のみ。生存レコードの ID |
| `source_channel` | 初回登録経路 | DROP_DOWN | ○ | `店舗` / `WEB` / `移行` / `その他` |
| `store_customer_code` | 店舗顧客コード | 文字列1行 | ○ | 固定初期値 **`A550`**（請求先。App8 と一致） |

#### B. 氏名・連絡先（業務表示用。照合キーにしない）

| フィールドコード | ラベル | 種類 | 必須 | 備考 |
|------------------|--------|------|------|------|
| `family_name` | 姓 | 文字列1行 | ○ | |
| `given_name` | 名 | 文字列1行 | — | 省略可（店舗運用で1フィールドしか取れない場合は `display_name` 優先） |
| `display_name` | 表示名 | 文字列1行 | ○ | App16 `client_name` へコピーする正。例「山田花子」 |
| `name_kana` | フリガナ | 文字列1行 | — | 検索補助 |
| `phone_primary` | 電話（主） | 文字列1行 | — | ハイフン除去正規化は JS 側で別フィールドに保持可 |
| `phone_mobile` | 携帯電話 | 文字列1行 | — | |
| `email` | メール | 文字列1行 | — | WEB アカウントメールとは**別**（後述 `web_account_email`） |
| `post_no` | 〒 | 文字列1行 | — | |
| `prefecture` / `city` / `address` / `building` | 住所 | 文字列1行 | — | App8 住所体系に揃える |

#### C. 会員・DM・休眠

| フィールドコード | ラベル | 種類 | 備考 |
|------------------|--------|------|------|
| `member_status` | 会員状態 | DROP_DOWN | `非会員` / `会員` / `退会` |
| `member_no` | 会員番号 | 文字列1行 | 任意。`personal_customer_id` とは別。未採番可 |
| `member_joined_date` | 会員登録日 | 日付 | |
| `dm_mail_opt_in` | DMメール希望 | DROP_DOWN | `希望` / `停止` / `未設定` |
| `dm_post_opt_in` | DM郵送希望 | DROP_DOWN | 同上 |
| `dm_line_opt_in` | LINE等希望 | DROP_DOWN | チャネル追加時用。未使用可 |
| `last_order_date` | 最終受注日 | 日付 | App16 集計で更新（バッチ／JS） |
| `last_pickup_date` | 最終引き取り日 | 日付 | 店舗入金／引き取り処理から更新 |
| `dormant_flag` | 休眠フラグ | DROP_DOWN | `通常` / `休眠候補` / `休眠`（規則は §7） |
| `dormant_since` | 休眠判定日 | 日付 | |

#### D. WEB アカウント連携（誤紐付け防止の核）

| フィールドコード | ラベル | 種類 | 備考 |
|------------------|--------|------|------|
| `web_account_id` | WEBアカウントID | 文字列1行 | IdP／会員基盤の**不変 ID**。一意索引相当（運用で重複禁止） |
| `web_account_status` | WEBアカウント状態 | DROP_DOWN | `未連携` / `本人確認済` / `停止` |
| `web_verified_at` | 本人確認日時 | 日時 | メール確認・SMS 等完了時刻 |
| `web_account_email` | WEBログインメール | 文字列1行 | 表示用。照合キーは `web_account_id` |
| `web_link_method` | 連携方法 | DROP_DOWN | `新規登録` / `店舗紐付け申請` / `運営承認` |

**禁止**: 未確認メール一致・氏名一致・電話一致だけで `web_account_id` を自動セットすること。

#### E. 運用・監査

| フィールドコード | ラベル | 種類 | 備考 |
|------------------|--------|------|------|
| `notes` | 社内メモ | 複数行 | 個人情報注意。権限で閲覧制限 |
| `duplicate_candidate_ids` | 重複候補ID一覧 | 複数行 | 手動統合用。自動統合しない |
| `created_store_user` | 店舗登録者 | ユーザー選択 | |
| `updated_reason` | 更新理由 | 文字列1行 | 統合・訂正時 |

システム標準: 作成日時／更新日時／作成者／更新者。

### 1.3 一覧・絞り込み（案）

| 一覧 | 条件 |
|------|------|
| 有効顧客 | `customer_status in ("有効")` |
| 休眠 | `dormant_flag in ("休眠","休眠候補")` |
| WEB未連携 | `web_account_status in ("未連携")` |
| 統合済（非表示既定） | `customer_status in ("統合済")` — 管理者のみ |

### 1.4 App8 との役割分担

| | App8 | PCM（個人） |
|--|------|-------------|
| 対象 | 法人・店舗請求先 | 個人 |
| キー | `customer_code`（A550 等） | `personal_customer_id` |
| App16 | `customer_code` / `customer_name` | `personal_customer_id` + `client_name` |
| 請求・法人入金 | App35 / App21 | 関与しない |

A550 レコード（App8 `$id=19`）は**削除・個人化しない**。

---

## 2. 個人顧客IDの重複しない自動採番方式

### 2.1 形式

- 正規表現: `^P\d{6}$`（必要なら桁増設 `P` + ゼロ埋め）
- 初期: `P000001`
- 表示・保存とも同一文字列

### 2.2 推奨方式: 採番カウンタ App（または PCM 内シングルレコード）+ 排他

kintone にネイティブな「一意連番」保証が弱いため、**単一レコードのカウンタを revision 付き更新**する。

```text
1. GET カウンタレコード（field: next_seq）
2. 候補 ID = "P" + pad(next_seq, 6)
3. PUT カウンタ next_seq+1 （If-Unmodified / revision）
4. revision 不一致 → リトライ（上限 N 回）
5. PCM に personal_customer_id = 候補 で POST
6. 万一 UNIQUE 相当の重複エラー → カウンタ再取得してリトライ
```

| 構成案 | 内容 |
|--------|------|
| **推奨** | 超小規模「採番」App（1レコード）または PCM 内の専用レコード（`record_type=sequence`） |
| 代替 | プラグイン連番（運用依存。本設計では JS 制御を正とする） |

### 2.3 禁止・注意

- クライアント時計やランダムだけで ID を決めない
- 複数端末同時登録は revision リトライ必須
- 統合後も **旧 ID は再利用しない**（監査・過去受注参照のため）

### 2.4 実装モジュール案（未実装）

`personal_customer_numbering.js` — `allocateNextPersonalCustomerId()`  
店舗受付・WEB API・移行バッチが同一関数を呼ぶ。

---

## 3. App16 への個人顧客ID連携方法

### 3.1 App16 追加フィールド（実装時・本設計の提案）

| コード | 種類 | 必須化タイミング |
|--------|------|------------------|
| `personal_customer_id` | 文字列1行（または PCM ルックアップ） | 段階: 空許容 → A550 新規のみ必須 → 全 A550 必須 |
| （任意）`personal_customer_lookup` | ルックアップ | UI 用。保存値の正は `personal_customer_id` |

既存のまま維持:

- `customer_code` = `A550`
- `customer_name` = App8 の店舗名（ayanasu）
- `client_name` = PCM `display_name` をコピー（印刷・現場表示用）

### 3.2 連携ルール

| 条件 | 動作 |
|------|------|
| `customer_code ≠ A550` | `personal_customer_id` は空でよい（法人は App8 のみ） |
| `customer_code = A550` かつ新規 | 受付 UI で PCM 選択または新規作成後、ID をセットしてから保存 |
| 保存時バリデーション（JS） | A550 で ID 空 → エラー（必須化フェーズ後） |
| PCM 側氏名変更 | 既存 App16 の `client_name` は**自動一括更新しない**（履歴保全）。新規受注のみ最新名 |

### 3.3 ルックアップ設計上の注意

- ルックアップキーは `personal_customer_id`（表示名ではない）
- コピー項目案: `display_name`→`client_name`、電話・住所は受注に必要な範囲のみ（過剰コピー禁止）
- `customer_code` はルックアップで上書きせず、受付テンプレで A550 固定

### 3.4 既存 JS との関係

| ファイル | 方針 |
|----------|------|
| `order_customer_search.js` | App8 検索は法人用として維持。A550 時は PCM 検索 UI を併設（新規 JS） |
| `delivery_complete_sync.js` | **変更しない**（A550 除外維持） |
| 店舗納期 `store_deadline_*` | 表示に `personal_customer_id` / `client_name` を追加可能（読取のみ） |

---

## 4. 既存 A550 受注データの移行方法

前提: App16 `customer_code=A550` は調査時点で約 87 件。個人は `client_name` 依存。

### 4.1 原則

1. **氏名一致だけでは1人にまとめない**
2. 移行バッチは「**仮個人**」を作り、後で人が統合する
3. オープン受注（未納品・納品待ち）を優先、納品済は後回し可

### 4.2 フェーズ

| Phase | 内容 |
|-------|------|
| M0 | App16 に `personal_customer_id` 追加（空許容）。PCM / 採番 App を作成 |
| M1 | 各 A550 受注に対し、**受注1件＝仮個人1件**で ID 採番し埋める（最も安全・重複多め） |
| M2 | 店舗が「同一人物候補」画面で **手動統合**（電話・伝票・記憶を根拠）。統合時のみ複数受注を生存 ID に付け替え |
| M3 | 新規受付から ID 必須。仮個人の新規発行を抑制 |
| M4 | （任意）納品済過去分の整理 |

### 4.3 M1 の機械ルール（自動統合しない）

```text
FOR each App16 where customer_code=A550 and personal_customer_id="":
  allocate Pxxxxxx
  create PCM {
    personal_customer_id,
    display_name = client_name,
    source_channel = 移行,
    customer_status = 有効,
    store_customer_code = A550,
    notes = "移行: manage_no=..."
  }
  PUT App16.personal_customer_id
```

同一 `client_name` が複数あっても **別 ID のまま**にする。

### 4.4 候補提示（統合支援。自動では結合しない）

PCM に `duplicate_candidate_ids` をバッチで埋める条件例（すべて「候補」）:

- 正規化電話が一致
- 正規化カナ＋姓が一致
- 同一 `client_name` かつ受注日が近接

**候補フラグのみ。結合は人間の操作＋監査ログ。**

### 4.5 ロールバック

- 移行バッチは実行ログ（manage_no ↔ 旧空 → 新 ID）を CSV／ログ App に残す
- PCM 仮レコード削除は、参照 App16 がゼロの場合のみ

---

## 5. 店舗受付時の顧客検索・新規登録方法

### 5.1 UI 配置

App16 追加／編集（A550 選択時）または専用「店舗受付」スペース:

1. **個人顧客検索**（PCM）
2. ヒットを選択 → `personal_customer_id` / `client_name` セット
3. ヒットなし → **新規登録**ダイアログ → 採番 → セット
4. `customer_code` は A550 固定（App8 ルックアップまたは定数）

### 5.2 検索キー（表示・絞り込み用）

許可する検索: 表示名部分一致、カナ、電話（下4桁／正規化全桁）、会員番号、`personal_customer_id` 完全一致。

検索結果には必ず **ID を表示**し、同姓同名を並記して選ばせる。

### 5.3 新規登録最小項目

必須: `display_name`（または姓）、`source_channel=店舗`  
推奨: 電話いずれか、カナ  
登録と同時に採番して App16 へ反映。

### 5.4 既存 `order_customer_search.js` との分離

- App8 検索: 法人コード選択用（現状維持）
- PCM 検索: 新規 `personal_customer_search.js`（仮）  
A550 のとき App8 で個人名を探させない（誤って他法人を選ぶ事故防止）。

---

## 6. WEB注文時の既存顧客照合方法

### 6.1 信頼できるキー

| 優先 | キー | 条件 |
|------|------|------|
| 1 | `web_account_id` | `web_account_status = 本人確認済` |
| 2 | （店舗オペレータ承認）紐付け申請 | 本人確認後に運営または本人が承認 |

**用いない（自動確定禁止）**: 氏名のみ、電話のみ、未確認メールのみ、住所類似。

### 6.2 フロー

```text
WEB ログイン（本人確認済）
  → web_account_id で PCM 検索
  → ヒット: その personal_customer_id で App16 相当の注文を作成
  → 未ヒット: PCM 新規（source=WEB, web_* セット, 採番）→ 注文作成

店舗で作った PCM を WEB に初回つなぐ場合:
  → ログイン済ユーザーが「店舗会員連携」申請
  → personal_customer_id をユーザーが知っている／店舗発行コード／ワンタイム
  → または運営が PCM 画面で web_account_id を手動セット
  → 自動で「同姓同名の店舗客」を選ばない
```

### 6.3 衝突

- 同一 `web_account_id` が2 PCM に付くことは DB 制約相当で禁止（保存前チェック）
- 1 PCM に複数 WEB アカウント: 原則1:1。家族利用は別個人 ID を推奨

---

## 7. 会員管理・DM・休眠顧客管理の設計

### 7.1 会員

- `member_status` / `member_no` は PCM 上の属性
- 会員番号は販促用。**システム正キーは常に `personal_customer_id`**
- 退会: `member_status=退会`。注文履歴・ID は残す（`customer_status` は有効のままか停止かはポリシー）

### 7.2 DM

| チャネル | 送信条件（案） |
|----------|----------------|
| メール | `dm_mail_opt_in=希望` かつ有効な `email` または `web_account_email` |
| 郵送 | `dm_post_opt_in=希望` かつ住所充足 |
| 抽出 | PCM 一覧または外部 MA へ CSV／API。`統合済` は除外 |

オプトアウトは即座にフラグ更新。注文処理とは独立。

### 7.3 休眠

| 段階 | 条件案（要ビジネス確定） | 動作 |
|------|--------------------------|------|
| 休眠候補 | `last_order_date` が N ヶ月超（例 18） | フラグのみ。DM 抑制は任意 |
| 休眠 | 候補から M ヶ月追加で受注なし | DM 対象外既定 |
| 復帰 | 新規受注または引き取り | フラグを `通常` に戻し最終日更新 |

バッチは App16 を集計して PCM を更新（PCM が正の属性、受注が正の事実）。

---

## 8. 店舗入金専用アプリとの連携

A550調査の **S1** を前提とする。

### 8.1 入金 App（仮称 STP）必須フィールド

| コード | 用途 |
|--------|------|
| `personal_customer_id` | PCM 紐付け（必須） |
| `customer_code` | 固定 A550 |
| `client_name` | 表示用コピー |
| `manage_no`（明細） | 対象受注 |
| `payment_amount` / `payment_date` / `payment_record_status` | 入金事実 |
| `idempotency_key` | 二重登録防止 |

App21 / App35 には書き込まない。

### 8.2 連携動作

```text
引き取り画面で personal_customer_id 単位に未引き取り App16 を一覧
  → 入金時 STP に personal_customer_id を必ず保存
  → 成功後 App16 delivery_status=納品済 等（A550調査 §11）
  → PCM.last_pickup_date 更新
```

同一人物判定は **ID 一致のみ**（`client_name` 一致一覧は ID 未整備移行期の補助表示に限定）。

### 8.3 App21 との境界

| | App21 | STP |
|--|-------|-----|
| 顧客 | 法人 `customer_code` | `personal_customer_id` + A550 |
| 充当 | `invoice_no` | `manage_no` |
| A550 | 現状 0 件・使わない | 店舗会計の正 |

---

## 9. 個人情報のアクセス権限と重複顧客の統合方法

### 9.1 権限（案）

| ロール | PCM | メモ・住所・連絡先 | 統合操作 | WEB ID 編集 |
|--------|-----|--------------------|----------|-------------|
| 店舗スタッフ | 検索・新規・受注連携 | 必要最小 | 不可 | 不可 |
| 店舗リーダー | 同上 | 閲覧 | 候補確認まで | 不可 |
| 事務・CS | 閲覧・DM フラグ | 可 | 可 | 可（承認） |
| システム管理者 | 全 | 全 | 全 | 全 |
| WEB 連携サービスアカウント | API で読取／自アカウント分更新 | 制限付き | 不可 | 自 ID のみ |

kintone: アプリ権限＋フィールド閲覧権。`notes` は店舗一般から隠すことを推奨。

### 9.2 重複統合手順（手動のみ）

```text
1. 生存レコード S と統合元 M1,M2… を指定（いずれも有効）
2. 確認画面: 各 ID の受注件数・入金件数・WEB 連携有無を表示
3. 実行:
   - App16: personal_customer_id IN (M*) → S に PUT
   - STP: 同様に付け替え
   - M*: customer_status=統合済, merged_into_id=S
   - S に WEB が無く M に本人確認済 WEB がある場合のみ、運営確認のうえ web_* を S へ移管（衝突時は中止）
4. 監査ログ（誰が・いつ・どの ID を・根拠メモ）
```

**自動統合ジョブは作らない。**

### 9.3 統合禁止条件

- 両方に異なる `web_account_id`（本人確認済）がある
- 一方が `停止` で法的保全中（要ポリシー）

---

## 10. 将来の WEB 注文 API 連携を考慮した構造

### 10.1 論理エンティティ

```text
App8 Customer (billing)          PCM PersonalCustomer
   customer_code=A550        personal_customer_id=Pxxxxxx
         \                      /          \
          \                    /            web_account_id (verified)
           \                  /
            App16 Order —— personal_customer_id
                 manage_no
                      \
                       STP StorePayment —— personal_customer_id + manage_no
```

### 10.2 API リソース案（外部向け・実装は将来）

| API | 説明 |
|-----|------|
| `GET /personal-customers/by-web-account/{id}` | 本人確認済トークン必須 |
| `POST /personal-customers` | WEB 初回。サーバ側で採番 |
| `POST /orders` | body に `personal_customer_id` または web トークンから解決。`customer_code=A550` |
| `POST /link-requests` | 店舗 PCM との手動連携申請 |

外部に晒す ID は `personal_customer_id` と `web_account_id`。kintone `$id` は内部用。

### 10.3 冪等・イベント

- WEB 注文: `idempotency_key`（クライアント生成）で二重注文防止
- PCM 作成と App16 作成は「PCM 成功 → 注文」順。注文失敗時も PCM は残してよい
- 将来のイベント: `PersonalCustomerMerged`, `WebAccountLinked`（監査・キャッシュ無効化）

### 10.4 データ最小化

API レスポンスに社内 `notes`・他者の電話を載せない。店舗専用フィールドと WEB 公開プロファイルを論理分割（同一レコード内の権限／API 層でフィルタ）。

---

## 11. 実装順序（設計上の推奨・未着手）

1. PCM アプリ＋採番方式の確定（フィールドは本ドキュメント）
2. App16 `personal_customer_id` 追加（空許容）
3. 店舗受付検索／新規 JS
4. A550 既存の M1 仮個人移行
5. 統合 UI（権限者）
6. 店舗入金 STP に ID 必須
7. 引き取り画面の同一人物一覧を ID 基準へ
8. WEB: `web_account_*` と API 契約
9. 会員・DM・休眠バッチ

法人 App8 / App19 A550 除外 / App21 法人入金は変更しない（A550調査と同一制約）。

---

## 12. 未確定事項（ビジネス判断）

1. 休眠の月数 N / M
2. 会員番号を採番するか、`personal_customer_id` を会員番号として印刷するか
3. `client_name` と `family_name`+`given_name` の店舗入力 UX
4. WEB と店舗の初回連携手段（ワンタイムコード／運営承認／注文時ログイン必須）
5. 統合時の App19 過去納品書の扱い（通常は変更不要）
6. PCM の本番 App ID・スペース配置
7. 個人情報の保管期間・削除請求（`削除予定` の物理削除タイミング）

---

## 13. A550_store_system_investigation.md との対応表

| A550調査 | 本設計 |
|----------|--------|
| 個人 ID が最重要未確定 | PCM 新設＋`P000001` で確定方針 |
| App16 に `personal_customer_id` 提案 | §3 で連携詳細化 |
| 同一人物は ID のみ | §5–6, §8, §9 で徹底。氏名電話自動統合禁止 |
| 店舗入金 S1 | §8 で同一 ID を必須化 |
| App8 は個人台帳にしない | §1.4 で役割分離 |
| 移行は仮 ID→名寄せ | §4 |
| ビジネスメニュー予約 | PCM 完成後にリンク追加（実装時） |

---

## 付録. 参照

| 内容 | パス |
|------|------|
| 店舗引き取り・入金調査 | `A550_store_system_investigation.md` |
| App8 顧客検索（法人） | `customize/order_customer_search.js` |
| A550 納品除外 | `customize/delivery_complete_sync.js` |
| メニュー予約コメント | `customize/business_menu_config.js` |
| 店舗納期 A550 | `customize/store_deadline_config.js` |

（本ドキュメント作成時点で、新規アプリ作成・既存アプリ変更・本番データ更新は行っていない。）
