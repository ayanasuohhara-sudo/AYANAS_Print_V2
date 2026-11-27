'use strict';

/**
 * App19 税抜合計 = SUM(unit_price) 疑いの確認 + N20261126-735 実データ
 * + App35 / InvoiceCreate.calculateSummary の amount 使用確認
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const DELIVERY_NO = process.env.DELIVERY_NO || 'N20261126-735';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(
  '/agent/repos/AYANAS_Print_V2/customize/backups',
  'app19_subtotal_probe_' + STAMP
);
fs.mkdirSync(WORK_DIR, { recursive: true });

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
  await send('Page.enable');
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href,login:!!document.querySelector('input[type=password]')})`,
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

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/19/`);
  try {
    const result = await evalJson(
      page,
      `(async () => {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const fields19 = await api('/k/v1/app/form/fields.json', 'GET', { app: 19 });
        const props = fields19.properties || {};
        const detail = props.delivery_detail && props.delivery_detail.fields
          ? props.delivery_detail.fields
          : {};

        const pickCalc = (f) => f ? ({
          code: f.code,
          label: f.label,
          type: f.type,
          expression: f.expression || null,
          format: f.format || null,
          displayScale: f.displayScale || null,
        }) : null;

        const calcFields = {
          subtotal: pickCalc(props.subtotal),
          tax: pickCalc(props.tax),
          total_amount: pickCalc(props.total_amount),
          amount: pickCalc(detail.amount),
          qty: detail.qty ? { code: detail.qty.code, type: detail.qty.type, label: detail.qty.label } : null,
          unit_price: detail.unit_price ? {
            code: detail.unit_price.code, type: detail.unit_price.type, label: detail.unit_price.label
          } : null,
        };

        // target delivery
        const recRes = await api('/k/v1/records.json', 'GET', {
          app: 19,
          query: 'delivery_no = "' + ${JSON.stringify(DELIVERY_NO)} + '" limit 1',
        });
        const rec = (recRes.records || [])[0] || null;
        let sample = null;
        if (rec) {
          const rows = ((rec.delivery_detail && rec.delivery_detail.value) || []).map((row) => {
            const v = row.value || {};
            const qty = Number(v.qty && v.qty.value || 0);
            const unit = Number(v.unit_price && v.unit_price.value || 0);
            const amount = Number(v.amount && v.amount.value || 0);
            return {
              manage_no: v.manage_no && v.manage_no.value,
              item_name: v.item_name && v.item_name.value,
              qty, unit_price: unit, amount,
              qtyTimesUnit: qty * unit,
              amountMatchesQtyUnit: amount === qty * unit
            };
          });
          const sumUnit = rows.reduce((s, r) => s + r.unit_price, 0);
          const sumAmount = rows.reduce((s, r) => s + r.amount, 0);
          const sumQtyUnit = rows.reduce((s, r) => s + r.qtyTimesUnit, 0);
          sample = {
            id: rec.$id.value,
            delivery_no: rec.delivery_no && rec.delivery_no.value,
            customer_code: rec.customer_code && rec.customer_code.value,
            customer_name: rec.customer_name && rec.customer_name.value,
            invoice_status: rec.invoice_status && rec.invoice_status.value,
            stored: {
              subtotal: rec.subtotal && rec.subtotal.value,
              tax: rec.tax && rec.tax.value,
              total_amount: rec.total_amount && rec.total_amount.value,
            },
            rows,
            computed: {
              sumUnitPrice: sumUnit,
              sumAmount,
              sumQtyTimesUnit: sumQtyUnit,
              storedEqualsSumUnit: Number(rec.subtotal && rec.subtotal.value) === sumUnit,
              storedEqualsSumAmount: Number(rec.subtotal && rec.subtotal.value) === sumAmount,
              expectedCorrectSubtotal: sumAmount,
            }
          };
        }

        // App35 fields
        const fields35 = await api('/k/v1/app/form/fields.json', 'GET', { app: 35 });
        const p35 = fields35.properties || {};
        const invDetail = p35.invoice_detail && p35.invoice_detail.fields
          ? p35.invoice_detail.fields : {};
        const calc35 = {
          subtotal: pickCalc(p35.subtotal),
          tax: pickCalc(p35.tax),
          total: pickCalc(p35.total),
          invoice_amount: pickCalc(p35.invoice_amount),
          amount: pickCalc(invDetail.amount),
          qty: invDetail.qty ? { code: invDetail.qty.code, type: invDetail.qty.type } : null,
          unit_price: invDetail.unit_price ? {
            code: invDetail.unit_price.code, type: invDetail.unit_price.type
          } : null,
        };

        // InvoiceCreate.calculateSummary source if available
        let invoiceCreate = null;
        if (typeof InvoiceCreate !== 'undefined') {
          invoiceCreate = {
            hasCalculateSummary: typeof InvoiceCreate.calculateSummary === 'function',
            hasBuildInvoiceDetails: typeof InvoiceCreate.buildInvoiceDetails === 'function',
            calculateSummarySrc: typeof InvoiceCreate.calculateSummary === 'function'
              ? String(InvoiceCreate.calculateSummary).slice(0, 2500)
              : null,
            buildInvoiceDetailsSrc: typeof InvoiceCreate.buildInvoiceDetails === 'function'
              ? String(InvoiceCreate.buildInvoiceDetails).slice(0, 2500)
              : null,
          };
        }

        // If sample has invoice, check linked invoice
        let linkedInvoice = null;
        if (sample && sample.delivery_no) {
          try {
            const inv = await api('/k/v1/records.json', 'GET', {
              app: 35,
              query: 'invoice_detail.delivery_no in ("' + sample.delivery_no + '") limit 5',
            });
            linkedInvoice = (inv.records || []).map((r) => ({
              id: r.$id.value,
              invoice_no: r.invoice_no && r.invoice_no.value,
              subtotal: r.subtotal && r.subtotal.value,
              tax: r.tax && r.tax.value,
              total: r.total && r.total.value,
              invoice_amount: r.invoice_amount && r.invoice_amount.value,
              detailAmounts: ((r.invoice_detail && r.invoice_detail.value) || [])
                .filter((row) => String(row.value.delivery_no && row.value.delivery_no.value) === sample.delivery_no)
                .map((row) => ({
                  qty: Number(row.value.qty && row.value.qty.value || 0),
                  unit_price: Number(row.value.unit_price && row.value.unit_price.value || 0),
                  amount: Number(row.value.amount && row.value.amount.value || 0),
                })),
            }));
          } catch (e) {
            linkedInvoice = { error: String(e && e.message || e) };
          }
        }

        return {
          calcFields,
          calc35,
          sample,
          linkedInvoice,
          invoiceCreate,
          bugConfirmed: calcFields.subtotal
            && /SUM\\s*\\(\\s*unit_price\\s*\\)/i.test(String(calcFields.subtotal.expression || '')),
          amountExprOk: calcFields.amount
            && /unit_price\\s*\\*\\s*qty|qty\\s*\\*\\s*unit_price/i.test(String(calcFields.amount.expression || '')),
        };
      })()`
    );

    fs.writeFileSync(path.join(WORK_DIR, 'probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({
      workDir: WORK_DIR,
      bugConfirmed: result.bugConfirmed,
      amountExprOk: result.amountExprOk,
      calcFields: result.calcFields,
      calc35: result.calc35,
      sample: result.sample,
      linkedInvoice: result.linkedInvoice,
      invoiceCreate: result.invoiceCreate && {
        hasCalculateSummary: result.invoiceCreate.hasCalculateSummary,
        srcHasAmount: result.invoiceCreate.calculateSummarySrc
          && result.invoiceCreate.calculateSummarySrc.indexOf('amount') >= 0,
        srcHasUnitPrice: result.invoiceCreate.calculateSummarySrc
          && /unit_price|unitPrice/.test(result.invoiceCreate.calculateSummarySrc),
        calculateSummarySrc: result.invoiceCreate.calculateSummarySrc,
        buildInvoiceDetailsSrc: result.invoiceCreate.buildInvoiceDetailsSrc,
      },
    }, null, 2));
  } finally {
    await page.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(e.message === 'NEED_LOGIN' ? 2 : 1);
});
