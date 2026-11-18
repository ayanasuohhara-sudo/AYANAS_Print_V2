'use strict';

/**
 * 本番反映後の追加検証（データ一括更新なし）
 * - 空欄→未入金扱い
 * - 3パターンのゲート／確認文
 * - PUT は delivery_status のみ
 * - App19 / App97 非破壊チェック
 * - 可能ならテスト用に一時 PUT した入金状況を元に戻す
 *
 *   node scripts/_a550_payment_status_prod_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const APP92 = 92;
const APP97 = 97;
const FIELD = 'store_payment_status';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(ROOT, 'docs/A550_PAYMENT_STATUS_PROD_VERIFY.json');

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (_) {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 300000);
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
  await send('Page.enable');
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    const v = s.result && s.result.value;
    if (v && v.hasK && !/login/i.test(v.url || '')) break;
  }
  return {
    send,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id, 'GET');
      } catch (_) {}
    },
  };
}

async function main() {
  const report = { stamp: STAMP, checks: {} };

  // App92 module + gate patterns
  const p92 = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  const gate = await p92.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      const Status = window.CAYANAS_StorePaymentStatus;
      const P = window.CAYANAS_StorePickup;
      const Api = window.CAYANAS_StorePickup_Api;
      const base = {
        customer_code: { value: 'A550' },
        process_status: { value: '完了' },
        location_status: { value: '店舗' },
        delivery_status: { value: '引き取り待ち' },
        delivery_no: { value: 'N-VERIFY' },
        personal_customer_id: { value: 'P000001' },
        manage_no: { value: 'VERIFY1' },
        store_payment_status: { value: '入金済み' },
        detail_table: { value: [] }
      };
      const patterns = {
        paid: P.evaluatePickupGate({ ...base, store_payment_status: { value: '入金済み' } }, { requirePaid: true }),
        unpaidNoConfirm: P.evaluatePickupGate({ ...base, store_payment_status: { value: '未入金' } }, { requirePaid: true }),
        unpaidWithConfirm: P.evaluatePickupGate({ ...base, store_payment_status: { value: '未入金' } }, { requirePaid: true, smaregiResidualConfirmed: true }),
        partialNoConfirm: P.evaluatePickupGate({ ...base, store_payment_status: { value: '一部入金' } }, { requirePaid: true }),
        partialWithConfirm: P.evaluatePickupGate({ ...base, store_payment_status: { value: '一部入金' } }, { requirePaid: true, smaregiResidualConfirmed: true }),
        emptyAsUnpaid: P.evaluatePickupGate({ ...base, store_payment_status: { value: '' } }, { requirePaid: true }),
        emptyWithConfirm: P.evaluatePickupGate({ ...base, store_payment_status: { value: '' } }, { requirePaid: true, smaregiResidualConfirmed: true }),
        adminException: P.evaluatePickupGate({ ...base, store_payment_status: { value: '一部入金' } }, { requirePaid: true, unpaidHandoverApproved: true }),
        corporate: P.evaluatePickupGate({ ...base, customer_code: { value: 'M070' }, store_payment_status: { value: '入金済み' } }, { requirePaid: true }),
      };
      const candUnpaid = Api.buildPickupCandidate({ ...base, $id: { value: '1' }, store_payment_status: { value: '未入金' } }, []);
      const candPaid = Api.buildPickupCandidate({ ...base, $id: { value: '2' }, store_payment_status: { value: '入金済み' } }, []);
      const batchMsg = Status.buildSmaregiConfirmMessage([
        { manageNo: 'A', paymentState: '未入金' },
        { manageNo: 'B', paymentState: '一部入金' }
      ]);
      return {
        statusVer: Status.VERSION,
        pickupVer: P.VERSION,
        smaregiMsg: Status.SMAREGI_CONFIRM_MESSAGE,
        putKeys: Object.keys(P.buildPickupPutRecord()),
        putValue: P.buildPickupPutRecord().delivery_status.value,
        patterns: Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, { ok: !!v.ok, code: v.code || null, alreadyDone: !!v.alreadyDone }])),
        candUnpaid: { canComplete: candUnpaid.canComplete, needsSmaregiConfirm: candUnpaid.needsSmaregiConfirm, paid: candUnpaid.paid },
        candPaid: { canComplete: candPaid.canComplete, needsSmaregiConfirm: candPaid.needsSmaregiConfirm, paid: candPaid.paid },
        batchMsg,
        batchListsTargets: /A（未入金）/.test(batchMsg) && /B（一部入金）/.test(batchMsg) && batchMsg.indexOf(Status.SMAREGI_CONFIRM_MESSAGE) >= 0
      };
    })()`,
  });
  await p92.close();
  report.checks.app92 = gate.result && gate.result.value;

  // App16 empty records + field + temporary 3-status roundtrip on ONE disposable test if found
  const p16 = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const live = await p16.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP16} });
      const field = fields.properties[${JSON.stringify(FIELD)}];
      const samples = (await api('/k/v1/records.json', 'GET', {
        app: ${APP16},
        query: 'customer_code = "A550" order by $id desc limit 8',
        fields: ['$id','$revision','manage_no','customer_code',${JSON.stringify(FIELD)},'process_status','location_status','work_status','delivery_status']
      })).records || [];
      const Status = window.CAYANAS_StorePaymentStatus;
      const emptyMapped = samples.map((r) => {
        const raw = (r[${JSON.stringify(FIELD)}] && r[${JSON.stringify(FIELD)}].value) || '';
        return {
          id: r.$id.value,
          manage_no: r.manage_no.value,
          raw,
          normalized: Status.normalizeStatus(raw),
          process: r.process_status.value,
          location: r.location_status.value,
          work: r.work_status.value,
          delivery: r.delivery_status.value
        };
      });

      // Round-trip status changes on the newest A550 record, restoring original afterward.
      // Never touch process/location/work/delivery.
      const target = samples[0];
      const id = target.$id.value;
      const original = (target[${JSON.stringify(FIELD)}] && target[${JSON.stringify(FIELD)}].value) || '';
      const axesBefore = {
        process: target.process_status.value,
        location: target.location_status.value,
        work: target.work_status.value,
        delivery: target.delivery_status.value,
        revision: target.$revision.value
      };
      const setStatus = async (value) => {
        const got = await api('/k/v1/record.json', 'GET', { app: ${APP16}, id });
        await api('/k/v1/record.json', 'PUT', {
          app: ${APP16},
          id,
          revision: got.record.$revision.value,
          record: { ${JSON.stringify(FIELD)}: { value } }
        });
        const after = await api('/k/v1/record.json', 'GET', { app: ${APP16}, id });
        return {
          status: after.record[${JSON.stringify(FIELD)}].value,
          process: after.record.process_status.value,
          location: after.record.location_status.value,
          work: after.record.work_status.value,
          delivery: after.record.delivery_status.value
        };
      };
      const results = {};
      for (const st of ['未入金', '一部入金', '入金済み']) {
        results[st] = await setStatus(st);
      }
      const restored = await setStatus(original);
      const axesIntact = Object.values(results).every((r) =>
        r.process === axesBefore.process
        && r.location === axesBefore.location
        && r.work === axesBefore.work
        && r.delivery === axesBefore.delivery
      ) && restored.process === axesBefore.process
        && restored.location === axesBefore.location
        && restored.work === axesBefore.work
        && restored.delivery === axesBefore.delivery;

      // corporate sample untouched read
      const corp = (await api('/k/v1/records.json', 'GET', {
        app: ${APP16},
        query: 'customer_code != "A550" order by $id desc limit 1',
        fields: ['$id','customer_code',${JSON.stringify(FIELD)},'delivery_status','location_status']
      })).records || [];

      const app97 = await api('/k/v1/records.json', 'GET', {
        app: ${APP97}, query: 'limit 1', totalCount: true, fields: ['$id']
      });
      const app19Js = ((await api('/k/v1/app/customize.json', 'GET', { app: ${APP19} })).desktop.js || [])
        .map((x) => x.file && x.file.name);

      return {
        fieldOptions: Object.keys(field.options || {}),
        defaultValue: field.defaultValue,
        emptyMapped,
        roundTrip: {
          id,
          manage_no: target.manage_no.value,
          original,
          results,
          restoredStatus: restored.status,
          axesBefore,
          axesIntact
        },
        corporateSample: corp[0] ? {
          id: corp[0].$id.value,
          customer_code: corp[0].customer_code.value,
          payment: (corp[0][${JSON.stringify(FIELD)}] && corp[0][${JSON.stringify(FIELD)}].value) || '',
          delivery: corp[0].delivery_status.value,
          location: corp[0].location_status.value
        } : null,
        app97Count: app97.totalCount,
        app19HasDeliverySync: app19Js.indexOf('delivery_complete_sync.js') >= 0,
        app19Js
      };
    })()`,
  });
  await p16.close();
  report.checks.app16 = live.result && live.result.value;

  const g = report.checks.app92 || {};
  const a = report.checks.app16 || {};
  const ok = !!(
    g.statusVer === '1.1.0'
    && g.pickupVer === '1.2.0'
    && g.smaregiMsg === 'スマレジで残金の支払いを確認しましたか？'
    && JSON.stringify(g.putKeys) === JSON.stringify(['delivery_status'])
    && g.putValue === '納品済'
    && g.patterns
    && g.patterns.paid.ok
    && !g.patterns.unpaidNoConfirm.ok
    && g.patterns.unpaidWithConfirm.ok
    && !g.patterns.partialNoConfirm.ok
    && g.patterns.partialWithConfirm.ok
    && !g.patterns.emptyAsUnpaid.ok
    && g.patterns.emptyWithConfirm.ok
    && g.patterns.adminException.ok
    && !g.patterns.corporate.ok
    && g.candUnpaid.canComplete && g.candUnpaid.needsSmaregiConfirm
    && g.candPaid.canComplete && !g.candPaid.needsSmaregiConfirm
    && g.batchListsTargets
    && a.fieldOptions
    && a.fieldOptions.indexOf('未入金') >= 0
    && a.roundTrip && a.roundTrip.axesIntact
    && a.roundTrip.results['未入金'].status === '未入金'
    && a.roundTrip.results['一部入金'].status === '一部入金'
    && a.roundTrip.results['入金済み'].status === '入金済み'
    && a.app19HasDeliverySync
    && a.app97Count != null
  );
  report.ok = ok;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(ok ? 'VERIFY_OK' : 'VERIFY_FAIL');
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
