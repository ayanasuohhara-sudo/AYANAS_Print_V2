'use strict';

/**
 * App19 税抜合計 CALC 修正
 *   誤: SUM(unit_price)
 *   正: SUM(amount)   // amount = unit_price * qty
 *
 * あわせて N20261126-735 を再計算確認し、請求側（InvoiceCreate）もソース確認。
 *
 *   CDP_PORT=9399 node scripts/_app19_subtotal_sum_amount_fix.js
 *   DRY_RUN=1 ...  （式確認のみ）
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const APP19 = 19;
const APP35 = 35;
const DELIVERY_NO = process.env.DELIVERY_NO || 'N20261126-735';
const DRY_RUN = process.env.DRY_RUN === '1';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app19_subtotal_fix_' + STAMP);
const ARTIFACTS = '/opt/cursor/artifacts';

fs.mkdirSync(WORK_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS, { recursive: true });

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed ' + JSON.stringify(page));
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
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression:
        "({hasK:typeof kintone!=='undefined',url:location.href,login:!!document.querySelector('input[type=password]')})",
    });
    const v = s.result && s.result.value;
    if (v && v.login) throw new Error('NEED_LOGIN');
    if (v && v.hasK && !/login/i.test(v.url || '')) break;
  }
  return {
    send,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id);
      } catch (_) {}
    },
  };
}

async function evalJson(page, expression) {
  const r = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result && r.result.value;
}

function analyzeDelivery(rec) {
  if (!rec) return null;
  const rows = ((rec.delivery_detail && rec.delivery_detail.value) || []).map((row) => {
    const v = row.value || {};
    const qty = Number((v.qty && v.qty.value) || 0);
    const unit = Number((v.unit_price && v.unit_price.value) || 0);
    const amount = Number((v.amount && v.amount.value) || 0);
    return {
      manage_no: v.manage_no && v.manage_no.value,
      qty,
      unit_price: unit,
      amount,
      qtyTimesUnit: qty * unit,
    };
  });
  const sumUnit = rows.reduce((s, r) => s + r.unit_price, 0);
  const sumAmount = rows.reduce((s, r) => s + r.amount, 0);
  const subtotal = Number(rec.subtotal && rec.subtotal.value);
  return {
    id: rec.$id.value,
    delivery_no: rec.delivery_no && rec.delivery_no.value,
    invoice_status: rec.invoice_status && rec.invoice_status.value,
    stored: {
      subtotal: rec.subtotal && rec.subtotal.value,
      tax: rec.tax && rec.tax.value,
      total_amount: rec.total_amount && rec.total_amount.value,
    },
    rows,
    sumUnitPrice: sumUnit,
    sumAmount,
    storedEqualsSumUnit: subtotal === sumUnit,
    storedEqualsSumAmount: subtotal === sumAmount,
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
  try {
    console.log('1) inspect formulas + sample...');
    const before = await evalJson(
      page,
      `(async () => {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP19} });
        const props = fields.properties || {};
        const detail = (props.delivery_detail && props.delivery_detail.fields) || {};
        const pick = (f) => f ? ({
          type: f.type, label: f.label, expression: f.expression || null, format: f.format || null
        }) : null;

        const formulas = {
          subtotal: pick(props.subtotal),
          tax: pick(props.tax),
          total_amount: pick(props.total_amount),
          amount: pick(detail.amount),
          qty: detail.qty && { type: detail.qty.type },
          unit_price: detail.unit_price && { type: detail.unit_price.type },
        };

        const recRes = await api('/k/v1/records.json', 'GET', {
          app: ${APP19},
          query: 'delivery_no = "' + ${JSON.stringify(DELIVERY_NO)} + '" limit 1',
        });
        const rec = (recRes.records || [])[0] || null;

        // App35
        const f35 = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP35} });
        const p35 = f35.properties || {};
        const idet = (p35.invoice_detail && p35.invoice_detail.fields) || {};
        const formulas35 = {
          subtotal: pick(p35.subtotal),
          tax: pick(p35.tax),
          total: pick(p35.total),
          amount: pick(idet.amount),
          qty: idet.qty && { type: idet.qty.type },
          unit_price: idet.unit_price && { type: idet.unit_price.type },
        };

        let invoiceCreateSrc = null;
        if (typeof InvoiceCreate !== 'undefined' && typeof InvoiceCreate.calculateSummary === 'function') {
          invoiceCreateSrc = String(InvoiceCreate.calculateSummary);
        }

        return { revision: fields.revision, formulas, formulas35, record: rec, invoiceCreateSrc };
      })()`
    );

    fs.writeFileSync(path.join(WORK_DIR, 'before_fields.json'), JSON.stringify({
      revision: before.revision,
      formulas: before.formulas,
      formulas35: before.formulas35,
    }, null, 2));
    if (before.invoiceCreateSrc) {
      fs.writeFileSync(path.join(WORK_DIR, 'InvoiceCreate.calculateSummary.js'), before.invoiceCreateSrc);
    }

    const sampleBefore = analyzeDelivery(before.record);
    fs.writeFileSync(path.join(WORK_DIR, 'sample_before.json'), JSON.stringify(sampleBefore, null, 2));
    console.log(JSON.stringify({
      formulas: before.formulas,
      formulas35: before.formulas35,
      sampleBefore,
      invoiceCreateUsesAmount: before.invoiceCreateSrc
        ? /\\.amount|\\['\"]amount['\"]|detail\\.amount|item\\.amount/.test(before.invoiceCreateSrc)
        : null,
      invoiceCreateUsesUnitPriceSum: before.invoiceCreateSrc
        ? /SUM.*unit_price|unit_price/.test(before.invoiceCreateSrc) && !/amount/.test(before.invoiceCreateSrc)
        : null,
      dryRun: DRY_RUN,
    }, null, 2));

    const expr = String((before.formulas.subtotal && before.formulas.subtotal.expression) || '');
    const amountExpr = String((before.formulas.amount && before.formulas.amount.expression) || '');
    const isSumUnit = /SUM\s*\(\s*unit_price\s*\)/i.test(expr);
    const isSumAmount = /SUM\s*\(\s*amount\s*\)/i.test(expr);
    if (!isSumUnit && !isSumAmount) {
      throw new Error('unexpected subtotal expression: ' + expr);
    }
    if (!/unit_price\s*\*\s*qty|qty\s*\*\s*unit_price/i.test(amountExpr)) {
      console.warn('WARN amount expression unexpected:', amountExpr);
    }

    if (isSumAmount) {
      console.log('subtotal already SUM(amount); skip formula change');
    } else if (DRY_RUN) {
      console.log('DRY_RUN: would change subtotal to SUM(amount)');
    } else {
      console.log('2) PUT preview form fields subtotal=SUM(amount)...');
      const deployed = await evalJson(
        page,
        `(async () => {
          const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
          const current = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP19} });
          const sub = current.properties.subtotal;
          if (!sub || sub.type !== 'CALC') throw new Error('subtotal not CALC');
          const beforeExpr = sub.expression;
          await api('/k/v1/preview/app/form/fields.json', 'PUT', {
            app: ${APP19},
            properties: {
              subtotal: {
                type: 'CALC',
                code: 'subtotal',
                label: sub.label || '税抜合計',
                expression: 'SUM(amount)',
                format: sub.format || 'NUMBER',
                displayScale: sub.displayScale || '0',
                hideExpression: !!sub.hideExpression,
              }
            }
          });
          await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: ${APP19} }] });
          let status = 'PROCESSING';
          let last = null;
          for (let i = 0; i < 60; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [${APP19}] });
            last = (st.apps || [])[0];
            status = last && last.status;
            if (status === 'SUCCESS') break;
            if (status === 'FAIL' || status === 'CANCEL') {
              throw new Error('deploy failed ' + JSON.stringify(last));
            }
          }
          if (status !== 'SUCCESS') throw new Error('deploy timeout ' + status);
          const after = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP19} });
          return {
            beforeExpr,
            afterExpr: after.properties.subtotal && after.properties.subtotal.expression,
            revision: after.revision,
            status,
          };
        })()`
      );
      fs.writeFileSync(path.join(WORK_DIR, 'deploy_result.json'), JSON.stringify(deployed, null, 2));
      console.log('deployed', deployed);

      // Recalc sample: kintone CALC on existing records updates on edit/save.
      // Force recalc by PUT-ting the record without meaningful change (touch).
      if (sampleBefore && sampleBefore.id) {
        console.log('3) touch record to recalc CALC...', sampleBefore.id);
        const touched = await evalJson(
          page,
          `(async () => {
            const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
            const id = ${JSON.stringify(sampleBefore.id)};
            // Fetch full record, PUT same delivery_date to trigger recalc
            const got = await api('/k/v1/record.json', 'GET', { app: ${APP19}, id });
            const rec = got.record;
            const deliveryDate = rec.delivery_date && rec.delivery_date.value;
            await api('/k/v1/record.json', 'PUT', {
              app: ${APP19},
              id,
              record: {
                delivery_date: { value: deliveryDate }
              }
            });
            const after = await api('/k/v1/record.json', 'GET', { app: ${APP19}, id });
            return after.record;
          })()`
        );
        const sampleAfter = analyzeDelivery(touched);
        fs.writeFileSync(path.join(WORK_DIR, 'sample_after.json'), JSON.stringify(sampleAfter, null, 2));
        console.log('sampleAfter', sampleAfter);
        if (!sampleAfter.storedEqualsSumAmount) {
          throw new Error('sample subtotal still not equal to SUM(amount)');
        }
      }
    }

    // Final formula check
    const afterFields = await evalJson(
      page,
      `(async () => {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP19} });
        return {
          revision: fields.revision,
          subtotal: fields.properties.subtotal && fields.properties.subtotal.expression,
          tax: fields.properties.tax && fields.properties.tax.expression,
          total_amount: fields.properties.total_amount && fields.properties.total_amount.expression,
          amount: fields.properties.delivery_detail
            && fields.properties.delivery_detail.fields
            && fields.properties.delivery_detail.fields.amount
            && fields.properties.delivery_detail.fields.amount.expression,
        };
      })()`
    );

    const report = {
      stamp: STAMP,
      workDir: WORK_DIR,
      dryRun: DRY_RUN,
      before: before.formulas,
      afterFields,
      sampleBefore,
      invoice: {
        formulas35: before.formulas35,
        calculateSummarySrcLen: before.invoiceCreateSrc ? before.invoiceCreateSrc.length : 0,
        calculateSummaryUsesAmount: before.invoiceCreateSrc
          ? before.invoiceCreateSrc.indexOf('amount') >= 0
          : null,
      },
      ok: /SUM\s*\(\s*amount\s*\)/i.test(String(afterFields.subtotal || '')),
    };
    fs.writeFileSync(path.join(WORK_DIR, 'REPORT.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(ARTIFACTS, 'app19_subtotal_fix_report.json'), JSON.stringify(report, null, 2));
    console.log('DONE', JSON.stringify(report, null, 2));
    if (!report.ok && !DRY_RUN) process.exit(1);
  } finally {
    await page.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(e.message === 'NEED_LOGIN' ? 2 : 1);
});
