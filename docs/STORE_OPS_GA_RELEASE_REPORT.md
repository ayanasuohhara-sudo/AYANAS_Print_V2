# 店舗システム — 実運用・一般公開 実施報告

- **実施**: 2026-11-02 23:16頃（Asia/Tokyo）
- **承認**: ユーザー指示「実運用、一般公開開始」
- **結果**: **SUCCESS**

証跡: `customize/backups/store_ops_ga_2026-11-02T14-16-52/`（`GA_OK.json` / `ROLLBACK.md`）

---

## 1. 実施内容

| 項目 | 結果 |
|------|------|
| App97 ACL everyone view/add/edit | **開放**（delete=false） revision 14→15 |
| App92 バーコード引き取り allowlist | **解除**（`PICKUP_ALLOWED_LOGIN_CODES: null`） |
| App92 本番 JS/CSS | **v1.3.0** デプロイ SUCCESS |
| UI 確認 | パネル表示・拒否文言なし・入力欄あり |

### App97 ACL（本番）

| 主体 | view | add | edit | delete | appEdit |
|------|:----:|:---:|:----:|:------:|:-------:|
| `info@ayanas.co.jp` | ✓ | ✓ | ✓ | × | ✓ |
| Administrators | ✓ | ✓ | ✓ | ✓ | ✓ |
| CREATOR | ✓ | ✓ | ✓ | × | ✓ |
| **everyone** | **✓** | **✓** | **✓** | **×** | × |

### App92

- VERSION **1.3.0**
- 全ログインユーザーがバーコード引き取り可能
- JS 順: config → engine → payment config/engine → pickup shared/api → desktop → pickup + CSS

---

## 2. 変更していないもの

- 実顧客データの一括更新・移行: **なし**
- 法人納品処理（App19 法人経路）: **非変更**
- App16 工程／場所／作業ステータスの仕様: **非変更**
- Print プラグイン: **非変更**（v149 のまま）

---

## 3. 運用開始直後の必須事項

1. 全端末で App92／App97 を **ハードリロード**
2. 初日〜数日は **日次入金照合必須**  
   - App97「日次入金照合」  
   - または `SMAREGI_AMOUNT=... node scripts/_app97_stage_ops_monitor.js YYYY-MM-DD`
3. 金額差異・二重入金疑い時は **処理停止**して管理者へ
4. 入金の物理削除禁止（取消・返金で履歴）
5. 納品書明細の安易な削除禁止 → `docs/A550_DELIVERY_CORRECTION_RUNBOOK.md`
6. 操作手順: `docs/STORE_STAFF_OPERATION_MANUAL.md`（一般公開版に更新）

---

## 4. 残存リスク（現場）

| リスク | 対応 |
|--------|------|
| スマレジ ±1 円 | 日次照合・自動補正しない |
| スキャナ／プリンタ実機差 | 初日に各1回確認 |
| 8%／非課税商品 | 未対応。出現時は停止 |
| 納品書自動巻き戻しなし | 管理者 Runbook |

---

## 5. 復旧

`customize/backups/store_ops_ga_2026-11-02T14-16-52/ROLLBACK.md`

- App97 限定 ACL 戻し: `node scripts/_pickup_waiting_prod.js acl` または stage1 バックアップ
- App92: allowlist を配列に戻して再デプロイ

---

## 6. 結論

**実運用・一般スタッフ公開を開始した。**  
限定 ACL／検証ユーザー専用の引き取り制限は解除済み。
