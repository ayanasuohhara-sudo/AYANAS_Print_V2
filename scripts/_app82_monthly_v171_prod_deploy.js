'use strict';

/**
 * App82 経営月次 v1.7.1 本番反映
 * - 反映前に現行本番をバックアップ
 * - AR系・engine・money は現行本番を維持
 * - config / monthly_engine / desktop / css のみローカル反映
 * - 検証失敗時はバックアップから復旧
 *
 *   node scripts/_app82_monthly_v171_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP = path.join(ROOT, 'customize/backups', 'app82_monthly_v171_prod_' + STAMP);
const WORK = path.join(ROOT, 'customize/backups', 'app82_monthly_v171_deploy_' + STAMP);
fs.mkdirSync(BACKUP, { recursive: true });
fs.mkdirSync(path.join(BACKUP, 'files'), { recursive: true });
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
const DAILY_ENGINE = 'business_dashboard_engine.js';

const EXPECTED = {
  overseas: 936,
  domestic: 30,
  obi: 102,
  tailor: 1068,
  conflicts: 1,
  overall: 1069,
  months: {
    '2026-08': 297,
    '2026-09': 250,
    '2026-10': 335,
    '2026-11': 186,
  },
  conflictManageNo: '090526327',
};

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
    id: page.id,
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

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

function readBackup(name) {
  return fs.readFileSync(path.join(BACKUP, 'files', name));
}

function readFileForDeploy(name) {
  if (LOCAL_OVERRIDE.has(name)) return readLocal(name);
  return readBackup(name);
}

async function downloadCustomizeFile(send, fileKey, outPath) {
  const b64 = await evalJson(send, `(async () => {
    const r = await fetch(kintone.api.url('/k/v1/file.json', true) + '?fileKey=' + encodeURIComponent(${JSON.stringify(fileKey)}), {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!r.ok) throw new Error('download ' + ${JSON.stringify(fileKey)} + ' ' + r.status);
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  })()`, true);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
}

async function backupProd() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  const meta = await evalJson(page.send, `(async () => {
    const c = await kintone.api(kintone.api.url('/k/v1/app/customize.json', true), 'GET', { app: 82 });
    const mapKind = (kind) => ((c.desktop && c.desktop[kind]) || []).map((item) => ({
      type: item.type,
      name: item.file && item.file.name,
      fileKey: item.file && item.file.fileKey,
      contentType: item.file && item.file.contentType,
      size: item.file && item.file.size,
    }));
    return { scope: c.scope, js: mapKind('js'), css: mapKind('css') };
  })()`, true);
  fs.writeFileSync(path.join(BACKUP, 'before_customize.json'), JSON.stringify(meta, null, 2));

  const files = {};
  for (const item of [...(meta.js || []), ...(meta.css || [])]) {
    if (!item.fileKey || !item.name) continue;
    const out = path.join(BACKUP, 'files', item.name);
    await downloadCustomizeFile(page.send, item.fileKey, out);
    files[item.name] = {
      size: fs.statSync(out).size,
      sha1: sha1(fs.readFileSync(out)),
    };
  }
  await page.close();

  const diff = {};
  for (const name of [...JS_ORDER, ...CSS_ORDER]) {
    const localPath = path.join(ROOT, 'customize', name);
    const prodPath = path.join(BACKUP, 'files', name);
    const hasLocal = fs.existsSync(localPath);
    const hasProd = fs.existsSync(prodPath);
    if (!hasLocal && !hasProd) {
      diff[name] = { status: 'missing_both' };
      continue;
    }
    if (!hasProd) {
      diff[name] = { status: 'local_only', action: LOCAL_OVERRIDE.has(name) ? 'deploy_new' : 'keep_missing' };
      continue;
    }
    if (!hasLocal) {
      diff[name] = { status: 'prod_only', action: 'keep_prod' };
      continue;
    }
    const localSha = sha1(fs.readFileSync(localPath));
    const prodSha = sha1(fs.readFileSync(prodPath));
    const same = localSha === prodSha;
    diff[name] = {
      status: same ? 'identical' : 'different',
      localSha,
      prodSha,
      action: LOCAL_OVERRIDE.has(name)
        ? (same ? 'noop' : 'override_local')
        : 'keep_prod',
    };
  }

  const dailyLocal = path.join(ROOT, 'customize', DAILY_ENGINE);
  const dailyProd = path.join(BACKUP, 'files', DAILY_ENGINE);
  const dailyUnchangedIntent = diff[DAILY_ENGINE] && diff[DAILY_ENGINE].action === 'keep_prod';

  const summary = {
    stamp: STAMP,
    backup: BACKUP,
    files,
    jsOrder: (meta.js || []).map((x) => x.name),
    cssOrder: (meta.css || []).map((x) => x.name),
    monthlyBeforeDesktop: (() => {
      const js = (meta.js || []).map((x) => x.name);
      const m = js.indexOf('business_dashboard_monthly_engine.js');
      const d = js.indexOf('business_dashboard_desktop.js');
      return m >= 0 && d > m;
    })(),
    diff,
    dailyEngineKeepProd: dailyUnchangedIntent,
    dailyLocalExists: fs.existsSync(dailyLocal),
    dailyProdExists: fs.existsSync(dailyProd),
  };
  fs.writeFileSync(path.join(BACKUP, 'diff_summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

async function putCustomize(filesMap, restore) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await evalJson(page.send, `(async () => {
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
      return {
        ok: last && last.status === 'SUCCESS',
        deploy: last,
        js: names('js'),
        css: names('css'),
        restore: ${restore ? 'true' : 'false'},
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  })()`, true);
  await page.close();
  return result;
}

async function verify() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
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
      return {
        ver: window.CAYANAS_BUSINESS_DASHBOARD_VERSION || null,
        monthlyVer: (window.CAYANAS_BusinessDashboardMonthly || {}).VERSION || null,
        hasMonthly: typeof window.CAYANAS_BusinessDashboardMonthly !== 'undefined',
        hasEngine: typeof window.CAYANAS_BusinessDashboardEngine !== 'undefined',
        root: !!root,
        tabs,
        sections: root ? root.querySelectorAll('.ayanas-bd-section').length : 0,
        title: (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '',
      };
    })()`);
    if (dailyReady && dailyReady.root && dailyReady.tabs && dailyReady.tabs.length >= 2 && dailyReady.sections > 0) break;
  }

  await evalJson(page.send, `(() => {
    const btn = document.querySelector('[data-bd-main-tab="monthly"]');
    if (btn) btn.click();
    return !!btn;
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
      const rows = [...document.querySelectorAll('.ayanas-bd-m-row')].map((tr) => ({
        key: tr.getAttribute('data-bd-m-month'),
        cells: [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()),
      }));
      const yearNote = (root && [...root.querySelectorAll('.ayanas-bd-note')].map((n) => n.textContent.trim()).find((t) => t.indexOf('全体') >= 0 || t.indexOf('年度累計') >= 0)) || '';
      const conflictSection = [...document.querySelectorAll('.ayanas-bd-section__title')].some((el) => el.textContent.indexOf('競合') >= 0);
      const routeButtons = [...document.querySelectorAll('[data-bd-m-route]')].map((el) => el.getAttribute('data-bd-m-route'));
      const matrixRows = document.querySelectorAll('.ayanas-bd-table--matrix tbody tr').length;
      const rankRows = document.querySelectorAll('.ayanas-bd-section') ;
      return {
        loading,
        hasChart,
        bars,
        rows,
        title: (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '',
        err: (root && root.querySelector('.ayanas-bd-error') || {}).textContent || '',
        yearNote,
        conflictSection,
        routeButtons,
        filters: !!document.querySelector('.ayanas-bd-m-filters'),
        matrixRows,
        custOpts: document.querySelectorAll('#ayanas-bd-m-customer option').length,
        typeOpts: document.querySelectorAll('#ayanas-bd-m-kimono option').length,
        sectionTitles: [...document.querySelectorAll('.ayanas-bd-section__title')].map((el) => el.textContent.trim()),
      };
    })()`);
    if (monthly && !monthly.loading && (monthly.hasChart || monthly.err)) break;
  }

  const probe = await evalJson(page.send, `(async () => {
    const M = window.CAYANAS_BusinessDashboardMonthly;
    const report = await M.buildMonthlyReport({
      fiscalStartYear: 2026,
      route: 'all',
      asOfDate: '2026-11-16',
      deliveredManageNos: new Set(),
    });
    const yt = report.yearTotals || {};
    const ready = (report.series || []).filter((r) => r.status === 'ready').map((r) => ({
      key: r.key,
      overseas: r.overseasKimono,
      domestic: r.domesticKimono,
      obi: r.obiKimono,
      total: r.tailorKimono,
    }));
    return {
      ver: M.VERSION,
      yearTotals: yt,
      overall: (yt.tailorKimono || 0) + (yt.conflictCount || 0),
      conflicts: (report.conflicts || []).map((c) => ({
        manageNo: c.manageNo,
        orderDate: c.orderDate,
        cats: c.tailorCategories,
      })),
      series: ready,
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
      matrix: (report.customerMatrix || []).length,
      ranking: (report.customerRanking || []).length,
      classifyObi: M.classifyKimonoRoute(['帯仕立']),
      classifyConflict: M.classifyKimonoRoute(['海外仕立', '帯仕立']),
    };
  })()`, true);

  await evalJson(page.send, `(() => {
    const b = document.querySelector('[data-bd-main-tab="daily"]');
    if (b) b.click();
    return !!b;
  })()`);
  let dailyAfter = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    dailyAfter = await evalJson(page.send, `(() => {
      const root = document.getElementById('ayanas-business-dashboard-root');
      return {
        activeDaily: !!document.querySelector('[data-bd-main-tab="daily"].is-active'),
        sections: root ? root.querySelectorAll('.ayanas-bd-section').length : 0,
        title: (root && root.querySelector('.ayanas-bd-title') || {}).textContent || '',
        ver: window.CAYANAS_BUSINESS_DASHBOARD_VERSION || null,
      };
    })()`);
    if (dailyAfter && dailyAfter.activeDaily && dailyAfter.sections > 0) break;
  }

  const customize = await evalJson(page.send, `(async () => {
    const c = await kintone.api(kintone.api.url('/k/v1/app/customize.json', true), 'GET', { app: 82 });
    const js = ((c.desktop && c.desktop.js) || []).map((item) => (item.file && item.file.name) || item.type);
    const css = ((c.desktop && c.desktop.css) || []).map((item) => (item.file && item.file.name) || item.type);
    return { js, css };
  })()`, true);

  await page.close();

  const yt = probe && probe.yearTotals;
  const monthOk = probe && probe.series && Object.keys(EXPECTED.months).every((key) => {
    const row = probe.series.find((r) => r.key === key);
    return row && row.total === EXPECTED.months[key];
  });
  const conflictOk = !!(probe && probe.conflicts && probe.conflicts[0]
    && probe.conflicts[0].manageNo === EXPECTED.conflictManageNo);

  const checks = {
    ver171: dailyReady && dailyReady.ver === '1.7.1',
    monthly110: dailyReady && dailyReady.monthlyVer === '1.1.0',
    dailySections: dailyReady && dailyReady.sections > 0,
    monthlyTab: dailyReady && dailyReady.tabs.some((t) => t.id === 'monthly'),
    chart12: monthly && monthly.hasChart && monthly.bars === 12,
    routes: monthly && Array.isArray(monthly.routeButtons)
      && ['all', 'overseas', 'domestic', 'obi'].every((r) => monthly.routeButtons.indexOf(r) >= 0),
    yearNoteOverall: monthly && /全体/.test(monthly.yearNote || ''),
    conflictSection: monthly && monthly.conflictSection,
    filters: monthly && monthly.filters,
    matrix: monthly && monthly.matrixRows > 0,
    counts: !!(yt
      && yt.overseasKimono === EXPECTED.overseas
      && yt.domesticKimono === EXPECTED.domestic
      && yt.obiKimono === EXPECTED.obi
      && yt.tailorKimono === EXPECTED.tailor
      && yt.conflictCount === EXPECTED.conflicts
      && probe.overall === EXPECTED.overall),
    months: monthOk,
    conflictManageNo: conflictOk,
    classify: probe && probe.classifyObi === 'obi' && probe.classifyConflict === 'conflict',
    dailyAfter: dailyAfter && dailyAfter.activeDaily && dailyAfter.sections > 0,
    jsOrder: customize && customize.js.indexOf('business_dashboard_monthly_engine.js')
      < customize.js.indexOf('business_dashboard_desktop.js')
      && customize.js.indexOf('business_dashboard_monthly_engine.js') >= 0,
  };

  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    checks,
    dailyReady,
    monthly,
    probe,
    dailyAfter,
    customize,
  };
}

async function restoreFromBackup() {
  const filesMap = {};
  for (const name of JS_ORDER.concat(CSS_ORDER)) {
    const p = path.join(BACKUP, 'files', name);
    if (!fs.existsSync(p)) throw new Error('restore missing ' + name);
    filesMap[name] = fs.readFileSync(p);
  }
  return putCustomize(filesMap, true);
}

(async () => {
  const report = { stamp: STAMP, backup: BACKUP, work: WORK, expected: EXPECTED, steps: {} };
  console.log('BACKUP', BACKUP);

  report.steps.backup = await backupProd();
  console.log('backup_diff', JSON.stringify({
    jsOrder: report.steps.backup.jsOrder,
    monthlyBeforeDesktop: report.steps.backup.monthlyBeforeDesktop,
    dailyEngineKeepProd: report.steps.backup.dailyEngineKeepProd,
    overrides: Object.fromEntries(
      Object.entries(report.steps.backup.diff || {}).filter(([k]) => LOCAL_OVERRIDE.has(k) || k === DAILY_ENGINE)
    ),
  }, null, 2));

  if (!report.steps.backup.dailyEngineKeepProd) {
    throw new Error('daily engine must remain prod (keep_prod)');
  }

  const filesMap = {};
  for (const name of JS_ORDER.concat(CSS_ORDER)) {
    filesMap[name] = readFileForDeploy(name);
  }

  report.steps.deploy = await putCustomize(filesMap, false);
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
  console.log('verify', JSON.stringify({
    ok: report.steps.verify.ok,
    checks: report.steps.verify.checks,
    yearTotals: report.steps.verify.probe && report.steps.verify.probe.yearTotals,
    overall: report.steps.verify.probe && report.steps.verify.probe.overall,
    series: report.steps.verify.probe && report.steps.verify.probe.series,
    conflicts: report.steps.verify.probe && report.steps.verify.probe.conflicts,
    dailyAfter: report.steps.verify.dailyAfter,
  }, null, 2));

  report.ok = !!report.steps.verify.ok;
  if (!report.ok) {
    console.error('VERIFY FAILED — restoring backup');
    report.steps.restore = await restoreFromBackup();
    console.log('restore', JSON.stringify(report.steps.restore, null, 2));
    fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 2));
    process.exit(1);
  }

  fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: true,
    ver: '1.7.1',
    monthlyVer: '1.1.0',
    js,
    yearTotals: report.steps.verify.probe.yearTotals,
    overall: report.steps.verify.probe.overall,
    series: report.steps.verify.probe.series,
    conflicts: report.steps.verify.probe.conflicts,
    backup: BACKUP,
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
