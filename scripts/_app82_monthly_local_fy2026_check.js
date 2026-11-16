'use strict';

/**
 * ローカル月次エンジンを本番データに当てて FY2026 件数確認（本番 customize は変更しない）
 *   node scripts/_app82_monthly_local_fy2026_check.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const OUT = path.join(ROOT, 'customize/backups/app82_monthly_split_local_2026-11-16/fy2026_check.json');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

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

async function pushAndEval(send, source, name) {
  const b64 = Buffer.from(source, 'utf8').toString('base64');
  const CHUNK = 350000;
  await send('Runtime.evaluate', { expression: 'window.__SP_SRC=[]; true' });
  for (let i = 0; i < b64.length; i += CHUNK) {
    await send('Runtime.evaluate', {
      expression: `window.__SP_SRC.push(${JSON.stringify(b64.slice(i, i + CHUNK))}); true`,
    });
  }
  await send('Runtime.evaluate', {
    expression: `(() => {
      const src = atob(window.__SP_SRC.join(''));
      (0, eval)(src);
      return ${JSON.stringify(name)};
    })()`,
  });
}

(async () => {
  const configSrc = fs.readFileSync(path.join(ROOT, 'customize/business_dashboard_config.js'), 'utf8');
  const monthlySrc = fs.readFileSync(path.join(ROOT, 'customize/business_dashboard_monthly_engine.js'), 'utf8');

  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ready = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: 'typeof kintone==="object"',
    });
    if (ready.result && ready.result.value) break;
  }

  await pushAndEval(page.send, configSrc, 'config');
  await pushAndEval(page.send, monthlySrc, 'monthly');

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const M = window.CAYANAS_BusinessDashboardMonthly;
        const ver = window.CAYANAS_BUSINESS_DASHBOARD_VERSION;
        const report = await M.buildMonthlyReport({
          fiscalStartYear: 2026,
          route: 'all',
          asOfDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
        });
        const expected = { overseas: 937, domestic: 30, obi: 102, total: 1069 };
        const yt = report.yearTotals || {};
        const exclusive = {
          overseas: yt.overseasKimono,
          domestic: yt.domesticKimono,
          obi: yt.obiKimono,
          total: yt.tailorKimono,
          conflicts: yt.conflictCount,
        };
        // 旧確認値との差分説明: 旧937は海外優先で競合1を海外に含めた
        const withConflictAsOverseas = exclusive.overseas + exclusive.conflicts;
        return {
          ok: true,
          dashboardVersion: ver,
          monthlyVersion: M.VERSION,
          dataStartDate: report.dataStartDate,
          fiscal: report.fiscal.label,
          exclusive,
          conflicts: (report.conflicts || []).map((c) => ({
            manageNo: c.manageNo,
            orderDate: c.orderDate,
            tailorCategories: c.tailorCategories,
            customerName: c.customerName,
          })),
          series: (report.series || []).filter((r) => r.status === 'ready').map((r) => ({
            key: r.key,
            overseas: r.overseasKimono,
            domestic: r.domesticKimono,
            obi: r.obiKimono,
            total: r.tailorKimono,
          })),
          expected,
          compare: {
            domesticMatch: exclusive.domestic === expected.domestic,
            obiMatch: exclusive.obi === expected.obi,
            exclusiveSumPlusConflictEqualsExpectedTotal:
              exclusive.total + exclusive.conflicts === expected.total,
            oldOverseasEqualsExclusivePlusConflict:
              withConflictAsOverseas === expected.overseas,
            note: '新ルールは競合を3区分から除外。旧937=海外936+競合1。',
          },
          selected: report.selectedMonth && {
            key: report.selectedMonth.key,
            overseas: report.selectedMonth.overseasKimono,
            domestic: report.selectedMonth.domesticKimono,
            obi: report.selectedMonth.obiKimono,
            total: report.selectedMonth.tailorKimono,
            orderTotal: report.selectedMonth.orderTotal,
            tailorAmount: report.selectedMonth.tailorAmount,
            addonAmount: report.selectedMonth.addonAmount,
          },
          backlog: report.backlog && report.backlog.openKimono,
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
