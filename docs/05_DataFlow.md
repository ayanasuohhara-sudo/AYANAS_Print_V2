# AYANAS 基幹システム Version 1.0 — データフロー・更新責任

## 基本方針

| データ | 更新元（正） | 備考 |
|--------|-------------|------|
| 請求金額 | **請求書 App 35** | 他アプリは参照のみ |
| 入金額（1件） | **入金管理 App 36** | 請求書は累計同期先 |
| 入金累計 | **入金36 → 請求35** | 入金保存時に書込 |
| 売掛残高 | **計算値** | `total − payment_amount` を請求35に保持 |
| 納品請求状態 | **納品管理 App 19** | 確定/取消で更新 |
| 売掛一覧 | **更新なし** | App 37 は読取専用 |

---

## フェーズ別データフロー

```
[受注16] ──参照──→ [納品19] ──取込──→ [請求35] ──印刷──→ 帳票
                         ↑                  │
                         └──確定/取消────────┘
                                            │
[入金36] ──invoice_no──→ 累計同期 ──→ [請求35]
                                            │
                                            ↓ 読取
                                       [売掛37]
```

---

## アプリ別更新責任一覧

### 受注明細（App 16）

| フェーズ | 更新する項目 | 更新しない項目 |
|---------|-------------|--------------|
| 受注登録 | manage_no, order_date, 明細, 顧客情報 | — |
| 納品以降 | **なし**（請求フローでは参照のみ） | 請求関連すべて |

### 納品管理（App 19）

| フェーズ | 更新する項目 | トリガー |
|---------|-------------|---------|
| 納品登録 | delivery_no, delivery_date, delivery_detail, invoice_status=未請求 | 手入力/API |
| 請求確定 | invoice_status=請求済, invoice_no, invoice_date | 請求確定ボタン |
| 請求取消 | invoice_status=未請求, invoice_no=空 | 請求書取消 |
| 取込〜確定前 | **請求関連は更新しない** | — |

### 請求書作成（App 35）

| フェーズ | 更新する項目 | トリガー |
|---------|-------------|---------|
| 未請求取込 | invoice_detail, item_count, qty_total, subtotal, tax, total, invoice_amount | 取込ボタン |
| 請求書作成 | invoice_date, due_date, invoice_status=作成中, closing_ym | 作成ボタン |
| 保存 | invoice_no（自動採番） | submit |
| 請求確定 | invoice_status=確定 | 確定ボタン |
| 請求取消 | 明細クリア, 集計0, invoice_status=取消 | 取消ボタン |
| 入金連携 | payment_amount, payment_status, accounts_receivable, last_payment_date, collection_status | 入金36保存後 |

### 入金管理（App 36）

| フェーズ | 更新する項目 | トリガー |
|---------|-------------|---------|
| 入金登録 | payment_no, payment_date, payment_amount, fee, received_amount, payment_detail | 手入力 |
| 保存後 | **請求35** の累計入金・売掛・入金状況を更新 | API（payment_create.js） |

### 売掛一覧（App 37）

| フェーズ | 更新する項目 |
|---------|-------------|
| すべて | **なし**（App 35/36 から都度取得して表示） |

### 請求締め実行履歴（App 38）

| フェーズ | 更新する項目 | トリガー |
|---------|-------------|---------|
| 一括作成開始 | batch_no, executed_at, executed_by, status=処理中 | 一括作成 |
| 一括作成完了 | invoice_count, delivery_count, total_amount, status | 一括作成 |

---

## 操作別更新マトリクス

| 操作 | 16受注 | 19納品 | 35請求 | 36入金 | 37売掛 |
|------|--------|--------|--------|--------|--------|
| 受注登録 | ○ | — | — | — | — |
| 納品登録 | — | ○ | — | — | — |
| 未請求取込 | — | — | ○ | — | — |
| 一括作成 | — | — | ○ | — | — |
| 請求確定 | — | ○ | ○ | — | — |
| 請求取消 | — | ○ | ○ | — | — |
| 請求書印刷 | — | — | — | — | — |
| 入金登録 | — | — | ○（同期） | ○ | — |
| 売掛表示 | — | — | — | — | 読取 |

○ = 更新あり　— = 更新なし

---

## 計算式（共通ルール）

```
税抜合計（subtotal）  = Σ invoice_detail.amount
消費税（tax）         = round(subtotal × 0.10)
税込合計（total）     = subtotal + tax
今回請求額（invoice_amount） = total（通常）

累計入金（payment_amount） = Σ 入金36.payment_amount（同一 invoice_no）
売掛残高（accounts_receivable） = total − payment_amount
入金状況（payment_status）:
  累計 0        → 未入金
  0 < 累計 < 請求額 → 一部入金
  累計 ≥ 請求額  → 入金済
```

---

*最終更新: AYANAS 基幹システム Version 1.0*
