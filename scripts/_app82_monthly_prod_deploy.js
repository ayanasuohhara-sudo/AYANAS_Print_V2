'use strict';

/**
 * App82 経営月次 v1.7.0 本番反映
 * - AR系・engine・money は本番バックアップを維持
 * - config / monthly_engine / desktop / css のみローカル反映
 * - monthly_engine は desktop より前
 *
 *   node scripts/_app82_monthly_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const BACKUP = path.join(ROOT, 'customize/backups/app82_monthly_prod_2026-11-16T06-19-44');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK = path.join(ROOT, 'customize/backups', 'app82_monthly_deploy_' + STAMP);
fs.mkdirSync(WORK, { recursive: true });

const JS_ORDER = [
  'business_dashboard_config.js',
  'ar_config.js',
  'payment_create.js',
  'ar_engine.js',
  'business_dashboard_engine.js',
  'business_dashboard_monthly_engine.js',
  'business_dashboard_money.js',
  'business_dashboard_desktop.js',
];
const CSS_ORDER = ['business_dashboard.css'];

const LOCAL_OVERRIDE = new Set([
  'business_dashboard_config.js',
  'business_dashboard_monthly_engine.js',
  'business_dashboard_desktop.js',
  'business_dashboard.css',
]);

function readFileForDeploy(name) {
  if (LOCAL_OVERRIDE.has(name)) {
    if (name === 'business_dashboard_monthly_engine.js') {
      return fs.readFileSync(path.join(ROOT, 'customize', name));
    }
    return fs.readFileSync(path.join(ROOT, 'customize', name));
  }
  const prodPath = path.join(BACKUP, 'files', name);
  if (!fs.existsSync(prodPath)) {
    throw new Error('missing prod backup file: ' + name);
  }
  return fs.readFileSync(prodPath);
}

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
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: "({hasK:typeof kintone!=='undefined',url:location.href})",
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/i.test(s.result.value.url || '')) break;
  }
  return {
    send,
    id: page.id,
    close: async () => { try { await httpJson('/json/close/' + page.id); } catch (_) {} },
  };
}

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__SP_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += CHUNK) {
      await send('Runtime.evaluate', {
        expression: `window.__SP_FILES[${JSON.stringify(name)}].push(${JSON.stringify(b64.slice(i, i + CHUNK))}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=window.__SP_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

async function deploy() {
  const filesMap = {};
  for (const name of JS_ORDER.concat(CSS_ORDER)) {
    filesMap[name] = readFileForDeploy(name);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = 82;
        const jsOrder = ${JSON.stringify(JS_ORDER)};
        const cssOrder = ${JSON.stringify(CSS_ORDER)};
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        function b64ToBlob(b64, type) {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', kintone.getRequestToken());
          fd.append('file', blob, filename);
          const r = await fetch(kintone.api.url('/k/v1/file.json', true), {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
          });
          const bodyText = await r.text();
          let json = null;
          try { json = JSON.parse(bodyText); } catch (_) {}
          if (!json || !json.fileKey) throw new Error(filename + ' ' + bodyText);
          return json.fileKey;
        }
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const desktop = { js: [], css: [] };
        for (const name of jsOrder) {
          desktop.js.push({
            type: 'FILE',
            file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) },
          });
        }
        for (const name of cssOrder) {
          desktop.css.push({
            type: 'FILE',
            file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) },
          });
        }
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop,
          mobile: current.mobile || { js: [], css: [] },
        });
        await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: APP }] });
        let last = null;
        for (let i = 0; i < 120; i++) {
          const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [APP] });
          last = (st.apps || [])[0];
          if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        const after = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const names = (kind) => ((after.desktop && after.desktop[kind]) || [])
          .map((item) => (item.file && item.file.name) || item.type);
        return { ok: last && last.status === 'SUCCESS', deploy: last, js: names('js'), css: names('css') };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verify() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await new Promise((r) => setTimeout(r, 4000));
  const daily = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const ver = window.CAYANAS_BUSINESS_DASHBOARD_VERSION || null;
      const hasMonthly = typeof window.CAYANAS_BusinessDashboardMonthly !== 'undefined';
      const hasEngine = typeof window.CAYANAS_BusinessDashboardEngine !== 'undefined';
      const root = document.getElementById('ayanas-business-dashboard-root');
      const tabs = [...document.querySelectorAll('[data-bd-main-tab]')].map((el) => el.textContent.trim());
      const title = root ? (root.querySelector('.ayanas-bd-title') || {}).textContent : null;
      return { ver, hasMonthly, hasEngine, tabs, title, root: !!root };
    })()`,
  });

  // switch to monthly via click simulation by calling load path: set and rebuild is hard; use evaluate to click
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('[data-bd-main-tab="monthly"]');
      if (btn) btn.click();
      return !!btn;
    })()`,
  });
  // wait for monthly load (can take a while - full GET)
  let monthly = null;
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const check = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const root = document.getElementById('ayanas-business-dashboard-root');
        const html = root ? root.innerHTML : '';
        const loading = html.indexOf('集計中') >= 0;
        const hasChart = !!document.querySelector('.ayanas-bd-m-chart');
        const bars = document.querySelectorAll('.ayanas-bd-m-bar-wrap').length;
        const rows = [...document.querySelectorAll('.ayanas-bd-m-row')].map((tr) => {
          const tds = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
          return tds;
        });
        const title = (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '';
        const err = (root && root.querySelector('.ayanas-bd-error') || {}).textContent || '';
        return { loading, hasChart, bars, rows, title, err, monthlyVer: (window.CAYANAS_BusinessDashboardMonthly||{}).VERSION || null };
      })()`,
    });
    monthly = check.result && check.result.value;
    if (monthly && !monthly.loading && (monthly.hasChart || monthly.err)) break;
  }

  // Obi vs domestic probe via monthly engine helpers + live data sample
  const obiProbe = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const M = window.CAYANAS_BusinessDashboardMonthly;
      if (!M) return { ok: false, error: 'no monthly' };
      const canSeparate = {
        domesticOnly: M.classifyKimonoRoute(['国内仕立']) === 'domestic',
        obiOnly: M.classifyKimonoRoute(['帯仕立']) === 'domestic',
        both: M.classifyKimonoRoute(['国内仕立','帯仕立']) === 'domestic',
        note: '現状エンジンは帯仕立をdomesticに合算。サブカテゴリ別カウントはデータ上可能だがUI未分離。',
      };
      // count fiscal year orders by exact subcategory presence
      const report = await M.buildMonthlyReport({
        fiscalStartYear: 2025,
        route: 'all',
        asOfDate: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }),
      });
      // rebuild quick counts from series months ready
      const months = (report.series || []).filter((r) => r.status === 'ready').map((r) => ({
        key: r.key,
        label: r.label,
        overseas: r.overseasKimono,
        domesticInclObi: r.domesticKimono,
        total: r.tailorKimono,
        status: r.status,
      }));
      return {
        ok: true,
        canSeparate,
        fiscal: report.fiscal,
        dataStartDate: report.dataStartDate,
        yearTotalKimono: report.yearTotalKimono,
        months,
        selected: report.selectedMonth,
        backlog: report.backlog && report.backlog.openKimono,
        amountSeparable: report.selectedMonth && report.selectedMonth.amountSeparable,
        tailorAmount: report.selectedMonth && report.selectedMonth.tailorAmount,
        addonAmount: report.selectedMonth && report.selectedMonth.addonAmount,
        orderTotal: report.selectedMonth && report.selectedMonth.orderTotal,
      };
    })()`,
  });

  // click daily tab back
  await page.send('Runtime.evaluate', {
    expression: `(() => { const b=document.querySelector('[data-bd-main-tab="daily"]'); if(b) b.click(); return !!b; })()`,
  });
  await new Promise((r) => setTimeout(r, 5000));
  const dailyAfter = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const root = document.getElementById('ayanas-business-dashboard-root');
      const hasOverview = !!(root && root.querySelector('.ayanas-bd-section'));
      const activeDaily = !!(document.querySelector('[data-bd-main-tab="daily"].is-active'));
      const title = (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '';
      return { hasOverview, activeDaily, title, ver: window.CAYANAS_BUSINESS_DASHBOARD_VERSION };
    })()`,
  });

  await page.close();
  return {
    daily: daily.result && daily.result.value,
    monthly,
    obiProbe: obiProbe.result && obiProbe.result.value,
    dailyAfter: dailyAfter.result && dailyAfter.result.value,
  };
}

(async () => {
  const report = { stamp: STAMP, work: WORK, backup: BACKUP, steps: {} };
  console.log('WORK', WORK);
  report.steps.deploy = await deploy();
  console.log('deploy', JSON.stringify(report.steps.deploy, null, 2));
  if (!report.steps.deploy || !report.steps.deploy.ok) {
    throw new Error('deploy failed');
  }
  const js = report.steps.deploy.js || [];
  const monthlyIdx = js.indexOf('business_dashboard_monthly_engine.js');
  const desktopIdx = js.indexOf('business_dashboard_desktop.js');
  report.steps.orderOk = monthlyIdx >= 0 && desktopIdx > monthlyIdx;
  if (!report.steps.orderOk) throw new Error('JS order invalid: ' + js.join(','));

  report.steps.verify = await verify();
  console.log('verify', JSON.stringify(report.steps.verify, null, 2));

  const v = report.steps.verify;
  report.ok = !!(
    v.daily && v.daily.ver === '1.7.0' && v.daily.hasMonthly
    && v.monthly && v.monthly.hasChart && v.monthly.bars === 12
    && v.dailyAfter && v.dailyAfter.activeDaily
    && v.obiProbe && v.obiProbe.ok
  );
  fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    ver: v.daily && v.daily.ver,
    js,
    yearTotal: v.obiProbe && v.obiProbe.yearTotalKimono,
    months: v.obiProbe && v.obiProbe.months,
  }, null, 2));
  if (!report.ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
