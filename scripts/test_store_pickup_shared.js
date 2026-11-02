'use strict';

/**
 * 店舗引き取り共通モジュールの単体テスト
 * node scripts/test_store_pickup_shared.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
  api: async () => ({ records: [] }),
  app: { getId: () => 92 },
};
global.kintone.api.url = (p) => p;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_shared.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_api.js'), 'utf8'));

const P = global.CAYANAS_StorePickup;
const E = global.CAYANAS_StorePayment_Engine;
const Api = global.CAYANAS_StorePickup_Api;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('shared loaded', !!P && !!Api);
assert('delivery constants', P.DELIVERY.pickupWaiting === '引き取り待ち'
  && P.DELIVERY.waiting === '納品待ち'
  && P.DELIVERY.done === '納品済');

assert('should set pickup waiting', P.shouldSetPickupWaiting({
  customerCode: 'A550',
  processStatus: '完了',
  locationStatus: '店舗',
  deliveryStatus: '納品待ち',
  deliveryNo: 'N1',
}) === true);

assert('not when factory', P.shouldSetPickupWaiting({
  customerCode: 'A550',
  processStatus: '完了',
  locationStatus: '工場',
  deliveryStatus: '納品待ち',
  deliveryNo: 'N1',
}) === false);

assert('not when no delivery_no', P.shouldSetPickupWaiting({
  customerCode: 'A550',
  processStatus: '完了',
  locationStatus: '店舗',
  deliveryStatus: '未納品',
  deliveryNo: '',
}) === false);

assert('not corporate', P.shouldSetPickupWaiting({
  customerCode: 'M070',
  processStatus: '完了',
  locationStatus: '店舗',
  deliveryStatus: '納品待ち',
  deliveryNo: 'N1',
}) === false);

assert('not when already done', P.shouldSetPickupWaiting({
  customerCode: 'A550',
  processStatus: '完了',
  locationStatus: '店舗',
  deliveryStatus: '納品済',
  deliveryNo: 'N1',
}) === false);

assert('slip status at store -> pickup waiting',
  P.resolveStoreDeliveryStatusAfterSlip({
    processStatus: '完了',
    locationStatus: '店舗',
    deliveryStatus: '未納品',
  }, 'N9') === '引き取り待ち');

assert('slip status at factory -> waiting',
  P.resolveStoreDeliveryStatusAfterSlip({
    processStatus: '完了',
    locationStatus: '工場',
    deliveryStatus: '未納品',
  }, 'N9') === '納品待ち');

assert('inbound patch at store',
  P.resolveInboundDeliveryStatusPatch('店舗', {
    customerCode: 'A550',
    processStatus: '完了',
    deliveryStatus: '納品待ち',
    deliveryNo: 'N2',
  }) === '引き取り待ち');

assert('inbound no patch corporate',
  P.resolveInboundDeliveryStatusPatch('店舗', {
    customerCode: 'M070',
    processStatus: '完了',
    deliveryStatus: '納品待ち',
    deliveryNo: 'N2',
  }) === null);

const put = P.buildPickupPutRecord();
assert('put only delivery_status', put.delivery_status.value === '納品済'
  && Object.keys(put).length === 1);

const order = {
  $id: { value: '10' },
  $revision: { value: '2' },
  customer_code: { value: 'A550' },
  personal_customer_id: { value: 'P000001' },
  process_status: { value: '完了' },
  location_status: { value: '店舗' },
  delivery_status: { value: '引き取り待ち' },
  delivery_no: { value: 'N1' },
  manage_no: { value: '100' },
};

assert('gate ok when paid', P.evaluatePickupGate(order, {
  balanceInfo: { balance: 0, state: '入金済' },
}).ok === true);

assert('gate unpaid', P.evaluatePickupGate(order, {
  balanceInfo: { balance: 1000, state: '未入金' },
}).ok === false);

assert('gate legacy 納品待ち', P.evaluatePickupGate({
  ...order,
  delivery_status: { value: '納品待ち' },
}, {
  balanceInfo: { balance: 0, state: '入金済' },
}).ok === true);

assert('gate already done', P.evaluatePickupGate({
  ...order,
  delivery_status: { value: '納品済' },
}, {
  balanceInfo: { balance: 0, state: '入金済' },
}).alreadyDone === true);

assert('gate pcm mismatch', P.evaluatePickupGate(order, {
  balanceInfo: { balance: 0, state: '入金済' },
  expectedPersonalCustomerId: 'P999999',
}).code === 'pcm_mismatch');

assert('gate not A550', P.evaluatePickupGate({
  ...order,
  customer_code: { value: 'M070' },
}, {
  balanceInfo: { balance: 0, state: '入金済' },
}).ok === false);

const cart = { items: [] };
assert('cart add first', P.canAddToPickupCart(cart, {
  personalCustomerId: 'P000001',
  manageNo: '100',
  orderRecordId: '10',
}).ok === true);

cart.items.push({
  personalCustomerId: 'P000001',
  manageNo: '100',
  orderRecordId: '10',
});

assert('cart reject other pcm', P.canAddToPickupCart(cart, {
  personalCustomerId: 'P000002',
  manageNo: '101',
  orderRecordId: '11',
}).code === 'pcm_mismatch');

assert('cart reject duplicate', P.canAddToPickupCart(cart, {
  personalCustomerId: 'P000001',
  manageNo: '100',
  orderRecordId: '10',
}).code === 'duplicate');

assert('engine put delegates', E.buildPickupPutRecord('2026-11-01').delivery_status.value === '納品済'
  && !E.buildPickupPutRecord('2026-11-01').delivery_date);

assert('payment put keys only status', Object.keys(E.buildPickupPutRecord()).join(',') === 'delivery_status');

if (failed) {
  process.exit(1);
}
console.log('\nAll store pickup shared tests passed.');
