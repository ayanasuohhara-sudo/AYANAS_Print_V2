'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
  api: async () => ({ records: [] }),
  app: { getId: () => 0 },
};
global.kintone.api.url = (p) => p;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_numbering.js'), 'utf8'));

const C = global.CAYANAS_StorePayment;
const E = global.CAYANAS_StorePayment_Engine;
const N = global.CAYANAS_StorePayment_Numbering;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('version', !!C.VERSION);
assert('app id 97', C.STORE_PAYMENT_APP_ID === 97);
assert('tax rate 10%', C.TAX_RATE === 0.1);
assert('tax rounding round', C.TAX_ROUNDING === 'round');

assert('round 8000 -> tax 800', E.roundTaxYen(8000) === 800);
assert('inclusive 8000', E.calcInclusiveFromExclusive(8000).inclusive === 8800);
assert('round 1 yen edge', E.calcInclusiveFromExclusive(1).tax === 0);
assert('round 5 yen edge', E.calcInclusiveFromExclusive(5).tax === 1);
assert('floor mode', E.roundTaxYen(15, 'floor') === 1);
assert('ceil mode', E.roundTaxYen(11, 'ceil') === 2);

const order = {
  $id: { value: '100' },
  detail_table: {
    value: [
      { value: { amount: { value: '8000' } } },
      { value: { amount: { value: '2000' } } },
    ],
  },
};
assert('sum exclusive', E.sumDetailExclusive(order) === 10000);
assert('billed inclusive', E.getOrderBilledInclusive(order).inclusive === 11000);

const payments = [
  {
    payment_status: { value: '有効' },
    store_payment_lines: {
      value: [
        {
          value: {
            order_record_id: { value: '100' },
            allocated_amount: { value: '5000' },
          },
        },
      ],
    },
  },
  {
    payment_status: { value: '取消' },
    store_payment_lines: {
      value: [
        {
          value: {
            order_record_id: { value: '100' },
            allocated_amount: { value: '9999' },
          },
        },
      ],
    },
  },
  {
    payment_status: { value: '有効' },
    store_payment_lines: {
      value: [
        {
          value: {
            order_record_id: { value: '100' },
            allocated_amount: { value: '-1000' },
          },
        },
      ],
    },
  },
];
assert('paid ignores cancel, includes refund', E.sumAllocatedForOrder(payments, 100) === 4000);

const bal = E.getOrderBalance(order, payments);
assert('balance partial', bal.state === '一部入金' && bal.balance === 7000);

assert('pickup blocked when balance', E.canPickupWithBalance(bal, false).ok === false);
assert('pickup allowed with admin flag', E.canPickupWithBalance(bal, true).ok === true);
assert('pickup ok when paid', E.canPickupWithBalance({ balance: 0 }, false).ok === true);

const okDraft = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-1',
  paymentDate: '2026-11-01',
  paymentAmount: 8800,
  recordKind: '入金',
  lines: [{
    orderRecordId: '100',
    personalCustomerIdLine: 'P000002',
    billedInTax: 8800,
    previouslyPaidAmount: 0,
    allocatedAmount: 8800,
  }],
});
assert('full payment draft ok', okDraft.ok);

const over = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-2',
  paymentDate: '2026-11-01',
  paymentAmount: 100,
  recordKind: '入金',
  lines: [{
    orderRecordId: '100',
    personalCustomerIdLine: 'P000002',
    billedInTax: 8800,
    previouslyPaidAmount: 8800,
    allocatedAmount: 100,
  }],
});
assert('paid order blocks reentry', !over.ok);

const mismatch = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-3',
  paymentDate: '2026-11-01',
  paymentAmount: 1000,
  recordKind: '入金',
  lines: [{
    orderRecordId: '100',
    personalCustomerIdLine: 'P000002',
    billedInTax: 8800,
    previouslyPaidAmount: 0,
    allocatedAmount: 500,
  }],
});
assert('header vs lines mismatch', !mismatch.ok);

const refund = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-4',
  paymentDate: '2026-11-01',
  paymentAmount: -1000,
  recordKind: '返金',
  relatedRefundOf: 'SP-261101-000001',
  lines: [{
    orderRecordId: '100',
    personalCustomerIdLine: 'P000002',
    billedInTax: 8800,
    previouslyPaidAmount: 8800,
    allocatedAmount: -1000,
  }],
});
assert('refund draft ok', refund.ok);

const refundNoParent = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-5',
  paymentDate: '2026-11-01',
  paymentAmount: -1000,
  recordKind: '返金',
  relatedRefundOf: '',
  lines: [{
    orderRecordId: '100',
    personalCustomerIdLine: 'P000002',
    billedInTax: 8800,
    previouslyPaidAmount: 8800,
    allocatedAmount: -1000,
  }],
});
assert('refund requires parent', !refundNoParent.ok);

const drift = E.detectBilledDrift({ billedInTax: 8800 }, {
  detail_table: { value: [{ value: { amount: { value: '9000' } } }] },
});
assert('billed drift detected', drift.changed && drift.currentInclusive === 9900);

assert('txid', /^STP-/.test(E.createTransactionId()));
assert('prefix', N.todayPrefix().indexOf('SP-') === 0);

if (failed > 0) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
