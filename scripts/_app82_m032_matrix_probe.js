'use strict';

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CODE = 'M032';
const WORK_DIR = path.join(
  '/workspace/customize/backups',
  'app82_m032_matrix_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
);
fs.mkdirSync(WORK_DIR, { recursive: true });

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
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
    const t = setTimeout(() => rej(new Error('timeout')), 600000);
    const h = (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id === i) {
        clearTimeout(t); ws.off('message', h);
        if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
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
      expression: `({hasK:typeof kintone!=='undefined'})`,
    });
    if (s.result && s.result.value && s.result.value.hasK) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2500));

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const CODE = ${JSON.stringify(CODE)};
      const Monthly = window.CAYANAS_BusinessDashboardMonthly;
      const out = {};
      for (const year of [2025, 2026]) {
        const report = await Monthly.buildMonthlyReport({
          fiscalStartYear: year,
          routeFilter: 'all',
          asOfYmd: Monthly.todayYmdJst(),
        });
        const matrix = report.customerMatrix || [];
        const row = matrix.find((c) => c.customerCode === CODE) || null;
        const ranking = report.customerRanking || [];
        const rank = ranking.find((c) => c.customerCode === CODE) || null;
        // series month filtered counts for this customer via filter
        const filtered = await Monthly.buildMonthlyReport({
          fiscalStartYear: year,
          routeFilter: 'all',
          customerCode: CODE,
          asOfYmd: Monthly.todayYmdJst(),
        });
        out[year] = {
          selectedMonth: report.filters && report.filters.selectedMonthKey,
          selectedMonthTailor: report.selectedMonth && report.selectedMonth.tailorKimono,
          rankingTailor: rank && rank.tailorKimono,
          rankingNote: 'customerRanking は選択月のみ',
          matrixRow: row ? {
            customerName: row.customerName,
            months: row.months || row.values || row.series || null,
            total: row.total || row.yearTotal || row.tailorKimono || null,
            keys: Object.keys(row)
          } : null,
          filteredSeries: (filtered.series || []).map((m) => ({
            key: m.key, status: m.status,
            tailor: m.tailorKimono, filtered: m.filteredKimono,
            overseas: m.overseasKimono, domestic: m.domesticKimono, obi: m.obiKimono
          })),
          filteredYearTailor: filtered.yearTotals && filtered.yearTotals.tailorKimono,
          filteredSelected: filtered.selectedMonth && {
            key: filtered.filters.selectedMonthKey,
            tailor: filtered.selectedMonth.tailorKimono
          }
        };
      }
      return { ok: true, out, dataStart: window.CAYANAS_BUSINESS_DASHBOARD.MONTHLY.DATA_START_DATE };
    })()`,
  });
  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'matrix.json'), JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
