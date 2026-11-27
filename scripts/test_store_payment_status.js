'use strict';

/**
 * A550 App16 入金状況モジュール／ゲートの単体テスト
 * node scripts/test_store_payment_status.js
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

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_status.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_shared.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_api.js'), 'utf8'));

const S = global.CAYANAS_StorePaymentStatus;
const P = global.CAYANAS_StorePickup;
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

assert('status module loaded', !!S && S.VERSION === '1.1.0');
assert('choices', S.ALL.join(',') === '未入金,一部入金,入金済み');
assert('smaregi message', S.SMAREGI_CONFIRM_MESSAGE === 'スマレジで残金の支払いを確認しましたか？');
assert('normalize paid alias 入金済', S.normalizeStatus('入金済') === '入金済み');
assert('normalize empty -> unpaid', S.normalizeStatus('') === '未入金');
assert('isFullyPaid only 入金済み', S.isFullyPaid('入金済み') && !S.isFullyPaid('一部入金'));
assert('needs smaregi for partial', S.needsSmaregiResidualConfirm('一部入金') === true);
assert('needs smaregi for unpaid', S.needsSmaregiResidualConfirm('未入金') === true);
assert('no smaregi for paid', S.needsSmaregiResidualConfirm('入金済み') === false);

assert('evaluate paid ok', S.evaluatePaymentForPickup('入金済み', false).ok === true);
assert('evaluate partial needs confirm', S.evaluatePaymentForPickup('一部入金', false).ok === false
  && S.evaluatePaymentForPickup('一部入金', false).code === 'needs_smaregi_confirm');
assert('evaluate unpaid needs confirm', S.evaluatePaymentForPickup('未入金', false).code
  === 'needs_smaregi_confirm');
assert('evaluate smaregi confirm allows partial', S.evaluatePaymentForPickup('一部入金', {
  smaregiResidualConfirmed: true,
}).ok === true && S.evaluatePaymentForPickup('一部入金', {
  smaregiResidualConfirmed: true,
}).smaregiConfirmed === true);
assert('evaluate admin exception', S.evaluatePaymentForPickup('一部入金', true).ok === true
  && S.evaluatePaymentForPickup('一部入金', true).exception === true);

const batchMsg = S.buildSmaregiConfirmMessage([
  { manageNo: 'M1', paymentState: '未入金' },
  { manageNo: 'M2', paymentState: '一部入金' },
]);
assert('batch confirm lists targets', batchMsg.indexOf('M1（未入金）') >= 0
  && batchMsg.indexOf('M2（一部入金）') >= 0
  && batchMsg.indexOf('スマレジで残金の支払いを確認しましたか？') >= 0);

assert('suggest paid from balance', S.suggestFromBalanceState('入金済', 0, 11000) === '入金済み');
assert('suggest partial', S.suggestFromBalanceState('一部入金', 5000, 6000) === '一部入金');
assert('suggest unpaid', S.suggestFromBalanceState('未入金', 11000, 0) === '未入金');

const orderBase = {
  $id: { value: '10' },
  $revision: { value: '2' },
  customer_code: { value: 'A550' },
  personal_customer_id: { value: 'P000001' },
  process_status: { value: '完了' },
  location_status: { value: '店舗' },
  delivery_status: { value: '引き取り待ち' },
  delivery_no: { value: 'N1' },
  manage_no: { value: '100' },
  store_payment_status: { value: '入金済み' },
  detail_table: { value: [{ value: { amount: { value: '10000' }, item_name: { value: '丸洗い' } } }] },
};

assert('gate ok when App16 paid', P.evaluatePickupGate(orderBase, {
  requirePaid: true,
}).ok === true);

assert('gate partial without confirm blocked', P.evaluatePickupGate({
  ...orderBase,
  store_payment_status: { value: '一部入金' },
}, { requirePaid: true }).ok === false);

assert('gate partial with smaregi confirm ok', P.evaluatePickupGate({
  ...orderBase,
  store_payment_status: { value: '一部入金' },
}, { requirePaid: true, smaregiResidualConfirmed: true }).ok === true);

assert('gate unpaid with admin exception ok', P.evaluatePickupGate({
  ...orderBase,
  store_payment_status: { value: '未入金' },
}, { requirePaid: true, unpaidHandoverApproved: true }).ok === true);

assert('gate ignores App97 balance when unpaid without confirm', P.evaluatePickupGate({
  ...orderBase,
  store_payment_status: { value: '未入金' },
}, {
  requirePaid: true,
  balanceInfo: { balance: 0, state: '入金済' },
}).ok === false);

assert('corporate still blocked by customer', P.evaluatePickupGate({
  ...orderBase,
  customer_code: { value: 'M070' },
  store_payment_status: { value: '入金済み' },
}, { requirePaid: true }).ok === false);

const partialCand = Api.buildPickupCandidate({
  ...orderBase,
  store_payment_status: { value: '一部入金' },
}, []);
assert('candidate partial canComplete (confirm later)', partialCand.canComplete === true
  && partialCand.needsSmaregiConfirm === true
  && partialCand.guideToApp97 === false
  && partialCand.paymentState === '一部入金');

const paidCandidate = Api.buildPickupCandidate(orderBase, []);
assert('candidate paid completable no smaregi', paidCandidate.canComplete === true
  && paidCandidate.paid === true
  && paidCandidate.needsSmaregiConfirm === false);

assert('put record delivery only', Object.keys(P.buildPickupPutRecord()).join(',') === 'delivery_status'
  && P.buildPickupPutRecord().delivery_status.value === '納品済');

assert('config field code', global.CAYANAS_StorePayment.ORDER_FIELDS.storePaymentStatus
  === 'store_payment_status');

if (failed) {
  process.exit(1);
}
console.log('\nAll store payment status tests passed.');
