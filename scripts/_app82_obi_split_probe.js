'use strict';

/**
 * 帯仕立 vs 国内着物仕立 分離カウント（本番読取のみ）
 *   node scripts/_app82_obi_split_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const OUT = path.join(
  __dirname,
  '../customize/backups/app82_monthly_deploy_2026-11-16T06-21-02/obi_probe.json'
);

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => {
      try { resolve(JSON.parse(d || 'null')); } catch (_) { resolve(d); }
    });
  });
  req.on('error', reject);
  req.end();
});

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 600000);
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
      expression: "({hasK:typeof kintone!=='undefined',url:location.href})",
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/i.test(s.result.value.url || '')) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const ready = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: 'typeof window.CAYANAS_BusinessDashboardMonthly==="object" && !!document.getElementById("ayanas-business-dashboard-root")',
    });
    if (ready.result && ready.result.value) break;
  }

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const M = window.CAYANAS_BusinessDashboardMonthly;
        const C = window.CAYANAS_BUSINESS_DASHBOARD;
        if (!M || !C) return { ok: false, error: 'missing globals', hasM: !!M, hasC: !!C };
        const asOf = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
        const report = await M.buildMonthlyReport({
          fiscalStartYear: 2026,
          route: 'all',
          asOfDate: asOf,
        });

        const of = C.FIELDS.order;
        const pf = C.FIELDS.product;
        const orderApp = C.ORDER_APP_ID;
        const productApp = C.PRODUCT_APP_ID;

        async function fetchAll(appId, query, fields) {
          const out = [];
          let offset = 0;
          for (;;) {
            const body = { app: appId, query: query + ' limit 500 offset ' + offset };
            if (fields && fields.length) body.fields = fields;
            const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body);
            const recs = resp.records || [];
            out.push.apply(out, recs);
            if (recs.length < 500) break;
            offset += 500;
            if (offset > 40000) break;
          }
          return out;
        }

        const products = await fetchAll(
          productApp,
          'order by ' + pf.itemCode + ' asc',
          [pf.itemCode, pf.itemName, pf.subcategory]
        );
        const byCode = new Map();
        const byName = new Map();
        products.forEach((r) => {
          const code = String((r[pf.itemCode] && r[pf.itemCode].value) || '').trim();
          const name = String((r[pf.itemName] && r[pf.itemName].value) || '').trim();
          const sub = String((r[pf.subcategory] && r[pf.subcategory].value) || '').trim();
          if (code) byCode.set(code, sub);
          if (name && !byName.has(name)) byName.set(name, sub);
        });
        const resolve = (code, name) => {
          code = String(code || '').trim();
          name = String(name || '').trim();
          if (code && byCode.has(code)) return byCode.get(code) || '';
          if (name && byName.has(name)) return byName.get(name) || '';
          return '';
        };

        const start = report.fiscal.startDate;
        const end = report.fiscal.endDate;
        const q = 'order_date >= "' + start + '" and order_date <= "' + end
          + '" and aggregation_status not in ("取消") order by order_date asc, $id asc';
        const orders = await fetchAll(orderApp, q, [
          of.manageNo, of.orderDate, of.detailTable, of.itemCode, of.itemName, of.aggregationStatus,
        ]);

        const byManage = new Map();
        orders.forEach((rec) => {
          const mn = String((rec[of.manageNo] && rec[of.manageNo].value) || '').trim();
          if (!mn) return;
          if (!byManage.has(mn)) {
            byManage.set(mn, {
              orderDate: (rec[of.orderDate] && rec[of.orderDate].value) || '',
              hasDom: false,
              hasObi: false,
              hasOver: false,
              cats: [],
            });
          }
          const e = byManage.get(mn);
          const table = rec[of.detailTable];
          const rows = Array.isArray(table && table.value) ? table.value : [];
          rows.forEach((row) => {
            const v = row.value || {};
            const code = v[of.itemCode] && v[of.itemCode].value;
            const name = v[of.itemName] && v[of.itemName].value;
            const sub = resolve(code, name);
            if (!sub) return;
            e.cats.push(sub);
            if (sub === '国内仕立') e.hasDom = true;
            if (sub === '帯仕立') e.hasObi = true;
            if (sub === '海外仕立') e.hasOver = true;
          });
        });

        const monthKeys = (report.fiscal.months || []).map((m) => m.key);
        const byMonth = {};
        monthKeys.forEach((k) => {
          byMonth[k] = {
            domesticKimonoOnly: 0,
            obiOnly: 0,
            domesticAndObi: 0,
            overseas: 0,
            domesticInclObi: 0,
            withObiLine: 0,
          };
        });
        const totals = {
          domesticKimonoOnly: 0,
          obiOnly: 0,
          domesticAndObi: 0,
          overseas: 0,
          domesticInclObi: 0,
          withObiLine: 0,
          tailorTotal: 0,
          manageNos: byManage.size,
        };

        byManage.forEach((e) => {
          const key = String(e.orderDate || '').slice(0, 7);
          if (!byMonth[key]) return;
          const route = M.classifyKimonoRoute(e.cats);
          if (route === 'overseas') {
            byMonth[key].overseas += 1;
            totals.overseas += 1;
            totals.tailorTotal += 1;
          } else if (route === 'domestic') {
            byMonth[key].domesticInclObi += 1;
            totals.domesticInclObi += 1;
            totals.tailorTotal += 1;
            if (e.hasObi) {
              byMonth[key].withObiLine += 1;
              totals.withObiLine += 1;
            }
            if (e.hasDom && e.hasObi) {
              byMonth[key].domesticAndObi += 1;
              totals.domesticAndObi += 1;
            } else if (e.hasObi && !e.hasDom) {
              byMonth[key].obiOnly += 1;
              totals.obiOnly += 1;
            } else if (e.hasDom && !e.hasObi) {
              byMonth[key].domesticKimonoOnly += 1;
              totals.domesticKimonoOnly += 1;
            }
          }
        });

        // filter checks
        const overseas = await M.buildMonthlyReport({
          fiscalStartYear: 2026, route: 'overseas', asOfDate: asOf,
        });
        const cust = (report.customerOptions || []).find((c) => c.code && c.code !== 'ALL');
        let customerFilter = null;
        if (cust) {
          const cr = await M.buildMonthlyReport({
            fiscalStartYear: 2026, route: 'all', customerCode: cust.code, asOfDate: asOf,
          });
          customerFilter = {
            code: cust.code,
            name: cust.name,
            yearTotal: cr.yearTotalKimono,
          };
        }

        return {
          ok: true,
          dataStartDate: report.dataStartDate,
          fiscalLabel: report.fiscal.label,
          yearTotalKimono: report.yearTotalKimono,
          series: (report.series || []).map((r) => ({
            key: r.key,
            status: r.status,
            overseas: r.overseasKimono,
            domestic: r.domesticKimono,
            total: r.tailorKimono,
          })),
          selected: report.selectedMonth && {
            key: report.selectedMonth.key,
            overseas: report.selectedMonth.overseasKimono,
            domestic: report.selectedMonth.domesticKimono,
            total: report.selectedMonth.tailorKimono,
            orderTotal: report.selectedMonth.orderTotal,
            tailorAmount: report.selectedMonth.tailorAmount,
            addonAmount: report.selectedMonth.addonAmount,
            amountSeparable: report.selectedMonth.amountSeparable,
            inseparableCount: report.selectedMonth.inseparableCount,
          },
          backlog: report.backlog && report.backlog.openKimono,
          matrixRows: (report.customerMonthMatrix || []).length,
          overseasYearTotal: overseas.yearTotalKimono,
          customerFilter,
          obiSplit: { byMonth, totals },
          canSeparateInUI: false,
          canSeparateInData: true,
          note: 'エンジンは帯仕立を国内仕立に合算。App13サブカテゴリで国内着物仕立と帯仕立はデータ上分離可能。UIは未分離。',
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e), stack: String(e && e.stack || '') };
      }
    })()`,
  });

  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(OUT, JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
  if (!value || !value.ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
