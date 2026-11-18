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

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_shared.js'), 'utf8'));
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
    customer_code: { value: opts.customerCode || 'A550' },
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

const putFactory = S.buildStoreOrderUpdate('2026-11-01', 'N20261101-10', '納品待ち');
assert('店舗PUTは納品待ち(工場)', putFactory.delivery_status.value === '納品待ち');
assert('店舗PUTに納品番号', putFactory.delivery_no.value === 'N20261101-10');
assert('店舗PUTに納品日', putFactory.delivery_date.value === '2026-11-01');
assert('店舗PUTに process/location/work なし',
  putFactory.process_status === undefined
  && putFactory.location_status === undefined
  && putFactory.work_status === undefined);

const putStore = S.buildStoreOrderUpdate('2026-11-01', 'N20261101-10', '引き取り待ち');
assert('店舗到着済は引き取り待ちPUT', putStore.delivery_status.value === '引き取り待ち');

const corporate = S.buildCorporateOrderUpdate('2026-11-01', 'N20261101-10');
assert('法人PUTは従来どおり納品済+location',
  corporate.delivery_status.value === '納品済'
  && corporate.location_status.value === '納品済');

assert('工場は納品待ち put', (() => {
  const plan = S.planStoreOrderSync(order({ location: '工場' }), '2026-11-01', 'N1');
  return plan.action === 'put'
    && plan.targetStatus === '納品待ち'
    && plan.record.delivery_status.value === '納品待ち';
})());

assert('店舗完了は引き取り待ち put', (() => {
  const plan = S.planStoreOrderSync(order({ location: '店舗' }), '2026-11-01', 'N1');
  return plan.action === 'put'
    && plan.targetStatus === '引き取り待ち'
    && plan.record.delivery_status.value === '引き取り待ち';
})());

assert('納品済は skip', S.planStoreOrderSync(order({ delivery: '納品済', deliveryNo: 'OLD' }), '2026-11-01', 'N1').action === 'skip');
assert('別番号は warn', S.planStoreOrderSync(order({ delivery: '納品待ち', deliveryNo: 'OLD' }), '2026-11-01', 'N1').action === 'warn');
assert('同一引き取り待ちは skip', S.planStoreOrderSync(
  order({ location: '店舗', delivery: '引き取り待ち', deliveryNo: 'N1', deliveryDate: '2026-11-01' }),
  '2026-11-01',
  'N1'
).action === 'skip');
assert('納品待ち→引き取り待ちへ昇格', (() => {
  const plan = S.planStoreOrderSync(
    order({ location: '店舗', delivery: '納品待ち', deliveryNo: 'N1', deliveryDate: '2026-11-01' }),
    '2026-11-01',
    'N1'
  );
  return plan.action === 'put' && plan.targetStatus === '引き取り待ち';
})());
assert('番号空は skip', S.planStoreOrderSync(order(), '2026-11-01', '').action === 'skip');

assert('未完了でも納品待ち put 可',
  S.planStoreOrderSync(order({ process: '工場作業中' }), '2026-11-01', 'N2').targetStatus === '納品待ち');

assert('applied 引き取り待ち', S.isStoreDeliveryApplied(
  order({ delivery: '引き取り待ち', deliveryNo: 'N1', deliveryDate: '2026-11-01' }),
  '2026-11-01',
  'N1',
  '引き取り待ち'
));

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
assert('引き取り待ち定数', syncSrc.indexOf('STATUS_PICKUP_WAITING') !== -1);

if (failed) {
  process.exit(1);
}
console.log('\nAll A550 store sync tests passed.');
