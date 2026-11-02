# 復旧手順（PCM×App16 本番反映）

バックアップ: `customize/backups/pcm_app16_deploy_20261101/`

## App16 反映前 JS 順
1. saiban.js
2. saiban1.js
3. price_master_search11.js
4. category.js
5. order_customer_search.js
6. price_master_register.js
7. order_record_form.js
8. additional_item_engine.js
9. order_price_unconfirmed_clear.js
10. schedule_customer.js
CSS: order_record_form.css

## 復旧
1. 作業停止
2. バックアップの各ファイルを `/k/v1/file.json` で再アップロード
3. `preview/app/customize.json` に上記順で PUT（order_pcm_* は外す）
4. 必要なら `personal_customer_id` をフォームから削除
5. `preview/app/deploy.json` で更新
