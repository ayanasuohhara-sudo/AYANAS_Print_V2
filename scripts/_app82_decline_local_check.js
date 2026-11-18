'use strict';

/**
 * 受注減少得意先 — ローカルエンジンを本番データに当てて速度・抽出結果を確認（本番未反映）
 *   node scripts/_app82_decline_local_check.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const OUT_DIR = path.join(ROOT, 'customize/backups/app82_decline_local_2026-11-16');
fs.mkdirSync(OUT_DIR, { recursive: true });

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
      expression: "typeof kintone!=='undefined'&&!/login/i.test(location.href)",
    });
    if (s.result && s.result.value) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const ready = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: 'typeof CAYANAS_BUSINESS_DASHBOARD==="object"',
    });
    if (ready.result && ready.result.value) break;
  }

  // Patch config keys + inject local monthly engine
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const C = CAYANAS_BUSINESS_DASHBOARD;
      C.CUSTOMER_APP_ID = 8;
      C.FIELDS.customer = { customerCode: 'customer_code', customerName: 'customer_name' };
      C.MONTHLY.DECLINE = {
        WINDOW_MONTHS: 3,
        TREND_MONTHS: 12,
        DEFAULT_MAJOR_DECLINE_PCT: 50,
        DEFAULT_DECLINE_PCT: 20,
        DEFAULT_GROWTH_PCT: 20,
      };
      C.MONTHLY.DOMESTIC_KIMONO_SUBCATEGORY = '国内仕立';
      C.MONTHLY.OBI_SUBCATEGORY = '帯仕立';
      return true;
    })()`,
  });

  const monthlySrc = fs.readFileSync(path.join(ROOT, 'customize/business_dashboard_monthly_engine.js'), 'utf8');
  const b64 = Buffer.from(monthlySrc, 'utf8').toString('base64');
  await page.send('Runtime.evaluate', { expression: 'window.__SP_SRC=[]; true' });
  for (let i = 0; i < b64.length; i += 350000) {
    await page.send('Runtime.evaluate', {
      expression: `window.__SP_SRC.push(${JSON.stringify(b64.slice(i, i + 350000))}); true`,
    });
  }
  await page.send('Runtime.evaluate', {
    expression: '(0, eval)(atob(window.__SP_SRC.join(""))); true',
  });

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const M = window.CAYANAS_BusinessDashboardMonthly;
      const t0 = performance.now();
      const source = await M.prepareMonthlySource({});
      const t1 = performance.now();
      const decline = await M.buildDeclineReport({
        analyzed: source.analyzed,
        conflicts: source.conflicts,
        customerMaster: source.customerMaster,
        orderRecordCount: source.orderRecordCount,
        asOfDate: '2026-11-16',
        recentEndMonthKey: '2026-10',
        route: 'all',
        sortBy: 'delta',
      });
      const t2 = performance.now();
      const down = (decline.rows || []).filter((r) => (
        r.status === 'stopped' || r.status === 'major_down' || r.status === 'down'
      ));
      return {
        ok: true,
        monthlyVersion: M.VERSION,
        timingMs: {
          prepareSource: Math.round(t1 - t0),
          declineOnly: Math.round(t2 - t1),
          total: Math.round(t2 - t0),
        },
        windows: {
          recent: decline.windows.recentLabel,
          prior: decline.windows.priorLabel,
          recentEnd: decline.windows.recentEndMonthKey,
          insufficient: decline.windows.insufficientComparison,
        },
        summary: decline.summary,
        conflictCount: decline.conflictCount,
        topDecline: down.slice(0, 15).map((r) => ({
          code: r.customerCode,
          name: r.customerName,
          prior: r.priorCount,
          recent: r.recentCount,
          delta: r.delta,
          rate: r.rate,
          status: r.status,
          recentAmount: r.recentAmount,
          lastOrderDate: r.lastOrderDate,
        })),
        sampleStopped: (decline.rows || []).filter((r) => r.status === 'stopped').slice(0, 5),
        analyzedCount: source.analyzed.length,
        customerMasterSize: source.customerMaster.size,
      };
    })()`,
  });

  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(OUT_DIR, 'decline_check.json'), JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
  if (!value || !value.ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
