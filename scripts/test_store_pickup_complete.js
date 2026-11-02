'use strict';

/**
 * completePickup 統合テスト（kintone.api モック）
 * node scripts/test_store_pickup_complete.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

const orders = new Map();
const paymentsByPcm = new Map();
const putLog = [];

const makeOrder = (overrides) => {
  const base = {
    $id: { value: '100' },
    $revision: { value: '5' },
    customer_code: { value: 'A550' },
    personal_customer_id: { value: 'P000002' },
    client_name: { value: '[TEST]山田花子' },
    manage_no: { value: 'TSP1' },
    kimono_type: { value: '小紋' },
    kimono_spec: { value: '袷' },
    process_status: { value: '完了' },
    location_status: { value: '店舗' },
    work_status: { value: '仕上げ完了' },
    delivery_status: { value: '引き取り待ち' },
    delivery_no: { value: 'DN1' },
    detail_table: {
      value: [
        { value: { item_name: { value: '丸洗い' }, amount: { value: '3000' } } },
      ],
    },
  };
  return Object.assign(base, overrides || {});
};

global.kintone = {
  app: { getId: () => 92 },
  api: async (url, method, body) => {
    const pathName = String(url || '');
    const isRecords = /\/k\/v1\/records\.json/.test(pathName);
    const isRecord = /\/k\/v1\/record\.json/.test(pathName) && !isRecords;
    if (method === 'GET' && isRecords) {
      if (Number(body.app) === 97) {
        const pcmMatch = String(body.query || '').match(/P\d+/);
        const pcm = pcmMatch ? pcmMatch[0] : '';
        return { records: paymentsByPcm.get(pcm) || [] };
      }
      return { records: [] };
    }
    if (method === 'GET' && isRecord) {
      const rec = orders.get(String(body.id));
      if (!rec) {
        throw new Error('not found ' + body.id);
      }
      return { record: JSON.parse(JSON.stringify(rec)) };
    }
    if (method === 'PUT' && isRecord) {
      putLog.push(JSON.parse(JSON.stringify(body)));
      const rec = orders.get(String(body.id));
      if (!rec) {
        throw new Error('missing ' + body.id);
      }
      if (String(body.revision) !== String(rec.$revision.value)) {
        const err = new Error('revision conflict');
        err.code = 'GA001';
        throw err;
      }
      Object.keys(body.record || {}).forEach((key) => {
        rec[key] = body.record[key];
      });
      rec.$revision = { value: String(Number(rec.$revision.value) + 1) };
      // process/location/work must remain untouched by pickup
      return { revision: rec.$revision.value };
    }
    throw new Error('unexpected api ' + method + ' ' + pathName);
  },
};
global.kintone.api.url = (p) => p;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_shared.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_api.js'), 'utf8'));

const Api = global.CAYANAS_StorePickup_Api;
const P = global.CAYANAS_StorePickup;
const E = global.CAYANAS_StorePayment_Engine;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

const reset = () => {
  orders.clear();
  paymentsByPcm.clear();
  putLog.length = 0;
};

// --- helpers for payment records (fully paid / unpaid / partial) ---
const paidPayment = (orderId, amount) => ({
  payment_status: { value: '有効' },
  personal_customer_id: { value: 'P000002' },
  store_payment_lines: {
    value: [
      {
        value: {
          order_record_id: { value: String(orderId) },
          allocated_amount: { value: String(amount) },
        },
      },
    ],
  },
});

reset();
orders.set('100', makeOrder());
paymentsByPcm.set('P000002', [paidPayment(100, 3300)]);

(async () => {
  // 1. 先払い済み → 引き取り完了
  {
    const r = await Api.completePickup('100', { expectedPersonalCustomerId: 'P000002' });
    assert('prepaid pickup ok', r.ok === true && !r.alreadyDone);
    assert('prepaid put delivery_status only', putLog.length === 1
      && putLog[0].record.delivery_status.value === '納品済'
      && Object.keys(putLog[0].record).length === 1
      && String(putLog[0].revision) === '5');
    assert('prepaid process/location/work unchanged',
      orders.get('100').process_status.value === '完了'
      && orders.get('100').location_status.value === '店舗'
      && orders.get('100').work_status.value === '仕上げ完了');
  }

  // 2. 二重引き取り防止
  {
    putLog.length = 0;
    const r = await Api.completePickup('100', { expectedPersonalCustomerId: 'P000002' });
    assert('double pickup alreadyDone', r.ok === true && r.alreadyDone === true);
    assert('double pickup no put', putLog.length === 0);
  }

  // 3. 未入金防止
  reset();
  orders.set('101', makeOrder({
    $id: { value: '101' },
    manage_no: { value: 'TSP-U' },
    delivery_status: { value: '引き取り待ち' },
  }));
  paymentsByPcm.set('P000002', []);
  {
    const r = await Api.completePickup('101', { expectedPersonalCustomerId: 'P000002' });
    assert('unpaid blocked', r.ok === false && (r.code === 'unpaid' || /入金|未入金|残/.test(r.error || '')));
    assert('unpaid no put', putLog.length === 0);
  }

  // 4. 一部入金防止
  reset();
  orders.set('102', makeOrder({
    $id: { value: '102' },
    manage_no: { value: 'TSP-P' },
  }));
  paymentsByPcm.set('P000002', [paidPayment(102, 1000)]);
  {
    const bal = E.getOrderBalance(orders.get('102'), paymentsByPcm.get('P000002'));
    assert('partial balance positive', bal.balance > 0 && bal.state === '一部入金');
    const r = await Api.completePickup('102', { expectedPersonalCustomerId: 'P000002' });
    assert('partial blocked', r.ok === false);
    assert('partial no put', putLog.length === 0);
  }

  // 5. 当日支払い後 → 完了（App97 精算後相当）
  reset();
  orders.set('103', makeOrder({ $id: { value: '103' }, manage_no: { value: 'TSP-S' } }));
  paymentsByPcm.set('P000002', [paidPayment(103, 3300)]);
  {
    const r = await Api.completePickup('103', { expectedPersonalCustomerId: 'P000002' });
    assert('same-day paid pickup ok', r.ok === true);
  }

  // 6. 店舗未到着防止
  reset();
  orders.set('104', makeOrder({
    $id: { value: '104' },
    location_status: { value: '工場' },
  }));
  paymentsByPcm.set('P000002', [paidPayment(104, 3300)]);
  {
    const r = await Api.completePickup('104', { expectedPersonalCustomerId: 'P000002' });
    assert('not at store blocked', r.ok === false && r.code === 'not_at_store');
  }

  // 7. 法人防止
  reset();
  orders.set('105', makeOrder({
    $id: { value: '105' },
    customer_code: { value: 'M032' },
  }));
  paymentsByPcm.set('P000002', [paidPayment(105, 3300)]);
  {
    const r = await Api.completePickup('105', { expectedPersonalCustomerId: 'P000002' });
    assert('corporate blocked', r.ok === false && r.code === 'not_store_customer');
  }

  // 8. PCM 混入防止
  reset();
  orders.set('106', makeOrder({ $id: { value: '106' } }));
  paymentsByPcm.set('P000002', [paidPayment(106, 3300)]);
  {
    const r = await Api.completePickup('106', { expectedPersonalCustomerId: 'P999999' });
    assert('pcm mismatch blocked', r.ok === false && r.code === 'pcm_mismatch');
  }

  // 9. 複数着（同一PCM）ゲート / cart
  {
    const cart = { items: [] };
    assert('multi first ok', P.canAddToPickupCart(cart, {
      personalCustomerId: 'P000002', manageNo: 'A', orderRecordId: '1',
    }).ok);
    cart.items.push({ personalCustomerId: 'P000002', manageNo: 'A', orderRecordId: '1' });
    assert('multi second same pcm ok', P.canAddToPickupCart(cart, {
      personalCustomerId: 'P000002', manageNo: 'B', orderRecordId: '2',
    }).ok);
    assert('multi other pcm blocked', P.canAddToPickupCart(cart, {
      personalCustomerId: 'P000003', manageNo: 'C', orderRecordId: '3',
    }).code === 'pcm_mismatch');
  }

  // 10. candidate display fields
  reset();
  orders.set('107', makeOrder({ $id: { value: '107' } }));
  paymentsByPcm.set('P000002', [paidPayment(107, 3300)]);
  {
    const loaded = await Api.loadPickupByBarcode('TSP1');
    // fetch by manage_no uses query — our mock returns empty for records GET on app16
    // so build candidate directly:
    const cand = Api.buildPickupCandidate(orders.get('107'), paymentsByPcm.get('P000002'));
    assert('candidate productName', cand.productName.indexOf('小紋') !== -1);
    assert('candidate kimonoType', cand.kimonoType === '小紋');
    assert('candidate itemNames', cand.itemNames.indexOf('丸洗い') !== -1);
    assert('candidate paymentState', cand.paymentState === '入金済');
    assert('candidate unpaidBalance 0', cand.unpaidBalance === 0);
    assert('candidate canComplete', cand.canComplete === true);
  }

  // barcode unpaid guides to App97
  {
    const unpaidCand = Api.buildPickupCandidate(makeOrder({
      $id: { value: '108' },
      delivery_status: { value: '引き取り待ち' },
    }), []);
    assert('unpaid guides App97', unpaidCand.guideToApp97 === true && unpaidCand.canComplete === false);
  }

  if (failed) {
    process.exit(1);
  }
  console.log('\nAll store pickup complete tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
