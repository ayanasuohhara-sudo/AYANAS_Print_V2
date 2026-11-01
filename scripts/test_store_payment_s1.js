'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
  api: async () => ({ records: [] }),
  app: { getId: () => 97 },
  getLoginUser: () => ({ code: 'test-user' }),
};
global.kintone.api.url = (p) => p;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_numbering.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_api.js'), 'utf8'));

const C = global.CAYANAS_StorePayment;
const E = global.CAYANAS_StorePayment_Engine;
const N = global.CAYANAS_StorePayment_Numbering;
const A = global.CAYANAS_StorePayment_Api;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('version 1.1', String(C.VERSION).indexOf('1.1') === 0);
assert('app id 97', C.STORE_PAYMENT_APP_ID === 97);
assert('tax rate 10%', C.TAX_RATE === 0.1);
assert('tax rounding round', C.TAX_ROUNDING === 'round');
assert('api exported', !!A && typeof A.registerPayment === 'function');

assert('round 8000 -> tax 800', E.roundTaxYen(8000) === 800);
assert('inclusive 8000', E.calcInclusiveFromExclusive(8000).inclusive === 8800);
assert('round 1 yen edge', E.calcInclusiveFromExclusive(1).tax === 0);
assert('round 5 yen edge', E.calcInclusiveFromExclusive(5).tax === 1);
assert('floor mode', E.roundTaxYen(15, 'floor') === 1);
assert('ceil mode', E.roundTaxYen(11, 'ceil') === 2);
assert('barcode normalize', E.normalizeBarcode('*103126383*\n') === '103126383');

const order = {
  $id: { value: '100' },
  $revision: { value: '3' },
  personal_customer_id: { value: 'P000002' },
  client_name: { value: 'テスト' },
  manage_no: { value: '103126383' },
  kimono_type: { value: '小紋' },
  process_status: { value: '完了' },
  location_status: { value: '店舗' },
  delivery_status: { value: '納品待ち' },
  delivery_no: { value: 'N20261101-1' },
  detail_table: {
    value: [
      { value: { amount: { value: '8000' }, item_name: { value: '変色直し' } } },
      { value: { amount: { value: '2000' }, item_name: { value: 'しみぬき' } } },
    ],
  },
};
assert('sum exclusive', E.sumDetailExclusive(order) === 10000);
assert('billed inclusive', E.getOrderBilledInclusive(order).inclusive === 11000);
assert('item names', E.joinItemNames(order) === '変色直し / しみぬき');

const payments = [
  {
    payment_status: { value: '有効' },
    store_payment_lines: {
      value: [{
        value: {
          order_record_id: { value: '100' },
          allocated_amount: { value: '5000' },
        },
      }],
    },
  },
  {
    payment_status: { value: '取消' },
    store_payment_lines: {
      value: [{
        value: {
          order_record_id: { value: '100' },
          allocated_amount: { value: '9999' },
        },
      }],
    },
  },
  {
    payment_status: { value: '有効' },
    store_payment_lines: {
      value: [{
        value: {
          order_record_id: { value: '100' },
          allocated_amount: { value: '-1000' },
        },
      }],
    },
  },
];
assert('paid ignores cancel, includes refund', E.sumAllocatedForOrder(payments, 100) === 4000);

const bal = E.getOrderBalance(order, payments);
assert('balance partial', bal.state === '一部入金' && bal.balance === 7000);

assert('pickup blocked when balance', E.canPickupWithBalance(bal, false).ok === false);
assert('pickup allowed with admin flag', E.canPickupWithBalance(bal, true).ok === true);
assert('pickup ok when paid', E.canPickupWithBalance({ balance: 0 }, false).ok === true);

const row = E.buildOrderAccountingRow(order, payments);
assert('accounting row selectable', row.selectable && row.balance === 7000);
assert('accounting row ids', row.orderRecordId === '100' && row.manageNo === '103126383');

const paidOrder = JSON.parse(JSON.stringify(order));
const paidBalPayments = [{
  payment_status: { value: '有効' },
  store_payment_lines: {
    value: [{
      value: {
        order_record_id: { value: '100' },
        allocated_amount: { value: '11000' },
      },
    }],
  },
}];
const paidRow = E.buildOrderAccountingRow(paidOrder, paidBalPayments);
assert('paid row not selectable', paidRow.selectable === false && paidRow.state === '入金済');
assert('paid row pickup eligible', paidRow.pickupEligible === true);

const multi = E.buildAllocationLinesFromSelection([
  Object.assign({}, row, { allocateAmount: 3000 }),
  {
    orderRecordId: '101',
    manageNo: '103126384',
    personalCustomerId: 'P000002',
    kimonoType: '訪問着',
    exclusive: 5000,
    billedInclusive: 5500,
    paid: 0,
    balance: 5500,
    selectable: true,
    allocateAmount: 5500,
  },
], 'custom');
assert('multi alloc sum', multi.paymentAmount === 8500 && multi.lines.length === 2);

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

const dupLine = E.validatePaymentDraft({
  personalCustomerId: 'P000002',
  transactionId: 'STP-3b',
  paymentDate: '2026-11-01',
  paymentAmount: 200,
  recordKind: '入金',
  lines: [
    {
      orderRecordId: '100',
      personalCustomerIdLine: 'P000002',
      billedInTax: 8800,
      previouslyPaidAmount: 0,
      allocatedAmount: 100,
    },
    {
      orderRecordId: '100',
      personalCustomerIdLine: 'P000002',
      billedInTax: 8800,
      previouslyPaidAmount: 0,
      allocatedAmount: 100,
    },
  ],
});
assert('duplicate order line blocked', !dupLine.ok);

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
assert('manage query', E.buildManageNoQuery('103126383').indexOf('A550') >= 0);
assert('open orders query', E.buildOpenOrdersByCustomerQuery('P000002').indexOf('personal_customer_id') >= 0);
assert('pcm search requires criteria', E.buildPcmSearchQuery({}) === '');
assert('pcm search by name', E.buildPcmSearchQuery({ customerName: '山田' }).indexOf('like') >= 0);

const kintoneRec = E.buildKintonePaymentRecord({
  personalCustomerId: 'P000002',
  clientNameSnapshot: 'テスト',
  paymentDate: '2026-11-01',
  paymentAmount: 7000,
  paymentMethod: '現金',
  transactionId: 'STP-X',
  recordKind: '入金',
  lines: multi.lines.slice(0, 1),
}, { storePaymentNo: 'SP-261101-000001', paymentStaffCodes: ['u1'] });
assert('kintone record header', kintoneRec.personal_customer_id.value === 'P000002');
assert('kintone record lines', kintoneRec.store_payment_lines.value.length === 1);
assert('kintone staff', kintoneRec.payment_staff.value[0].code === 'u1');

const pickupPut = E.buildPickupPutRecord('2026-11-01');
assert('pickup put delivery only', pickupPut.delivery_status.value === '納品済'
  && pickupPut.delivery_date.value === '2026-11-01'
  && !pickupPut.location_status
  && !pickupPut.process_status);

assert('pickup already done', E.isPickupAlreadyDone({
  delivery_status: { value: '納品済' },
}));

const daily = E.summarizeDailyPayments([
  {
    payment_status: { value: '有効' },
    record_kind: { value: '入金' },
    payment_amount: { value: '3000' },
    payment_method: { value: '現金' },
    store_payment_no: { value: 'SP-1' },
    personal_customer_id: { value: 'P000001' },
    pos_transaction_id: { value: 'POS1' },
    transaction_id: { value: 'T1' },
  },
  {
    payment_status: { value: '取消' },
    record_kind: { value: '入金' },
    payment_amount: { value: '999' },
    payment_method: { value: '現金' },
  },
  {
    payment_status: { value: '有効' },
    record_kind: { value: '返金' },
    payment_amount: { value: '-100' },
    payment_method: { value: '現金' },
  },
  {
    payment_status: { value: '有効' },
    record_kind: { value: '入金' },
    payment_amount: { value: '2000' },
    payment_method: { value: 'クレジットカード' },
    store_payment_no: { value: 'SP-2' },
    personal_customer_id: { value: 'P000002' },
    pos_transaction_id: { value: '' },
    transaction_id: { value: 'T2' },
  },
]);
assert('daily total', daily.total === 5000 && daily.count === 2);
assert('daily by method', daily.byMethod['現金'] === 3000 && daily.byMethod['クレジットカード'] === 2000);

const match = E.compareDailyReconcile(daily, 5000);
const mismatchPos = E.compareDailyReconcile(daily, 4900);
assert('reconcile match', match.matched && match.diff === 0);
assert('reconcile mismatch', !mismatchPos.matched && mismatchPos.diff === 100);

if (failed > 0) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
