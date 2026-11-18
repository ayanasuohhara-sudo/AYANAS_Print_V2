'use strict';

/**
 * App82 月次 — M032 仕立て集計が少ない件の調査（読取のみ）
 *   node scripts/_app82_m032_tailor_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app82_m032_probe_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const CODE = 'M032';

// load local engines for offline classify parity
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'customize/business_dashboard_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'customize/business_dashboard_monthly_engine.js'), 'utf8'));
const Monthly = global.CAYANAS_BusinessDashboardMonthly;
const CFG = global.CAYANAS_BUSINESS_DASHBOARD;

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
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
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

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2000));

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const CODE = ${JSON.stringify(CODE)};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);

      async function fetchAll(app, query, fields) {
        const out = [];
        let offset = 0;
        while (true) {
          const body = {
            app,
            query: query + ' limit 500 offset ' + offset,
            totalCount: true,
            fields
          };
          const res = await api('/k/v1/records.json', 'GET', body);
          out.push(...(res.records || []));
          const total = Number(res.totalCount || 0);
          if (out.length >= total || !(res.records || []).length) break;
          offset += 500;
          if (offset > 200000) break;
        }
        return out;
      }

      // App8 得意先名
      let customer = null;
      try {
        const c8 = await fetchAll(8, 'customer_code = "' + CODE + '"', ['customer_code', 'customer_name']);
        customer = c8[0] ? {
          code: c8[0].customer_code.value,
          name: c8[0].customer_name && c8[0].customer_name.value
        } : null;
      } catch (e) {
        customer = { error: e.message || String(e) };
      }

      // App16 全件（コード一致）。集計状態・取消も含む
      const orders = await fetchAll(
        16,
        'customer_code = "' + CODE + '" order by order_date asc',
        [
          '$id', 'manage_no', 'order_date', 'customer_code', 'customer_name',
          'kimono_type', 'kimono_spec', 'aggregation_status', 'detail_table',
          'process_status', 'delivery_status'
        ]
      );

      // App13 価格マスタ（中分類）
      const products = await fetchAll(13, 'order by レコード番号 asc', [
        'item_code', 'item_name', 'subcategory'
      ]);

      const aliases = (window.CAYANAS_BUSINESS_DASHBOARD
        && window.CAYANAS_BUSINESS_DASHBOARD.MONTHLY
        && window.CAYANAS_BUSINESS_DASHBOARD.MONTHLY.SUBCATEGORY_ALIASES) || {};
      const norm = (v) => {
        const s = String(v || '').trim();
        return aliases[s] || s;
      };
      const byCode = new Map();
      const byName = new Map();
      products.forEach((r) => {
        const code = String((r.item_code && r.item_code.value) || '').trim();
        const name = String((r.item_name && r.item_name.value) || '').trim();
        const sub = norm((r.subcategory && r.subcategory.value) || '');
        if (code) byCode.set(code, sub);
        if (name && !byName.has(name)) byName.set(name, sub);
      });
      const resolveSub = (code, name) => {
        const c = String(code || '').trim();
        const n = String(name || '').trim();
        if (c && byCode.has(c)) return byCode.get(c) || '';
        if (n && byName.has(n)) return byName.get(n) || '';
        return '';
      };

      const TAILOR = ['海外仕立', '国内仕立', '帯仕立'];
      const DATA_START = (window.CAYANAS_BUSINESS_DASHBOARD
        && window.CAYANAS_BUSINESS_DASHBOARD.MONTHLY
        && window.CAYANAS_BUSINESS_DASHBOARD.MONTHLY.DATA_START_DATE) || '2026-03-24';
      const FY_START = '2025-08-01';
      const FY_END = '2026-07-31';

      const classify = (subs) => {
        const set = new Set(subs.map(norm).filter(Boolean));
        const found = [];
        if (set.has('海外仕立')) found.push('overseas');
        if (set.has('国内仕立')) found.push('domestic');
        if (set.has('帯仕立')) found.push('obi');
        if (!found.length) return { route: 'other', found };
        if (found.length === 1) return { route: found[0], found };
        return { route: 'conflict', found };
      };

      const analyzed = orders.map((rec) => {
        const table = rec.detail_table && rec.detail_table.value || [];
        const lines = [];
        const subs = [];
        let unresolved = 0;
        let tailorAmt = 0;
        let orderTotal = 0;
        table.forEach((row) => {
          const v = row.value || {};
          const itemCode = v.item_code && v.item_code.value;
          const itemName = v.item_name && v.item_name.value;
          if (!String(itemCode || '').trim() && !String(itemName || '').trim()) return;
          const amount = Number(v.amount && v.amount.value) || 0;
          orderTotal += amount;
          const sub = resolveSub(itemCode, itemName);
          lines.push({
            itemCode: String(itemCode || ''),
            itemName: String(itemName || ''),
            amount,
            subcategory: sub || '(未解決)'
          });
          if (!sub) {
            unresolved += 1;
            return;
          }
          subs.push(sub);
          if (TAILOR.indexOf(sub) >= 0) tailorAmt += amount;
        });
        const cl = classify(subs);
        const orderDate = String(rec.order_date && rec.order_date.value || '').slice(0, 10);
        const agg = String(rec.aggregation_status && rec.aggregation_status.value || '').trim();
        const cancelled = agg === '取消';
        const inFy = orderDate >= FY_START && orderDate <= FY_END;
        const afterDataStart = orderDate >= DATA_START;
        const isTailor = cl.route === 'overseas' || cl.route === 'domestic' || cl.route === 'obi';
        return {
          id: rec.$id.value,
          manageNo: rec.manage_no && rec.manage_no.value,
          orderDate,
          customerName: rec.customer_name && rec.customer_name.value,
          kimonoType: rec.kimono_type && rec.kimono_type.value,
          aggregationStatus: agg || '(空)',
          cancelled,
          route: cl.route,
          tailorCategories: cl.found,
          isTailor,
          inFy,
          afterDataStart,
          countedInDashboard: !cancelled && isTailor && inFy && afterDataStart,
          orderTotal,
          tailorAmt,
          unresolvedLines: unresolved,
          lineSubs: Array.from(new Set(lines.map((l) => l.subcategory))),
          lines
        };
      });

      const count = (pred) => analyzed.filter(pred).length;
      const byRoute = {};
      analyzed.forEach((o) => {
        byRoute[o.route] = (byRoute[o.route] || 0) + 1;
      });
      const byMonth = {};
      analyzed.filter((o) => o.countedInDashboard).forEach((o) => {
        const ym = o.orderDate.slice(0, 7);
        byMonth[ym] = (byMonth[ym] || 0) + 1;
      });

      // 仕立てっぽいが other になった理由（品名の中分類）
      const otherWithTailorishName = analyzed.filter((o) => o.route === 'other').map((o) => ({
        manageNo: o.manageNo,
        orderDate: o.orderDate,
        kimonoType: o.kimonoType,
        aggregationStatus: o.aggregationStatus,
        lineSubs: o.lineSubs,
        lines: o.lines.map((l) => l.itemName + '=>' + l.subcategory)
      }));

      // エンジン本番と同じ buildMonthlyReport があれば照合
      let engineCustomer = null;
      let engineMeta = null;
      try {
        if (window.CAYANAS_BusinessDashboardMonthly && window.CAYANAS_BusinessDashboardMonthly.buildReport) {
          // some builds use different export names — try analyze path via public API
        }
        const Monthly = window.CAYANAS_BusinessDashboardMonthly;
        engineMeta = {
          version: Monthly && Monthly.VERSION,
          keys: Monthly ? Object.keys(Monthly) : []
        };
        if (Monthly && typeof Monthly.buildFiscalReport === 'function') {
          const rep = await Monthly.buildFiscalReport({ fiscalStartYear: 2025 });
          const cust = ((rep && rep.customers) || []).find((c) => c.customerCode === CODE)
            || ((rep && rep.customerRanking) || []).find((c) => c.customerCode === CODE);
          engineCustomer = cust || null;
          if (!cust && rep) {
            engineCustomer = {
              searched: true,
              rankingSample: ((rep.customerRanking || rep.customers || []).slice(0, 5)),
              selectedTailor: rep.selectedMetrics && rep.selectedMetrics.tailorKimono,
              yearTailor: rep.yearTotals && rep.yearTotals.tailorKimono
            };
          }
        } else if (Monthly && typeof Monthly.buildReport === 'function') {
          const rep = await Monthly.buildReport({ fiscalStartYear: 2025 });
          const list = rep.customerRanking || rep.customers || [];
          engineCustomer = list.find((c) => c.customerCode === CODE) || {
            searched: true,
            listLen: list.length,
            top: list.slice(0, 8).map((c) => ({
              code: c.customerCode, name: c.customerName, tailor: c.tailorKimono
            }))
          };
        }
      } catch (e) {
        engineMeta = { error: e.message || String(e) };
      }

      // App8 別名コードのゆれ（M32 / ｍ032 等）は別クエリ
      const variants = {};
      for (const q of [
        'customer_code = "M32"',
        'customer_code like "M032%"',
        'customer_name like "M032%"'
      ]) {
        try {
          const rows = await api('/k/v1/records.json', 'GET', {
            app: 16,
            query: q + ' limit 20',
            fields: ['manage_no', 'customer_code', 'customer_name', 'order_date'],
            totalCount: true
          });
          variants[q] = {
            total: Number(rows.totalCount || 0),
            sample: (rows.records || []).slice(0, 5).map((r) => ({
              manageNo: r.manage_no.value,
              code: r.customer_code.value,
              name: r.customer_name && r.customer_name.value,
              date: r.order_date && r.order_date.value
            }))
          };
        } catch (e) {
          variants[q] = { error: e.message || String(e) };
        }
      }

      return {
        ok: true,
        customer,
        dataStart: DATA_START,
        fy: { start: FY_START, end: FY_END },
        productCount: products.length,
        orderCount: orders.length,
        summary: {
          total: analyzed.length,
          cancelled: count((o) => o.cancelled),
          beforeDataStart: count((o) => !o.afterDataStart),
          outsideFy: count((o) => !o.inFy),
          tailorRoutes: count((o) => o.isTailor),
          countedInDashboard: count((o) => o.countedInDashboard),
          other: count((o) => o.route === 'other'),
          conflict: count((o) => o.route === 'conflict'),
          byRoute,
          byMonth
        },
        otherSamples: otherWithTailorishName.slice(0, 40),
        countedSamples: analyzed.filter((o) => o.countedInDashboard).slice(0, 30).map((o) => ({
          manageNo: o.manageNo,
          orderDate: o.orderDate,
          route: o.route,
          kimonoType: o.kimonoType,
          lineSubs: o.lineSubs
        })),
        excludedSamples: {
          cancelled: analyzed.filter((o) => o.cancelled).slice(0, 15).map((o) => ({
            manageNo: o.manageNo, orderDate: o.orderDate, route: o.route
          })),
          beforeData: analyzed.filter((o) => !o.afterDataStart && o.isTailor).slice(0, 15).map((o) => ({
            manageNo: o.manageNo, orderDate: o.orderDate, route: o.route
          })),
          otherButHasLines: analyzed.filter((o) => o.route === 'other' && o.lines.length).slice(0, 20)
            .map((o) => ({
              manageNo: o.manageNo,
              orderDate: o.orderDate,
              kimonoType: o.kimonoType,
              lines: o.lines.map((l) => l.itemName + '=>' + l.subcategory)
            }))
        },
        variants,
        engineMeta,
        engineCustomer,
        dashVersion: window.CAYANAS_BUSINESS_DASHBOARD && window.CAYANAS_BUSINESS_DASHBOARD.VERSION,
        monthlyVersion: window.CAYANAS_BusinessDashboardMonthly && window.CAYANAS_BusinessDashboardMonthly.VERSION
      };
    })()`,
  });

  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'probe.json'), JSON.stringify(value, null, 2));

  // local re-check of aliases
  const local = {
    dataStart: CFG.MONTHLY.DATA_START_DATE,
    aliases: CFG.MONTHLY.SUBCATEGORY_ALIASES,
    tailorSubs: CFG.MONTHLY.TAILOR_SUBCATEGORIES,
    monthlyVersion: Monthly.VERSION,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'local_config.json'), JSON.stringify(local, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'SUMMARY.json'), JSON.stringify({
    stamp: STAMP,
    workDir: WORK_DIR,
    summary: value && value.summary,
    customer: value && value.customer,
    counted: value && value.summary && value.summary.countedInDashboard,
    other: value && value.summary && value.summary.other,
    dashVersion: value && value.dashVersion,
    monthlyVersion: value && value.monthlyVersion,
  }, null, 2));

  console.log(JSON.stringify({
    workDir: WORK_DIR,
    customer: value && value.customer,
    summary: value && value.summary,
    otherSampleCount: value && value.otherSamples && value.otherSamples.length,
    excludedOther: value && value.excludedSamples && value.excludedSamples.otherButHasLines
      && value.excludedSamples.otherButHasLines.length,
    versions: {
      dash: value && value.dashVersion,
      monthly: value && value.monthlyVersion,
    },
  }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
