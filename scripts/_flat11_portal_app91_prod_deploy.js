'use strict';

/**
 * App91 flat-11 + 標準ポータル banners 3.0.0 本番反映
 *
 * - システム全体: portal_business_banners_*（現行3ファイルのみを差し替え）
 * - App91: hub_nav + business_menu_*（3.0.0）
 * - App87/90 内部は変更しない
 *
 *   node scripts/_flat11_portal_app91_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'flat11_portal_app91_prod_' + STAMP);
fs.mkdirSync(path.join(WORK_DIR, 'files'), { recursive: true });

const APP91 = {
  js: [
    'hub_nav_config.js',
    'hub_nav.js',
    'business_menu_config.js',
    'business_menu_desktop.js',
  ],
  css: ['hub_nav.css', 'business_menu.css'],
  expect: { global: 'CAYANAS_BUSINESS_MENU_VERSION', ver: '3.1.0' },
};

const PORTAL_FILES = {
  'portal_business_banners_config.js': path.join(ROOT, 'portal-customize/portal_business_banners_config.js'),
  'portal_business_banners.js': path.join(ROOT, 'portal-customize/portal_business_banners.js'),
  'portal_business_banners.css': path.join(ROOT, 'portal-customize/portal_business_banners.css'),
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

function readCustomize(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

async function backupApp91() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/91/`);
  const meta = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      return await api('/k/v1/app/customize.json', 'GET', { app: 91 });
    })()`,
  });
  const value = meta.result && meta.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'before_app91_customize.json'), JSON.stringify(value, null, 2));
  const items = []
    .concat(((value.desktop || {}).js || []).filter((x) => x.type === 'FILE' && x.file && x.file.fileKey))
    .concat(((value.desktop || {}).css || []).filter((x) => x.type === 'FILE' && x.file && x.file.fileKey))
    .map((x) => ({ name: x.file.name, fileKey: x.file.fileKey }));
  const downloaded = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const items = ${JSON.stringify(items)};
      const out = [];
      for (const item of items) {
        const url = '/k/v1/file.json?fileKey=' + encodeURIComponent(item.fileKey);
        const r = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!r.ok) throw new Error('download fail ' + item.name + ' ' + r.status);
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        out.push({ name: item.name, b64: btoa(bin), size: bytes.length });
      }
      return out;
    })()`,
  });
  await page.close();
  const files = downloaded.result && downloaded.result.value;
  if (!Array.isArray(files)) throw new Error('backup download failed app91');
  const dir = path.join(WORK_DIR, 'files', 'app91');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f.name), Buffer.from(f.b64, 'base64'));
  }
  return { count: files.length, names: files.map((f) => f.name) };
}

async function backupPortal() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/91/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const token = kintone.getRequestToken();
      const r = await fetch('/k/api/js/getSystemSetting.json', {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({ __REQUEST_TOKEN__: token }),
      });
      return await r.json();
    })()`,
  });
  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'before_portal_system.json'), JSON.stringify(value, null, 2));
  return {
    scripts: (((value || {}).result || {}).scripts || []).map((s) => s.name),
  };
}

async function deployApp91() {
  const filesMap = {};
  for (const name of APP91.js.concat(APP91.css)) {
    filesMap[name] = readCustomize(name);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/91/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = 91;
        const jsOrder = ${JSON.stringify(APP91.js)};
        const cssOrder = ${JSON.stringify(APP91.css)};
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
          if (!json || !json.fileKey) throw new Error(bodyText);
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

async function deployPortal() {
  const filesMap = {};
  for (const [name, p] of Object.entries(PORTAL_FILES)) filesMap[name] = fs.readFileSync(p);
  const page = await openPage(`https://${SUB}.cybozu.com/k/91/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const token = kintone.getRequestToken();
        const files = window.__SP_FILES;
        function b64ToBlob(b64, type) {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadBlob(blob, filename) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, filename);
          const r = await fetch('/k/api/blob/upload.json', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd,
          });
          const json = await r.json();
          if (!json.success || !json.result || !json.result.fileKey) throw new Error(JSON.stringify(json));
          return json.result.fileKey;
        }
        async function post(path, body) {
          const r = await fetch(path, {
            method: 'POST',
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(Object.assign({ __REQUEST_TOKEN__: token }, body || {})),
          });
          const text = await r.text();
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          return { status: r.status, text, json };
        }
        const before = await post('/k/api/js/getSystemSetting.json', {});
        const beforeNames = ((before.json && before.json.result && before.json.result.scripts) || [])
          .map((s) => s.name);
        const expected = [
          'portal_business_banners_config.js',
          'portal_business_banners.js',
          'portal_business_banners.css',
        ];
        if (beforeNames.length && beforeNames.join('|') !== expected.join('|')) {
          return {
            ok: false,
            error: 'unexpected system scripts: ' + beforeNames.join(', '),
            beforeNames,
          };
        }
        const kConfig = await uploadBlob(
          b64ToBlob(files['portal_business_banners_config.js'], 'text/javascript'),
          'portal_business_banners_config.js'
        );
        const kJs = await uploadBlob(
          b64ToBlob(files['portal_business_banners.js'], 'text/javascript'),
          'portal_business_banners.js'
        );
        const kCss = await uploadBlob(
          b64ToBlob(files['portal_business_banners.css'], 'text/css'),
          'portal_business_banners.css'
        );
        const update = await post('/k/api/js/updateSystemSetting.json', {
          jsScope: 'ALL',
          jsFiles: [
            { jsType: 'DESKTOP', fileKeys: [kConfig, kJs] },
            { jsType: 'MOBILE', fileKeys: [] },
            { jsType: 'DESKTOP_CSS', fileKeys: [kCss] },
            { jsType: 'MOBILE_CSS', fileKeys: [] },
          ],
        });
        const after = await post('/k/api/js/getSystemSetting.json', {});
        return {
          ok: !!(update.json && update.json.success),
          updateStatus: update.status,
          beforeScripts: beforeNames,
          afterScripts: ((after.json && after.json.result && after.json.result.scripts) || [])
            .map((s) => s.name),
          keys: { kConfig, kJs, kCss },
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verify() {
  const portal = await openPage(`https://${SUB}.cybozu.com/k/#/portal`);
  await new Promise((r) => setTimeout(r, 1500));
  const portalCheck = await portal.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const ver = window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION || null;
      const labels = [...document.querySelectorAll('#ayanas-portal-business-banners .ayanas-pbb-item__label')]
        .map((el) => el.textContent.trim());
      const hrefs = [...document.querySelectorAll('#ayanas-portal-business-banners a.ayanas-pbb-item')]
        .map((a) => a.getAttribute('href'));
      return { ver, labels, hrefs, count: labels.length };
    })()`,
  });
  await portal.close();

  const app91 = await openPage(`https://${SUB}.cybozu.com/k/91/`);
  await new Promise((r) => setTimeout(r, 2000));
  const app91Check = await app91.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const ver = window.CAYANAS_BUSINESS_MENU_VERSION || null;
      const tiles = [...document.querySelectorAll('.cayan-bm-home__tile')].map((a) => ({
        label: (a.querySelector('.cayan-bm-home__label') || {}).textContent || '',
        href: a.getAttribute('href'),
      }));
      const hub = !!document.querySelector('.cayan-hub-nav');
      return { ver, hub, tiles, count: tiles.length };
    })()`,
  });
  await app91.close();

  return {
    portal: portalCheck.result && portalCheck.result.value,
    app91: app91Check.result && app91Check.result.value,
  };
}

(async () => {
  const report = {
    stamp: STAMP,
    workDir: WORK_DIR,
    steps: {},
  };
  console.log('WORK_DIR', WORK_DIR);

  report.steps.backupPortal = await backupPortal();
  console.log('backup portal', report.steps.backupPortal);

  report.steps.backupApp91 = await backupApp91();
  console.log('backup app91', report.steps.backupApp91);

  report.steps.portal = await deployPortal();
  console.log('deploy portal', report.steps.portal);
  if (!report.steps.portal || !report.steps.portal.ok) {
    throw new Error('portal deploy failed');
  }

  report.steps.app91 = await deployApp91();
  console.log('deploy app91', report.steps.app91);
  if (!report.steps.app91 || !report.steps.app91.ok) {
    throw new Error('app91 deploy failed');
  }

  report.steps.verify = await verify();
  console.log('verify', JSON.stringify(report.steps.verify, null, 2));

  const p = report.steps.verify.portal || {};
  const a = report.steps.verify.app91 || {};
  const portalOk = p.ver === '3.1.0' && p.count === 12
    && Array.isArray(p.labels) && p.labels[0] === '受注登録' && p.labels[3] === '外注入庫'
    && p.labels[5] === '完了登録' && p.labels[9] === '店舗' && p.labels[10] === '工場';
  const appOk = a.ver === '3.1.0' && a.count === 12 && a.hub === true;
  report.ok = !!(portalOk && appOk);
  report.portalOk = portalOk;
  report.appOk = appOk;

  fs.writeFileSync(path.join(WORK_DIR, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), [
    '# Rollback flat11 portal + App91',
    '',
    '- Portal backup meta: before_portal_system.json',
    '- Portal source backup: customize/backups/portal_flat11_* / business_menu_flat11_*',
    '- App91 files: files/app91/',
    '- Re-upload previous portal_business_banners_* via system customize',
    '- Re-upload previous App91 customize from files/app91/',
    '',
  ].join('\n'));

  console.log(JSON.stringify({ ok: report.ok, portalOk, appOk, workDir: WORK_DIR }, null, 2));
  if (!report.ok) process.exit(1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
