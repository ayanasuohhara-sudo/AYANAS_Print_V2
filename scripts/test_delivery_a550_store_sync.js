'use strict';

/**
 * A550 納品書 → App16 店舗同期の単体テスト
 * node scripts/test_delivery_a550_store_sync.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
  app: { getId: () => 0 },
  events: { on: () => {} },
  api: { url: () => '' },
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/delivery_complete_sync.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/delivery_a550_edit_guard.js'), 'utf8'));

const S = global.CAYANAS_DeliveryCompleteSync;
const G = global.CAYANAS_DeliveryA550EditGuard;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

const order = (extra) => {
  const opts = extra || {};
  return {
    $id: { value: opts.id || '1' },
    manage_no: { value: opts.manageNo || 'M1' },
    process_status: { value: opts.process === undefined ? '完了' : opts.process },
    location_status: { value: opts.location === undefined ? '工場' : opts.location },
    work_status: { value: opts.work === undefined ? '仕上げ完了' : opts.work },
    delivery_status: { value: opts.delivery === undefined ? '未納品' : opts.delivery },
    delivery_no: { value: opts.deliveryNo === undefined ? '' : opts.deliveryNo },
    delivery_date: { value: opts.deliveryDate === undefined ? '' : opts.deliveryDate },
  };
};

assert('A550 は店舗顧客', S.isStoreCustomer('A550') && !S.isCorporateCustomer('A550'));
assert('法人は店舗ではない', S.isCorporateCustomer('M070') && !S.isStoreCustomer('M070'));

const put = S.buildStoreOrderUpdate('2026-11-01', 'N20261101-10');
assert('店舗PUTは納品待ち', put.delivery_status.value === '納品待ち');
assert('店舗PUTに納品番号', put.delivery_no.value === 'N20261101-10');
assert('店舗PUTに納品日', put.delivery_date.value === '2026-11-01');
assert('店舗PUTに process/location/work なし',
  put.process_status === undefined
  && put.location_status === undefined
  && put.work_status === undefined);

const corporate = S.buildCorporateOrderUpdate('2026-11-01', 'N20261101-10');
assert('法人PUTは従来どおり納品済+location',
  corporate.delivery_status.value === '納品済'
  && corporate.location_status.value === '納品済');

assert('初回は put', S.planStoreOrderSync(order(), '2026-11-01', 'N1').action === 'put');
assert('納品済は skip', S.planStoreOrderSync(order({ delivery: '納品済', deliveryNo: 'OLD' }), '2026-11-01', 'N1').action === 'skip');
assert('別番号は warn', S.planStoreOrderSync(order({ delivery: '納品待ち', deliveryNo: 'OLD' }), '2026-11-01', 'N1').action === 'warn');
assert('同一番号は skip', S.planStoreOrderSync(
  order({ delivery: '納品待ち', deliveryNo: 'N1', deliveryDate: '2026-11-01' }),
  '2026-11-01',
  'N1'
).action === 'skip');
assert('番号空は skip', S.planStoreOrderSync(order(), '2026-11-01', '').action === 'skip');

assert('未完了でも put 可（在庫表示は別条件）',
  S.planStoreOrderSync(order({ process: '工場作業中' }), '2026-11-01', 'N2').action === 'put');

assert('edit guard A550+番号', G.isA550WithSlip({
  customer_code: { value: 'A550' },
  delivery_no: { value: 'N1' },
}) === true);
assert('edit guard 法人は対象外', G.isA550WithSlip({
  customer_code: { value: 'M070' },
  delivery_no: { value: 'N1' },
}) === false);
assert('edit guard 番号なしは対象外', G.isA550WithSlip({
  customer_code: { value: 'A550' },
  delivery_no: { value: '' },
}) === false);

const syncSrc = fs.readFileSync(path.join(root, 'customize/delivery_complete_sync.js'), 'utf8');
assert('A550 で syncStoreOrders を呼ぶ', syncSrc.indexOf('syncStoreOrders') !== -1);
assert('法人経路は残る', syncSrc.indexOf('syncCorporateOrders') !== -1);
assert('A550 スキップの info のみログは廃止方向',
  syncSrc.indexOf('A550 のため App16 更新なし') === -1);

if (failed) {
  process.exit(1);
}
console.log('\nAll A550 store sync tests passed.');
