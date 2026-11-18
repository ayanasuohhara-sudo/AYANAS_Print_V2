# App35 個別請求作成「処理中」固着 — 調査報告

調査日: 2026-11-18（Asia/Tokyo）  
対象: App35（`10_請求書作成`）一覧ツールバー「個別請求作成」  
結論: **本番 `invoice_balance_desktop.js` の `BulkInvoiceCreate.run` パッチが、`InvoiceUtils.kintoneApi` のコールバック式 `kintone.api` 呼び出しから success/fail を落としており、最初の API 呼び出しで Promise が settle しない。**

---

## 症状

1. App35 一覧で「個別請求作成」→ ダイアログ入力 → 確認 → 実行
2. ボタン表示が **「処理中...」** のまま戻らない
3. 成功アラートも失敗アラートも出ない（`finally` の busy 解除に到達しない）

---

## 処理の流れ（プラグイン）

AYANAS Invoice プラグイン（`contentId=9319` index UI / `9312` bulk_invoice_create）:

```
handleIndividualCreateClick
  → showIndividualCreateDialog / confirmCreateInvoices
  → setButtonBusy(button, true)   // text =「処理中...」
  → BulkInvoiceCreate.runIndividual(...)
       → BulkInvoiceCreate.run(...)
  → alert / reload
  → finally setButtonBusy(false)
```

`setButtonBusy` は `button.textContent = busy ? '処理中...' : defaultLabel`。

`runIndividual` 自体は顧客コード必須チェックのあと `BulkInvoiceCreate.run` を呼ぶだけ。

---

## 根本原因

### 1. プラグイン側はコールバック式 API

`InvoiceUtils.kintoneApi`（plugin content `9301`）:

```js
(path, method, body) => new Promise((resolve, reject) => {
  kintone.api(path, method, body, resolve, (error) => { ...; reject(error); });
})
```

`BulkInvoiceCreate.createInvoiceRecord` や納品取得などはすべてこの `kintoneApi` 経由。

### 2. カスタマイズ側パッチがコールバックを破棄

本番で有効な `customize/invoice_balance_desktop.js` の `patchBulkInvoiceCreateModule` が、繰越 enrich のため `BulkInvoiceCreate.run` 実行中だけ `kintone.api` を差し替える:

```js
const wrappedApi = async (url, method, body) => {
  if (isRecordPost) await ensurePayloadEnriched(body.record);
  return originalApi(url, method, body); // ← success/fail 未転送
};
kintone.api = wrappedApi;
```

### 3. 固着メカニズム

| 呼び出し方 | async wrap（引数3つのみ） |
|---|---|
| Promise 式 `await kintone.api(url, method, body)` | settle する（wrap の戻り Promise が効く） |
| コールバック式 `kintone.api(url, method, body, resolve, reject)` | **resolve/reject が呼ばれず hang** |

`run` 開始直後の納品取得など、最初の `InvoiceUtils.kintoneApi` で止まる。  
そのため enrich や請求 POST まで到達せず、レコードも作られないまま「処理中...」が残る。

### 4. 二次障害

`try/finally` で `kintone.api` を戻す想定だが、`await originalRun` が settle しないと **finally が走らない**。  
その結果、同一ページ上で `kintone.api` が差し替わったまま残り、他の Invoice 操作も壊れうる（リロードで復帰）。

一括請求作成（`runBulk` → 同じ `BulkInvoiceCreate.run`）も **同じパッチ経路**のため、同様に固着する。

---

## 再現（読み取り・データ変更なし）

CDP（port 9399）上で App35 を開き検証。

| # | 条件 | 結果 |
|---|---|---|
| 1 | ネイティブ `InvoiceUtils.kintoneApi` | resolved（App35 取得） |
| 2 | async wrap（コールバック未転送）+ `kintoneApi` | **timeout（hang）** |
| 3 | コールバック転送 wrap + `kintoneApi` | resolved |
| 4 | Promise 式 + async wrap | resolved |
| 5 | 現行 patched `BulkInvoiceCreate.runIndividual` | **timeout（hang）** |
| 6 | hang 後の `kintone.api` | native ではなく wrap のまま |
| 7 | 強制で native に戻したあと | resolved |

証跡:

- `customize/backups/app35_kobetsu_src_plugin/`（plugin JS 抽出）
- `customize/backups/app35_kobetsu_hang2_*/hang_repro2.json`
- 再現スクリプト: `scripts/_app35_kobetsu_hang_repro2.js`

---

## 影響範囲

| 対象 | 影響 |
|---|---|
| 個別請求作成 | 実行後「処理中...」固着（本票） |
| 一括請求作成 | 同一 `BulkInvoiceCreate.run` パッチで同様 |
| 請求書レコード | hang 時点では未作成（先頭 API で停止） |
| レコード作成画面の「保存」carry hook | 別経路（`ayanasCarryPass`）。本票の「処理中...」ラベルとは別 |

---

## 修正方針（ローカル反映済み・本番未デプロイ）

`wrappedApi` で:

1. 非 POST（または対象外）は `originalApi(url, method, body, success, fail)` をそのまま転送
2. 請求 POST のみ enrich 後に、コールバック有無に応じて転送
3. Promise 式呼び出しも戻り値で settle できるようにする

ローカル: `customize/invoice_balance_desktop.js` に上記修正を入れた。  
**本番 JS 差し替えは承認後に実施すること。**

---

## 本番適用時の確認項目

1. App35 で個別請求作成 → 「処理中...」が一瞬出た後、成功/失敗アラートでラベル復帰
2. 一括請求作成も同様
3. 作成された請求の繰越・前回請求額ヘッダが enrich されていること
4. 失敗系（顧客なし・対象納品なし）でアラートが出てボタンが戻ること
