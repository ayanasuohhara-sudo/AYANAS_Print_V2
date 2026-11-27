'use strict';

/**
 * App97 段階運用 — エラー監視・日次照合・実取引サマリ
 *
 * Usage:
 *   node scripts/_app97_stage_ops_monitor.js
 *   node scripts/_app97_stage_ops_monitor.js 2026-11-02
 *   SMAREGI_AMOUNT=12345 node scripts/_app97_stage_ops_monitor.js 2026-11-02
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/workspace';
const APP97 = 97;
const APP16 = 16;
const APP92 = 92;
const DAY = process.argv[2] || new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 10);
const SMAREGI = process.env.SMAREGI_AMOUNT || '';
const OUT_DIR = path.join(ROOT, 'docs');
const OUT = path.join(OUT_DIR, 'APP97_STAGE_OPS_MONITOR_' + DAY + '.json');

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (e) {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

function loadEngine() {
  global.window = global;
  global.kintone = {
    api: async () => ({ records: [] }),
    app: { getId: () => 97 },
    getLoginUser: () => ({ code: 'monitor' }),
  };
  global.kintone.api.url = (p) => p;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'customize/store_payment_config.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'customize/store_payment_engine.js'), 'utf8'));
  return {
    C: global.CAYANAS_StorePayment,
    E: global.CAYANAS_StorePayment_Engine,
  };
}

(async () => {
  const { C, E } = loadEngine();
  const list = await httpJson('/json/list');
  const page = (list || []).find(
    (t) => t.type === 'page'
      && /cybozu\.com\/k/.test(t.url || '')
      && !/login/.test(t.url || '')
      && !/web-worker/.test(t.url || '')
  );
  if (!page) throw new Error('no kintone tab');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 180000);
      const h = (raw) => {
        const m = JSON.parse(String(raw));
        if (m.id === i) {
          clearTimeout(t);
          ws.off('message', h);
          if (m.error) rej(new Error(JSON.stringify(m.error)));
          else res(m.result);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');

  const raw = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const day=${JSON.stringify(DAY)};
      const pays=await api('/k/v1/records.json','GET',{app:${APP97},query:'payment_date = \"'+day+'\" order by $id asc limit 500'});
      const allRecent=await api('/k/v1/records.json','GET',{app:${APP97},query:'order by $id desc limit 100'});
      const acl=await api('/k/v1/app/acl.json','GET',{app:${APP97}});
      const everyone=(acl.rights||[]).find(r=>r.entity&&r.entity.code==='everyone');
      return {
        dayPays: pays.records||[],
        recent: allRecent.records||[],
        everyoneView: !!(everyone&&everyone.recordViewable),
        everyoneAdd: !!(everyone&&everyone.recordAddable),
        rights:(acl.rights||[]).map(r=>({type:r.entity.type,code:r.entity.code,view:!!r.recordViewable,add:!!r.recordAddable,del:!!r.recordDeletable}))
      };
    })()`,
  });
  ws.close();

  const data = raw.result.value;
  const dayRecords = data.dayPays;
  const summary = E.summarizeDailyPayments(dayRecords);
  const compare = E.compareDailyReconcile(summary, SMAREGI === '' ? null : SMAREGI);

  const brief = (records) => (records || []).map((r) => ({
    id: r.$id.value,
    no: r.store_payment_no && r.store_payment_no.value,
    status: r.payment_status && r.payment_status.value,
    kind: r.record_kind && r.record_kind.value,
    amount: Number(r.payment_amount && r.payment_amount.value || 0),
    pcm: r.personal_customer_id && r.personal_customer_id.value,
    client: r.client_name_snapshot && r.client_name_snapshot.value,
    tx: r.transaction_id && r.transaction_id.value,
    cancelReason: r.cancel_reason && r.cancel_reason.value,
    isTest: /\[TEST\]/.test((r.client_name_snapshot && r.client_name_snapshot.value) || '')
      || /^P000002$/.test((r.personal_customer_id && r.personal_customer_id.value) || ''),
  }));

  const dayBrief = brief(dayRecords);
  const realDay = dayBrief.filter((x) => !x.isTest);
  const testDay = dayBrief.filter((x) => x.isTest);
  const cancelled = dayBrief.filter((x) => x.status === (C.PAYMENT_STATUS && C.PAYMENT_STATUS.cancelled) || x.status === '取消');
  const autoCancel = cancelled.filter((x) => /過剰充当|自動取消/.test(x.cancelReason || ''));

  // pickup consistency sample: for real valid payments, check linked orders if detail present
  const pickupIssues = [];
  for (const rec of dayRecords) {
    const client = (rec.client_name_snapshot && rec.client_name_snapshot.value) || '';
    if (/\[TEST\]/.test(client)) continue;
    if ((rec.payment_status && rec.payment_status.value) !== '有効') continue;
    if ((rec.record_kind && rec.record_kind.value) === '返金') continue;
    const table = rec.payment_detail && rec.payment_detail.value || [];
    for (const row of table) {
      const orderId = row.value && row.value.order_record_id && row.value.order_record_id.value;
      const manageNo = row.value && row.value.manage_no && row.value.manage_no.value;
      if (!orderId) continue;
      pickupIssues.push({ orderId, manageNo, paymentNo: rec.store_payment_no.value, needCheck: true });
    }
  }

  const report = {
    at: new Date().toISOString(),
    day: DAY,
    acl: {
      everyoneView: data.everyoneView,
      everyoneAdd: data.everyoneAdd,
      rights: data.rights,
      stage1Ok: data.everyoneView === false && data.everyoneAdd === false,
    },
    payments: {
      dayTotal: dayBrief.length,
      dayReal: realDay.length,
      dayTest: testDay.length,
      cancelled: cancelled.length,
      autoCancelExcess: autoCancel.length,
      rows: dayBrief,
    },
    reconcile: {
      smaregiAmountInput: SMAREGI === '' ? null : Number(SMAREGI),
      summary,
      compare,
      note: SMAREGI === ''
        ? 'SMAREGI_AMOUNT 未指定。画面の日次照合タブで手入力するか、環境変数で再実行'
        : (compare.matched ? '一致' : '差額あり — 対象処理を停止して原因確認'),
    },
    alerts: [],
    pickupCandidatesToVerify: pickupIssues.slice(0, 50),
  };

  if (!report.acl.stage1Ok) {
    report.alerts.push({ level: 'critical', msg: 'everyone が閲覧/追加可能 — 全スタッフ一斉公開状態' });
  }
  if (autoCancel.length) {
    report.alerts.push({ level: 'high', msg: '過剰充当の自動取消あり', count: autoCancel.length });
  }
  if (SMAREGI !== '' && compare && compare.matched === false) {
    report.alerts.push({ level: 'high', msg: '日次照合差額', diff: compare.diff });
  }
  if (realDay.length === 0) {
    report.alerts.push({ level: 'info', msg: '当日の実顧客入金はまだない（TESTのみまたは0件）' });
  }

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    day: DAY,
    real: realDay.length,
    test: testDay.length,
    cancelled: cancelled.length,
    alerts: report.alerts,
    reconcile: report.reconcile.note,
    out: OUT,
  }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
