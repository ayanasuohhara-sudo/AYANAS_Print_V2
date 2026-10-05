/**
 * 業務ダッシュボード「今日」検算（kintone REST API）
 *
 * 環境変数:
 *   KINTONE_SUBDOMAIN=o5nppg7kb4ly
 *   KINTONE_API_TOKEN=（App16/19/13 GET 権限の API トークン）
 *
 * 実行: node scripts/business_dashboard_today_audit.mjs
 */

const SUBDOMAIN = process.env.KINTONE_SUBDOMAIN || 'o5nppg7kb4ly';
const TOKEN = process.env.KINTONE_API_TOKEN || '';

const ORDER_APP = 16;
const DELIVERY_APP = 19;
const PRODUCT_APP = 13;
const A550 = 'A550';

const todayJst = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function getRecords(app, query, fields) {
  const base = `https://${SUBDOMAIN}.cybozu.com/k/v1/records.json`;
  const all = [];
  let offset = 0;
  const limit = 500;

  while (true) {
    const q = `${query} limit ${limit} offset ${offset}`;
    const url = `${base}?app=${app}&query=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields.join(','))}`;
    const res = await fetch(url, {
      headers: { 'X-Cybozu-API-Token': TOKEN },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`App${app} GET failed ${res.status}: ${text}`);
    }

    const body = await res.json();
    all.push(...body.records);

    if (body.records.length < limit) {
      break;
    }

    offset += limit;
  }

  return all;
}

function fv(record, code) {
  const f = record?.[code];
  if (!f || f.value == null) return '';
  return f.value;
}

function isEmptyOrderRow(rv) {
  const code = String(rv?.item_code?.value ?? '').trim();
  const name = String(rv?.item_name?.value ?? '').trim();
  const amount = toNum(rv?.amount?.value);
  if (code === '' && name === '') return true;
  return name === '' && amount === 0;
}

function isEmptyDeliveryRow(rv) {
  const name = String(rv?.item_name?.value ?? '').trim();
  const amount = toNum(rv?.amount?.value);
  if (name === '') return amount === 0;
  return false;
}

function lineQty(raw) {
  const q = toNum(raw);
  return q > 0 ? q : 1;
}

function buildProductLookup(products) {
  const byCode = new Map();
  const byName = new Map();
  const subs = new Set();

  products.forEach((p) => {
    const code = String(fv(p, 'item_code')).trim();
    const name = String(fv(p, 'item_name')).trim();
    const sub = String(fv(p, 'subcategory')).trim();
    if (sub) subs.add(sub);
    if (code) byCode.set(code, sub);
    if (name && !byName.has(name)) byName.set(name, sub);
  });

  return { byCode, byName, subcategories: [...subs].sort() };
}

function resolveSub(itemCode, itemName, lookup) {
  const c = String(itemCode ?? '').trim();
  const n = String(itemName ?? '').trim();
  if (c && lookup.byCode.has(c)) return lookup.byCode.get(c) || '';
  if (n && lookup.byName.has(n)) return lookup.byName.get(n) || '';
  return '';
}

function emptyMetrics() {
  return {
    orderKimono: 0,
    orderPoints: 0,
    orderAmount: 0,
    deliveryKimono: 0,
    deliveryPoints: 0,
    deliveryAmount: 0,
  };
}

async function main() {
  if (!TOKEN) {
    console.error('KINTONE_API_TOKEN が未設定です。API トークンを設定して再実行してください。');
    process.exit(2);
  }

  const day = todayJst();
  const orderQuery = `order_date >= "${day}" and order_date <= "${day}" order by レコード番号 asc`;
  const deliveryQuery = `delivery_date >= "${day}" and delivery_date <= "${day}" order by レコード番号 asc`;

  const [orders, deliveries, products] = await Promise.all([
    getRecords(ORDER_APP, orderQuery, ['manage_no', 'order_date', 'customer_code', 'kimono_type', 'kimono_spec', 'detail_table', 'aggregation_status']),
    getRecords(DELIVERY_APP, deliveryQuery, ['delivery_date', 'customer_code', 'delivery_detail', 'aggregation_status']),
    getRecords(PRODUCT_APP, 'order by item_code asc', ['item_code', 'item_name', 'subcategory']),
  ]);

  const isActive = (record) => String(record?.aggregation_status?.value ?? '').trim() !== '取消';
  const activeOrders = orders.filter(isActive);
  const activeDeliveries = deliveries.filter(isActive);

  const lookup = buildProductLookup(products);
  const honsha = emptyMetrics();
  const ayanas = emptyMetrics();
  const orderKimonoHonsha = new Set();
  const orderKimonoAyanas = new Set();
  const deliveryKimonoHonsha = new Set();
  const deliveryKimonoAyanas = new Set();

  activeOrders.forEach((record) => {
    const code = String(fv(record, 'customer_code')).trim();
    const seg = code === A550 ? ayanas : honsha;
    const kimonoSet = code === A550 ? orderKimonoAyanas : orderKimonoHonsha;
    const manageNo = String(fv(record, 'manage_no')).trim();
    if (manageNo) kimonoSet.add(manageNo);

    (record.detail_table?.value ?? []).forEach((row) => {
      const rv = row.value ?? {};
      if (isEmptyOrderRow(rv)) return;
      seg.orderPoints += lineQty(rv.qty?.value);
      seg.orderAmount += toNum(rv.amount?.value);
    });
  });

  activeDeliveries.forEach((record) => {
    const code = String(fv(record, 'customer_code')).trim();
    const seg = code === A550 ? ayanas : honsha;
    const kimonoSet = code === A550 ? deliveryKimonoAyanas : deliveryKimonoHonsha;

    (record.delivery_detail?.value ?? []).forEach((row) => {
      const rv = row.value ?? {};
      if (isEmptyDeliveryRow(rv)) return;
      const manageNo = String(rv.manage_no?.value ?? '').trim();
      if (manageNo) kimonoSet.add(manageNo);
      seg.deliveryPoints += lineQty(rv.qty?.value);
      seg.deliveryAmount += toNum(rv.amount?.value);
    });
  });

  honsha.orderKimono = orderKimonoHonsha.size;
  ayanas.orderKimono = orderKimonoAyanas.size;
  honsha.deliveryKimono = deliveryKimonoHonsha.size;
  ayanas.deliveryKimono = deliveryKimonoAyanas.size;

  const samples = [...activeOrders]
    .sort((a, b) => (b.detail_table?.value?.length ?? 0) - (a.detail_table?.value?.length ?? 0))
    .slice(0, 3)
    .map((record) => {
      const lines = (record.detail_table?.value ?? [])
        .filter((row) => !isEmptyOrderRow(row.value ?? {}))
        .map((row) => {
          const rv = row.value ?? {};
          return {
            itemName: String(rv.item_name?.value ?? '').trim(),
            itemCode: String(rv.item_code?.value ?? '').trim(),
            qty: rv.qty?.value,
            amount: toNum(rv.amount?.value),
            subcategory: resolveSub(rv.item_code?.value, rv.item_name?.value, lookup) || '（未設定）',
          };
        });

      const points = lines.reduce((s, l) => s + lineQty(l.qty), 0);

      return {
        manageNo: String(fv(record, 'manage_no')).trim(),
        kimonoType: String(fv(record, 'kimono_type')).trim(),
        kimonoSpec: String(fv(record, 'kimono_spec')).trim(),
        orderKimono: 1,
        processingPoints: points,
        lines,
      };
    });

  const report = {
    dateJst: day,
    orderRecordCount: activeOrders.length,
    deliveryRecordCount: activeDeliveries.length,
    honsha,
    ayanas,
    total: {
      orderKimono: honsha.orderKimono + ayanas.orderKimono,
      orderPoints: honsha.orderPoints + ayanas.orderPoints,
      orderAmount: honsha.orderAmount + ayanas.orderAmount,
      deliveryKimono: honsha.deliveryKimono + ayanas.deliveryKimono,
      deliveryPoints: honsha.deliveryPoints + ayanas.deliveryPoints,
      deliveryAmount: honsha.deliveryAmount + ayanas.deliveryAmount,
    },
    productSubcategories: lookup.subcategories,
    manageNoSamples: samples,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
