'use strict';

/**
 * App16 に store_payment_status を追加する準備スクリプト（デフォルト dry-run）。
 * 本番 POST は APPLY=1 かつ明示承認後のみ。
 *
 * 用法:
 *   node scripts/_app16_store_payment_status_field_dry.js
 *   APPLY=1 node scripts/_app16_store_payment_status_field_dry.js   # 本番反映（別承認後）
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const spec = JSON.parse(
  fs.readFileSync(path.join(root, 'docs/STORE_PAYMENT_STATUS_FIELDS.json'), 'utf8')
);

const APPLY = process.env.APPLY === '1';
const field = spec.properties.store_payment_status;

console.log('=== App16 store_payment_status field plan ===');
console.log(JSON.stringify(field, null, 2));
console.log('');
console.log('mode:', APPLY ? 'APPLY (would POST /k/v1/preview/app/form/fields.json)' : 'DRY-RUN');
console.log('app: 16');
console.log('note: 法人レコードは JS で空／編集不可。一括データ更新は別承認。');

if (!APPLY) {
  console.log('OK dry-run only. No kintone API calls.');
  process.exit(0);
}

console.error('APPLY=1 was set, but this script refuses to call production APIs');
console.error('until a dedicated prod deploy script is approved.');
process.exit(2);
