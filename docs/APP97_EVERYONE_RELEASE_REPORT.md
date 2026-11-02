# App97 全スタッフ一斉公開 — 実施報告

- **実施**: 2026-11-02（Asia/Tokyo）
- **対象**: 店舗入金管理 App97
- **結果**: **SUCCESS**（everyone に view/add/edit を付与）

---

## ACL（本番）

| 主体 | view | add | edit | delete | appEdit |
|------|:----:|:---:|:----:|:------:|:-------:|
| `info@ayanas.co.jp` | ✓ | ✓ | ✓ | × | ✓ |
| Administrators | ✓ | ✓ | ✓ | ✓ | ✓ |
| CREATOR | ✓ | ✓ | ✓ | × | ✓ |
| **everyone** | **✓** | **✓** | **✓** | **×** | × |

- 入金レコードの物理削除は一般スタッフ不可（取消・返金で履歴を残す）
- バックアップ: `customize/backups/app97_everyone_open_2026-11-01T15-23-43/`
- 段階ACLへの戻し: `customize/backups/app97_stage1_acl_2026-11-01T15-13-50/`

---

## 運用注意（公開直後）

1. 初日は日次照合を必須（App97「日次入金照合」または `SMAREGI_AMOUNT=... node scripts/_app97_stage_ops_monitor.js`）
2. 金額差異・重複入金時は処理停止して原因報告
3. 返金・取消は履歴付き（物理削除しない）
4. 法人 App8/19/21/35・App16 工程は変更していない

---

## 関連

- 段階運用 Runbook: `docs/APP97_PHASED_ROLLOUT_RUNBOOK.md`
- 監視: `scripts/_app97_stage_ops_monitor.js`
