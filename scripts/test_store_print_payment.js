'use strict';

/**
 * 店舗帳票 — 入金集計・PCM判定・テンプレの単体テスト
 * node scripts/test_store_print_payment.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

// Minimal Format / Validation / Common / TemplateInterface / Core stubs for templates
global.Format = {
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;'),
  formatMoney: (v) => {
    const n = Number(v) || 0;
    return n.toLocaleString('ja-JP');
  },
  formatDate: (v) => String(v ?? '').slice(0, 10),
};
global.Validation = {
  assertDetailReportData: (data) => {
    if (!data || !data.header) {
      throw new Error('invalid data');
    }
  },
};
global.Common = {
  getBodyClass: (layout) => 'report-' + (layout && layout.reportType || 'x'),
  buildDocumentHtml: ({ title, bodyClass, content }) => (
    '<!DOCTYPE html><html><head><title>' + title + '</title></head>'
    + '<body class="' + bodyClass + '">' + content + '</body></html>'
  ),
};
global.TemplateInterface = {
  create: (name, fn) => ({ name: name, render: fn }),
};
global.Core = {
  Report: {
    DETAILS_PER_PAGE: 20,
    EMPTY_DETAIL: null,
    padPageDetails(pageDetails, size) {
      const padded = pageDetails.slice(0, size);
      while (padded.length < size) {
        padded.push(null);
      }
      return padded;
    },
    buildDetailPages(details, size) {
      const totalPages = Math.max(1, Math.ceil(details.length / size));
      const pages = [];
      for (let i = 0; i < totalPages; i += 1) {
        pages.push(this.padPageDetails(details.slice(i * size, (i + 1) * size), size));
      }
      return pages;
    },
    annotateManageNoVisibility(details) {
      let prev = null;
      return details.map((d) => {
        const mn = String(d && d.manage_no || '').trim();
        const show = mn !== '' && mn !== prev;
        if (mn) {
          prev = mn;
        }
        return Object.assign({}, d, { _showManageNo: show });
      });
    },
  },
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'js/store_print_payment.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/templates/order_detail_shared.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/templates/store_order.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/templates/store_delivery.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_delivery_pcm.js'), 'utf8'));

const P = global.CAYANAS_StorePrintPayment;
const Pcm = global.CAYANAS_StoreDeliveryPcm;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('payment helper loaded', !!P && !!Pcm);
assert('tax 10000 -> 11000', P.calcInclusiveFromExclusive(10000).inclusive === 11000);
assert('tax 3000 -> 3300', P.calcInclusiveFromExclusive(3000).inclusive === 3300);

const order = {
  $id: { value: '55' },
  customer_code: { value: 'A550' },
  personal_customer_id: { value: 'P000002' },
  detail_table: {
    value: [
      { value: { amount: { value: '3000' }, item_name: { value: '丸洗い' } } },
      { value: { amount: { value: '2000' }, item_name: { value: 'しみぬき' } } },
    ],
  },
};

assert('exclusive sum', P.sumDetailExclusive(order) === 5000);

const paymentsFull = [{
  payment_status: { value: '有効' },
  store_payment_lines: {
    value: [{
      value: {
        order_record_id: { value: '55' },
        allocated_amount: { value: '5500' },
      },
    }],
  },
}];
const balPaid = P.getOrderBalance(order, paymentsFull);
assert('paid state', balPaid.state === '入金済' && balPaid.balance === 0 && balPaid.billedInclusive === 5500);

const paymentsPartial = [{
  payment_status: { value: '有効' },
  store_payment_lines: {
    value: [{
      value: {
        order_record_id: { value: '55' },
        allocated_amount: { value: '2000' },
      },
    }],
  },
}];
const balPartial = P.getOrderBalance(order, paymentsPartial);
assert('partial state', balPartial.state === '一部入金' && balPartial.balance === 3500);

const balUnpaid = P.getOrderBalance(order, []);
assert('unpaid state', balUnpaid.state === '未入金' && balUnpaid.paid === 0);

const paymentsCancelIgnored = [{
  payment_status: { value: '取消' },
  store_payment_lines: {
    value: [{
      value: {
        order_record_id: { value: '55' },
        allocated_amount: { value: '9999' },
      },
    }],
  },
}];
assert('cancelled ignored', P.getOrderBalance(order, paymentsCancelIgnored).state === '未入金');

// PCM scan gates
const deliveryEmpty = { customer_code: { value: '' }, delivery_detail: { value: [] } };
const orderStore = {
  customer_code: { value: 'A550' },
  personal_customer_id: { value: 'P000002' },
  client_name: { value: '山田' },
};
const orderOtherPcm = {
  customer_code: { value: 'A550' },
  personal_customer_id: { value: 'P000003' },
  client_name: { value: '佐藤' },
};
const orderCorp = {
  customer_code: { value: 'M070' },
  personal_customer_id: { value: '' },
  client_name: { value: '法人' },
};

Pcm.resetCtx();
assert('first store scan ok', Pcm.evaluateScan(orderStore, deliveryEmpty).ok === true);
Pcm.applyContextFromOrder(orderStore);
const deliveryStore = { customer_code: { value: 'A550' }, delivery_detail: { value: [] } };
assert('same pcm ok', Pcm.evaluateScan(orderStore, deliveryStore).ok === true);
assert('other pcm rejected', Pcm.evaluateScan(orderOtherPcm, deliveryStore).ok === false);
assert('corp into store rejected', Pcm.evaluateScan(orderCorp, deliveryStore).ok === false);

Pcm.resetCtx();
const deliveryCorp = { customer_code: { value: 'M070' }, delivery_detail: { value: [] } };
assert('corp scan ok', Pcm.evaluateScan(orderCorp, deliveryEmpty).ok === true);
assert('store into corp rejected', Pcm.evaluateScan(orderStore, deliveryCorp).ok === false);

assert('store without pcm rejected', Pcm.evaluateScan({
  customer_code: { value: 'A550' },
  personal_customer_id: { value: '' },
}, deliveryEmpty).ok === false);

// Templates
const storeOrderHtml = global.StoreOrderTemplate.render({
  header: {
    manage_no: 'PKTEST1',
    client_name: '山田',
    pcm_customer_name: '山田花子',
    personal_customer_id: 'P000002',
    kimono_type: '小紋',
    kimono_spec: '袷',
    deadline: '2026-11-10',
    order_date: '2026-11-01',
    customer_code: 'A550',
    payment_state: '入金済',
    payment_exclusive: 5000,
    payment_tax: 500,
    payment_billed_inclusive: 5500,
    payment_paid: 5500,
    payment_balance: 0,
  },
  details: [
    { item_name: '丸洗い', amount: 3000 },
    { item_name: 'しみぬき', amount: 2000 },
  ],
  summary: {},
}, {}, { reportType: 'store_order' });

assert('store_order has manage_no', storeOrderHtml.indexOf('PKTEST1') !== -1);
assert('store_order has payment', storeOrderHtml.indexOf('入金済') !== -1);
assert('store_order payment binary label', storeOrderHtml.indexOf('入金状態') !== -1);
assert('store_order has barcode svg', /order-detail-barcode__svg/.test(storeOrderHtml));
assert('store_order landscape page', storeOrderHtml.indexOf('order-detail-page') !== -1
  && storeOrderHtml.indexOf('store-order-page') !== -1);
assert('store_order title', storeOrderHtml.indexOf('店舗受注表') !== -1);
assert('store_order left/right sheets', storeOrderHtml.indexOf('order-detail-sheet--left') !== -1
  && storeOrderHtml.indexOf('order-detail-sheet--right') !== -1);
assert('store_order dual barcodes only', (storeOrderHtml.match(/data-barcode-value="PKTEST1"/g) || []).length >= 2);
assert('store_order no sleeve tables', storeOrderHtml.indexOf('order-sleeve-tag-table') === -1
  && storeOrderHtml.indexOf('store-order-left-lower') === -1);
assert('store_order removed customer_name label', !/>顧客名</.test(storeOrderHtml));
assert('store_order removed slip_no label', storeOrderHtml.indexOf('得意先伝票番号') === -1);
assert('store_order removed in_charge label', storeOrderHtml.indexOf('得意先担当・係') === -1);
assert('store_order keeps client_name', storeOrderHtml.indexOf('お客様名') !== -1);
assert('store_order work checks', storeOrderHtml.indexOf('□ 下洗い済み') !== -1
  && storeOrderHtml.indexOf('□ しみ抜き済み') !== -1
  && storeOrderHtml.indexOf('□ 修理済み') !== -1);
assert('store_order old cut ticket removed', storeOrderHtml.indexOf('仕上げ完了登録票') === -1);
assert('store_order old checks removed', storeOrderHtml.indexOf('□ 受付') === -1
  && storeOrderHtml.indexOf('□ 引取済') === -1);
assert('store_order item_name', storeOrderHtml.indexOf('丸洗い') !== -1);
assert('store_order kimono_type', storeOrderHtml.indexOf('小紋') !== -1);
assert('store_order partial maps to unpaid', (() => {
  const unpaidHtml = global.StoreOrderTemplate.render({
    header: {
      manage_no: 'PKPARTIAL',
      pcm_customer_name: '部分太郎',
      payment_state: '一部入金',
      payment_balance: 1000,
      payment_exclusive: 5000,
      payment_tax: 500,
      payment_billed_inclusive: 5500,
      payment_paid: 4500,
    },
    details: [{ item_name: '丸洗い', amount: 5500 }],
    summary: {},
  }, {}, { reportType: 'store_order' });
  return unpaidHtml.indexOf('未入金') !== -1 && unpaidHtml.indexOf('一部入金') === -1;
})());

const manyDetails = [];
for (let i = 0; i < 25; i += 1) {
  manyDetails.push({
    manage_no: 'M' + i,
    kimono_type: '小紋',
    kimono_spec: '袷',
    item_name: '加工' + i,
    amount: 1000,
    payment_state: i % 2 ? '入金済' : '未入金',
    payment_balance: i % 2 ? 0 : 1100,
  });
}
const storeDeliveryHtml = global.StoreDeliveryTemplate.render({
  header: {
    delivery_no: 'N20261102-1',
    delivery_date: '2026-11-02',
    personal_customer_id: 'P000002',
    pcm_customer_name: '山田花子',
  },
  details: manyDetails,
  summary: {
    totalCount: 25,
    exclusive: 25000,
    tax: 2500,
    billedInclusive: 27500,
    paid: 13750,
    balance: 13750,
    payment_state: '一部入金',
  },
}, {}, { reportType: 'store_delivery' });

const pageCount = (storeDeliveryHtml.match(/store-delivery-page/g) || []).length;
assert('store_delivery paginates', pageCount >= 3);
assert('store_delivery footer totals once', (storeDeliveryHtml.match(/未入金残/g) || []).length === 1);
assert('store_delivery pcm', storeDeliveryHtml.indexOf('P000002') !== -1);

// Corporate templates unchanged markers
const deliveryJs = fs.readFileSync(path.join(root, 'js/templates/delivery.js'), 'utf8');
const desktopJs = fs.readFileSync(path.join(root, 'js/desktop.js'), 'utf8');
assert('corporate delivery template untouched title', deliveryJs.indexOf('納 品 書') !== -1);
assert('corporate buttons remain', desktopJs.indexOf('一般客 納品書') !== -1
  && desktopJs.indexOf('松葉店用 納品書') !== -1
  && desktopJs.indexOf('受注明細表') !== -1);
assert('store buttons gated', desktopJs.indexOf('store_order') !== -1
  && desktopJs.indexOf('store_delivery') !== -1
  && desktopJs.indexOf('isStoreCustomerRecord') !== -1);
assert('print does not PUT delivery_status', desktopJs.indexOf('store_order') !== -1
  && !/store_order[\s\S]{0,200}delivery_status/.test(desktopJs));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert('manifest v149', manifest.version === 149);
assert('manifest desktop/js <= 30', Array.isArray(manifest.desktop.js) && manifest.desktop.js.length <= 30);
assert('manifest includes store print bundle',
  manifest.desktop.js.indexOf('js/store_print_bundle.js') !== -1);
assert('preview draws store barcodes',
  fs.readFileSync(path.join(root, 'js/preview.js'), 'utf8').indexOf('store-order-barcode__svg') !== -1);

// Write preview artifacts
const outDir = path.join(root, 'docs/artifacts/store_print_preview');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'store_order_preview.html'), storeOrderHtml);
fs.writeFileSync(path.join(outDir, 'store_delivery_preview.html'), storeDeliveryHtml);

if (failed) {
  process.exit(1);
}
console.log('\nAll store print tests passed.');
console.log('Previews: ' + outDir);
