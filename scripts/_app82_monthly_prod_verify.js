'use strict';

/**
 * App82 経営月次 v1.7.0 本番確認（反映後）
 *   node scripts/_app82_monthly_prod_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const OUT = path.join(ROOT, 'customize/backups/app82_monthly_deploy_2026-11-16T06-21-02', 'verify2.json');

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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed ' + JSON.stringify(page));
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

async function evalJson(send, expression, awaitPromise) {
  const r = await send('Runtime.evaluate', {
    awaitPromise: !!awaitPromise,
    returnByValue: true,
    expression,
  });
  return r.result && r.result.value;
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);

  // Wait until dashboard root + main tabs exist
  let dailyReady = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    dailyReady = await evalJson(page.send, `(() => {
      const root = document.getElementById('ayanas-business-dashboard-root');
      const tabs = [...document.querySelectorAll('[data-bd-main-tab]')].map((el) => ({
        id: el.getAttribute('data-bd-main-tab'),
        text: el.textContent.trim(),
        active: el.classList.contains('is-active'),
      }));
      const sections = root ? root.querySelectorAll('.ayanas-bd-section').length : 0;
      const title = (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '';
      return {
        ver: window.CAYANAS_BUSINESS_DASHBOARD_VERSION || null,
        hasMonthly: typeof window.CAYANAS_BusinessDashboardMonthly !== 'undefined',
        monthlyVer: (window.CAYANAS_BusinessDashboardMonthly || {}).VERSION || null,
        hasEngine: typeof window.CAYANAS_BusinessDashboardEngine !== 'undefined',
        root: !!root,
        tabs,
        sections,
        title,
      };
    })()`);
    if (dailyReady && dailyReady.root && dailyReady.tabs && dailyReady.tabs.length >= 2 && dailyReady.sections > 0) break;
  }

  const clicked = await evalJson(page.send, `(() => {
    const btn = document.querySelector('[data-bd-main-tab="monthly"]');
    if (!btn) return { ok: false };
    btn.click();
    return { ok: true, text: btn.textContent.trim() };
  })()`);

  let monthly = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    monthly = await evalJson(page.send, `(() => {
      const root = document.getElementById('ayanas-business-dashboard-root');
      const html = root ? root.innerHTML : '';
      const loading = html.indexOf('集計中') >= 0;
      const hasChart = !!document.querySelector('.ayanas-bd-m-chart');
      const bars = document.querySelectorAll('.ayanas-bd-m-bar-wrap').length;
      const barLabels = [...document.querySelectorAll('.ayanas-bd-m-bar-label')].map((el) => el.textContent.trim());
      const rows = [...document.querySelectorAll('.ayanas-bd-m-row')].map((tr) => {
        const key = tr.getAttribute('data-bd-m-month');
        const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
        return { key, cells: tds };
      });
      const title = (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '';
      const err = (root && root.querySelector('.ayanas-bd-error') || {}).textContent || '';
      const filters = !!document.querySelector('.ayanas-bd-m-filters');
      const custOpts = document.querySelectorAll('#ayanas-bd-m-customer option').length;
      const typeOpts = document.querySelectorAll('#ayanas-bd-m-kimono option').length;
      const matrixRows = document.querySelectorAll('.ayanas-bd-table--matrix tbody tr').length;
      const amountTable = !!document.querySelector('.ayanas-bd-note');
      return {
        loading, hasChart, bars, barLabels, rows, title, err, filters,
        custOpts, typeOpts, matrixRows, amountTable,
        activeMonthly: !!document.querySelector('[data-bd-main-tab="monthly"].is-active'),
      };
    })()`);
    if (monthly && !monthly.loading && (monthly.hasChart || monthly.err)) break;
  }

  // Engine report + 帯仕立 / 国内着物仕立 分離カウント
  const probe = await evalJson(page.send, `(async () => {
    const M = window.CAYANAS_BusinessDashboardMonthly;
    const C = window.CAYANAS_BusinessDashboardConfig || {};
    if (!M) return { ok: false, error: 'no monthly' };
    const asOf = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    const report = await M.buildMonthlyReport({
      fiscalStartYear: 2025,
      route: 'all',
      asOfDate: asOf,
    });

    // 帯 vs 国内着物: App16 を月次エンジンと同じ範囲で再分類
    const APP16 = (C.APPS && C.APPS.ORDER) || 16;
    const fiscal = report.fiscal;
    const query = 'order_date >= "' + fiscal.startDate + '" and order_date <= "' + fiscal.endDate
      + '" and aggregation_status not in ("取消") order by order_date asc, $id asc limit 500';
    const byManage = new Map();
    let offset = 0;
    for (;;) {
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
        app: APP16,
        query: query.replace('limit 500', 'limit 500 offset ' + offset),
        fields: ['manage_no', 'order_date', 'aggregation_status', 'OrderLines'],
      });
      const recs = resp.records || [];
      for (const rec of recs) {
        const mn = String((rec.manage_no && rec.manage_no.value) || '').trim();
        if (!mn) continue;
        if (!byManage.has(mn)) {
          byManage.set(mn, {
            orderDate: (rec.order_date && rec.order_date.value) || '',
            cats: new Set(),
          });
        }
        const entry = byManage.get(mn);
        const lines = (rec.OrderLines && rec.OrderLines.value) || [];
        for (const row of lines) {
          const v = row.value || {};
          const cat = String((v.subcategory && v.subcategory.value) || '').trim();
          if (cat) entry.cats.add(cat);
        }
      }
      if (recs.length < 500) break;
      offset += 500;
      if (offset > 20000) break;
    }

    const monthKeys = (fiscal.months || []).map((m) => m.key);
    const split = {};
    for (const key of monthKeys) {
      split[key] = {
        domesticKimonoOnly: 0,
        obiOnly: 0,
        domesticAndObi: 0,
        overseas: 0,
        domesticInclObiEngine: 0,
        otherNoTailor: 0,
      };
    }
    let totals = {
      domesticKimonoOnly: 0,
      obiOnly: 0,
      domesticAndObi: 0,
      overseas: 0,
      domesticInclObiEngine: 0,
    };
    for (const [, entry] of byManage) {
      const od = entry.orderDate;
      if (!od || od.length < 7) continue;
      const key = od.slice(0, 7);
      if (!split[key]) continue;
      const cats = [...entry.cats];
      const route = M.classifyKimonoRoute(cats);
      const hasObi = cats.includes('帯仕立');
      const hasDom = cats.includes('国内仕立');
      const hasOver = cats.includes('海外仕立');
      if (route === 'overseas') {
        split[key].overseas += 1;
        totals.overseas += 1;
      } else if (route === 'domestic') {
        split[key].domesticInclObiEngine += 1;
        totals.domesticInclObiEngine += 1;
        if (hasDom && hasObi) {
          split[key].domesticAndObi += 1;
          totals.domesticAndObi += 1;
        } else if (hasObi && !hasDom) {
          split[key].obiOnly += 1;
          totals.obiOnly += 1;
        } else if (hasDom && !hasObi) {
          split[key].domesticKimonoOnly += 1;
          totals.domesticKimonoOnly += 1;
        } else {
          // 国内扱いだが「国内仕立」「帯仕立」以外のルート判定由来（想定外）
          split[key].otherNoTailor += 1;
        }
      }
      void hasOver;
    }

    const series = (report.series || []).map((r) => ({
      key: r.key,
      label: r.label,
      status: r.status,
      overseas: r.overseasKimono,
      domestic: r.domesticKimono,
      total: r.tailorKimono,
      filtered: r.filteredKimono,
      mom: r.mom,
      cumulative: r.cumulativeFiltered,
    }));

    // filter smoke: overseas route + one customer if any
    const overseasReport = await M.buildMonthlyReport({
      fiscalStartYear: 2025,
      route: 'overseas',
      asOfDate: asOf,
      selectedMonthKey: report.filters.selectedMonthKey,
    });
    const custList = (report.customerOptions || []).filter((c) => c.code && c.code !== 'ALL').slice(0, 1);
    let customerFilter = null;
    if (custList.length) {
      const cr = await M.buildMonthlyReport({
        fiscalStartYear: 2025,
        route: 'all',
        customerCode: custList[0].code,
        asOfDate: asOf,
        selectedMonthKey: report.filters.selectedMonthKey,
      });
      customerFilter = {
        code: custList[0].code,
        name: custList[0].name,
        filteredKimono: cr.selectedMonth && cr.selectedMonth.filteredKimono,
        yearTotal: cr.yearTotalKimono,
      };
    }

    return {
      ok: true,
      dataStartDate: report.dataStartDate,
      yearTotalKimono: report.yearTotalKimono,
      series,
      selected: report.selectedMonth && {
        key: report.selectedMonth.key,
        label: report.selectedMonth.label,
        status: report.selectedMonth.status,
        overseasKimono: report.selectedMonth.overseasKimono,
        domesticKimono: report.selectedMonth.domesticKimono,
        tailorKimono: report.selectedMonth.tailorKimono,
        orderTotal: report.selectedMonth.orderTotal,
        tailorAmount: report.selectedMonth.tailorAmount,
        addonAmount: report.selectedMonth.addonAmount,
        inseparableCount: report.selectedMonth.inseparableCount,
        amountSeparable: report.selectedMonth.amountSeparable,
        avgOrderUnitPrice: report.selectedMonth.avgOrderUnitPrice,
        avgTailorUnitPrice: report.selectedMonth.avgTailorUnitPrice,
      },
      backlog: report.backlog && {
        openKimono: report.backlog.openKimono,
        openAmount: report.backlog.openAmount,
      },
      customerMatrixCount: (report.customerMonthMatrix || []).length,
      kimonoBreakdown: report.selectedMonth && report.selectedMonth.kimonoBreakdown,
      overseasFilterYearTotal: overseasReport.yearTotalKimono,
      customerFilter,
      obiSplit: { byMonth: split, totals },
      app16UnchangedNote: 'App82 customize only; App16 records not written by this deploy',
    };
  })()`, true);

  await evalJson(page.send, `(() => {
    const b = document.querySelector('[data-bd-main-tab="daily"]');
    if (b) b.click();
    return !!b;
  })()`);
  await new Promise((r) => setTimeout(r, 6000));
  const dailyAfter = await evalJson(page.send, `(() => {
    const root = document.getElementById('ayanas-business-dashboard-root');
    return {
      activeDaily: !!document.querySelector('[data-bd-main-tab="daily"].is-active'),
      sections: root ? root.querySelectorAll('.ayanas-bd-section').length : 0,
      title: (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '',
      ver: window.CAYANAS_BUSINESS_DASHBOARD_VERSION || null,
    };
  })()`);

  // Confirm customize file order still correct
  const customize = await evalJson(page.send, `(async () => {
    const c = await kintone.api(kintone.api.url('/k/v1/app/customize.json', true), 'GET', { app: 82 });
    const js = ((c.desktop && c.desktop.js) || []).map((item) => (item.file && item.file.name) || item.type);
    const css = ((c.desktop && c.desktop.css) || []).map((item) => (item.file && item.file.name) || item.type);
    return { js, css, scope: c.scope };
  })()`, true);

  await page.close();

  const ok = !!(
    dailyReady && dailyReady.ver === '1.7.0' && dailyReady.hasMonthly
    && dailyReady.tabs && dailyReady.tabs.some((t) => t.id === 'monthly')
    && clicked && clicked.ok
    && monthly && monthly.hasChart && monthly.bars === 12 && !monthly.err
    && dailyAfter && dailyAfter.activeDaily && dailyAfter.sections > 0
    && probe && probe.ok
    && customize && customize.js.indexOf('business_dashboard_monthly_engine.js') >= 0
    && customize.js.indexOf('business_dashboard_monthly_engine.js')
      < customize.js.indexOf('business_dashboard_desktop.js')
  );

  const out = {
    ok,
    dailyReady,
    clicked,
    monthly,
    probe,
    dailyAfter,
    customize,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    ok,
    ver: dailyReady && dailyReady.ver,
    tabs: dailyReady && dailyReady.tabs,
    monthlyBars: monthly && monthly.bars,
    monthlyTitle: monthly && monthly.title,
    yearTotal: probe && probe.yearTotalKimono,
    months: probe && probe.series,
    obiTotals: probe && probe.obiSplit && probe.obiSplit.totals,
    selected: probe && probe.selected,
    backlog: probe && probe.backlog,
    js: customize && customize.js,
  }, null, 2));
  if (!ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
