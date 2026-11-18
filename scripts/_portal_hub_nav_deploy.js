'use strict';

/**
 * ポータル業務メニュー最適化 + 各アプリ戻りナビ 本番反映
 *
 * - システム全体カスタマイズ: portal_business_banners v1.1.0
 *   （工場ポータル／店舗ポータルを 01/02 に追加）
 * - App91/90/86/87: ハブ戻りリンク付きメニュー／ポータル
 * - 日常業務アプリ: app_nav_banner v1.2.0 を先頭に追加
 *
 *   node scripts/_portal_hub_nav_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'portal_hub_nav_' + STAMP);

const HUB_APPS = {
  91: {
    js: ['business_menu_config.js', 'business_menu_desktop.js'],
    css: ['business_menu.css'],
    expectVerGlobal: 'CAYANAS_BUSINESS_MENU_VERSION',
    expectVer: '1.2.0',
    dir: 'customize',
  },
  90: {
    js: ['factory_menu_config.js', 'factory_menu_desktop.js'],
    css: ['factory_menu.css'],
    expectVerGlobal: 'CAYANAS_FACTORY_MENU_VERSION',
    expectVer: '1.2.0',
    dir: 'customize',
  },
  87: {
    js: [
      'work_status_labels.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['floor_portal.css'],
    expectVerGlobal: 'CAYANAS_FLOOR_PORTAL_VERSION',
    expectVer: '1.5.0',
    dir: 'customize',
  },
  86: {
    js: [
      'work_status_labels.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['floor_portal.css'],
    expectVerGlobal: 'CAYANAS_FLOOR_PORTAL_VERSION',
    expectVer: '1.5.0',
    dir: 'customize',
  },
};

/** app_nav を先頭追加する日常業務アプリ */
const NAV_APPS = [16, 19, 27, 30, 34, 35, 78, 84, 88];
const NAV_JS = ['app_nav_banner_config.js', 'app_nav_banner.js'];
const NAV_CSS = ['app_nav_banner.css'];
const NAV_EXPECT = '1.2.0';

const PORTAL_FILES = {
  'portal_business_banners_config.js': path.join(ROOT, 'portal-customize/portal_business_banners_config.js'),
  'portal_business_banners.js': path.join(ROOT, 'portal-customize/portal_business_banners.js'),
  'portal_business_banners.css': path.join(ROOT, 'portal-customize/portal_business_banners.css'),
};

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
    id: page.id,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id, 'GET');
      } catch (_) {}
    },
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
      const part = b64.slice(i, i + CHUNK);
      await send('Runtime.evaluate', {
        expression: `window.__SP_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=window.__SP_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

function readLocal(relDir, name) {
  return fs.readFileSync(path.join(ROOT, relDir, name));
}

async function deploySystemPortal() {
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
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
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
            body: fd
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
              'Content-Type': 'application/json; charset=UTF-8'
            },
            body: JSON.stringify(Object.assign({ __REQUEST_TOKEN__: token }, body || {}))
          });
          const text = await r.text();
          let json = null;
          try { json = JSON.parse(text); } catch (_) {}
          return { status: r.status, text, json };
        }

        const before = await post('/k/api/js/getSystemSetting.json', {});
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
            { jsType: 'MOBILE_CSS', fileKeys: [] }
          ]
        });

        const after = await post('/k/api/js/getSystemSetting.json', {});
        return {
          ok: !!(update.json && update.json.success),
          update,
          before: before.json && before.json.result,
          after: after.json && after.json.result,
          keys: { kConfig, kJs, kCss }
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  const value = result && result.result && result.result.value;
  if (!value) throw new Error('system portal deploy empty');
  return value;
}

async function deployHubApp(appId) {
  const spec = HUB_APPS[appId];
  const filesMap = {};
  for (const n of spec.js.concat(spec.css)) filesMap[n] = readLocal(spec.dir, n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${appId};
        const jsOrder = ${JSON.stringify(spec.js)};
        const cssOrder = ${JSON.stringify(spec.css)};
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();
        function b64ToBlob(b64, type) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, filename);
          const bodyText = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('upload network error'));
            xhr.send(fd);
          });
          const json = JSON.parse(bodyText);
          if (!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const keys = {};
        for (const name of jsOrder) keys[name] = await uploadFile(b64ToBlob(files[name], 'text/javascript'), name);
        for (const name of cssOrder) keys[name] = await uploadFile(b64ToBlob(files[name], 'text/css'), name);
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop: {
            js: jsOrder.map((n) => ({ type: 'FILE', file: { fileKey: keys[n] } })),
            css: cssOrder.map((n) => ({ type: 'FILE', file: { fileKey: keys[n] } }))
          },
          mobile: current.mobile || { js: [], css: [] }
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
        return {
          ok: !!(last && last.status === 'SUCCESS'),
          deploy: last,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name)
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  const value = result && result.result && result.result.value;
  if (!value) throw new Error('hub deploy empty app ' + appId);
  return value;
}

async function prependNavToApp(appId) {
  // Discover current customize file names, then push local copies (prod fileKeys are not re-downloadable).
  const discoverPage = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  const discovered = await discoverPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const current = await api('/k/v1/app/customize.json', 'GET', { app: ${appId} });
      const mapFiles = (arr) => (arr || []).map((x) => ({
        type: x.type,
        name: (x.file && x.file.name) || null,
        url: x.url || null
      }));
      return {
        scope: current.scope || 'ALL',
        js: mapFiles((current.desktop || {}).js),
        css: mapFiles((current.desktop || {}).css),
        mobile: {
          js: mapFiles((current.mobile || {}).js),
          css: mapFiles((current.mobile || {}).css)
        }
      };
    })()`,
  });
  await discoverPage.close();
  const meta = discovered && discovered.result && discovered.result.value;
  if (!meta) throw new Error('discover failed app ' + appId);

  const keepJsNames = meta.js
    .filter((x) => x.type === 'FILE' && x.name && !/^app_nav_banner/.test(x.name))
    .map((x) => x.name);
  const keepCssNames = meta.css
    .filter((x) => x.type === 'FILE' && x.name && !/^app_nav_banner/.test(x.name))
    .map((x) => x.name);
  const urlJs = meta.js.filter((x) => x.type === 'URL');
  const urlCss = meta.css.filter((x) => x.type === 'URL');
  const mobileJsNames = ((meta.mobile && meta.mobile.js) || [])
    .filter((x) => x.type === 'FILE' && x.name)
    .map((x) => x.name);
  const mobileCssNames = ((meta.mobile && meta.mobile.css) || [])
    .filter((x) => x.type === 'FILE' && x.name)
    .map((x) => x.name);
  const mobileUrlJs = ((meta.mobile && meta.mobile.js) || []).filter((x) => x.type === 'URL');
  const mobileUrlCss = ((meta.mobile && meta.mobile.css) || []).filter((x) => x.type === 'URL');

  const missing = keepJsNames
    .concat(keepCssNames)
    .concat(mobileJsNames)
    .concat(mobileCssNames)
    .filter((n) => !fs.existsSync(path.join(ROOT, 'customize', n)));
  if (missing.length) {
    return { ok: false, error: 'missing local files: ' + missing.join(', '), keepJsNames, keepCssNames };
  }

  const filesMap = {};
  for (const n of NAV_JS.concat(NAV_CSS).concat(keepJsNames).concat(keepCssNames).concat(mobileJsNames).concat(mobileCssNames)) {
    filesMap[n] = readLocal('customize', n);
  }

  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${appId};
        const NAV_JS = ${JSON.stringify(NAV_JS)};
        const NAV_CSS = ${JSON.stringify(NAV_CSS)};
        const keepJsNames = ${JSON.stringify(keepJsNames)};
        const keepCssNames = ${JSON.stringify(keepCssNames)};
        const urlJs = ${JSON.stringify(urlJs)};
        const urlCss = ${JSON.stringify(urlCss)};
        const mobileJsNames = ${JSON.stringify(mobileJsNames)};
        const mobileCssNames = ${JSON.stringify(mobileCssNames)};
        const mobileUrlJs = ${JSON.stringify(mobileUrlJs)};
        const mobileUrlCss = ${JSON.stringify(mobileUrlCss)};
        const scope = ${JSON.stringify(meta.scope)};
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();
        function b64ToBlob(b64, type) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, filename);
          const bodyText = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('upload network error'));
            xhr.send(fd);
          });
          const json = JSON.parse(bodyText);
          if (!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }

        const names = ${JSON.stringify(meta.js.map((x) => x.name))};
        const already = names[0] === 'app_nav_banner_config.js' && names[1] === 'app_nav_banner.js';

        const newJs = [];
        for (const name of NAV_JS) {
          newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        for (const name of keepJsNames) {
          newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        for (const item of urlJs) newJs.push({ type: 'URL', url: item.url });

        const newCss = [];
        for (const name of NAV_CSS) {
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        }
        for (const name of keepCssNames) {
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        }
        for (const item of urlCss) newCss.push({ type: 'URL', url: item.url });

        const mobileJs = [];
        for (const name of mobileJsNames) {
          mobileJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        for (const item of mobileUrlJs) mobileJs.push({ type: 'URL', url: item.url });
        const mobileCss = [];
        for (const name of mobileCssNames) {
          mobileCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        }
        for (const item of mobileUrlCss) mobileCss.push({ type: 'URL', url: item.url });

        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope,
          desktop: { js: newJs, css: newCss },
          mobile: { js: mobileJs, css: mobileCss }
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
        return {
          ok: !!(last && last.status === 'SUCCESS'),
          alreadyHadNav: already,
          deploy: last,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name)
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  const value = result && result.result && result.result.value;
  if (!value) throw new Error('nav deploy empty app ' + appId);
  return value;
}

async function verifyAll() {
  const out = {};

  // portal
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/#/portal`);
    await new Promise((r) => setTimeout(r, 3500));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION || null,
        lead: (window.CAYANAS_PORTAL_BUSINESS_BANNERS && window.CAYANAS_PORTAL_BUSINESS_BANNERS.LEAD) || null,
        labels: [...document.querySelectorAll('.ayanas-pbb-item__label')].map((el) => el.textContent.trim()),
        hubs: [...document.querySelectorAll('.ayanas-pbb-item--hub .ayanas-pbb-item__label')].map((el) => el.textContent.trim()),
        hrefs: [...document.querySelectorAll('a.ayanas-pbb-item')].slice(0, 4).map((a) => ({ label: (a.querySelector('.ayanas-pbb-item__label')||{}).textContent, href: a.getAttribute('href') }))
      }))()`,
    });
    out.portal = result.result && result.result.value;
    await page.close();
  }

  // App91 hubs
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/91/?cat=order`);
    await new Promise((r) => setTimeout(r, 3000));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_BUSINESS_MENU_VERSION || null,
        hubs: [...document.querySelectorAll('.cayan-bm-hub')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') })),
        title: (window.CAYANAS_BUSINESS_MENU && window.CAYANAS_BUSINESS_MENU.TITLE) || null
      }))()`,
    });
    out.app91 = result.result && result.result.value;
    await page.close();
  }

  // App90 hubs
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/90/`);
    await new Promise((r) => setTimeout(r, 3000));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_FACTORY_MENU_VERSION || null,
        title: (window.CAYANAS_FACTORY_MENU && window.CAYANAS_FACTORY_MENU.TITLE) || null,
        hubs: [...document.querySelectorAll('.cayan-fm-hub')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
      }))()`,
    });
    out.app90 = result.result && result.result.value;
    await page.close();
  }

  // App87 hubs
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/87/`);
    await new Promise((r) => setTimeout(r, 3500));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_FLOOR_PORTAL_VERSION || null,
        hubs: [...document.querySelectorAll('.cayan-fp-hub')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
      }))()`,
    });
    out.app87 = result.result && result.result.value;
    await page.close();
  }

  // App16 nav
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/16/`);
    await new Promise((r) => setTimeout(r, 3500));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: (window.CAYANAS_APP_NAV && window.CAYANAS_APP_NAV.VERSION) || null,
        hubTexts: [...document.querySelectorAll('.ayanas-app-nav__hub')].map((el) => el.textContent.trim()),
        hasBanner: !!document.getElementById('ayanas-app-nav-banner')
      }))()`,
    });
    out.app16 = result.result && result.result.value;
    await page.close();
  }

  return out;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const report = { stamp: STAMP, steps: {} };

  console.log('1) Deploy system portal banners v1.1.0');
  report.steps.systemPortal = await deploySystemPortal();
  fs.writeFileSync(path.join(WORK_DIR, 'system_portal.json'), JSON.stringify(report.steps.systemPortal, null, 2));
  if (!report.steps.systemPortal.ok) throw new Error('system portal deploy failed');

  console.log('2) Deploy hub apps 91/90/87/86');
  report.steps.hubs = {};
  for (const appId of [91, 90, 87, 86]) {
    console.log('  app', appId);
    report.steps.hubs[appId] = await deployHubApp(appId);
    if (!report.steps.hubs[appId].ok) throw new Error('hub deploy failed app ' + appId);
  }
  fs.writeFileSync(path.join(WORK_DIR, 'hubs.json'), JSON.stringify(report.steps.hubs, null, 2));

  console.log('3) Prepend app_nav to operational apps');
  report.steps.nav = {};
  for (const appId of NAV_APPS) {
    console.log('  nav app', appId);
    report.steps.nav[appId] = await prependNavToApp(appId);
    if (!report.steps.nav[appId].ok) throw new Error('nav deploy failed app ' + appId);
  }
  fs.writeFileSync(path.join(WORK_DIR, 'nav.json'), JSON.stringify(report.steps.nav, null, 2));

  console.log('4) Verify');
  report.verify = await verifyAll();
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(report.verify, null, 2));

  const ok =
    report.verify.portal &&
    report.verify.portal.ver === '1.1.0' &&
    (report.verify.portal.hubs || []).includes('工場ポータル（業務）') &&
    (report.verify.portal.hubs || []).includes('店舗ポータル（業務）') &&
    report.verify.app91 &&
    report.verify.app91.ver === '1.2.0' &&
    (report.verify.app91.hubs || []).some((h) => /工場業務/.test(h.text)) &&
    (report.verify.app91.hubs || []).some((h) => /店舗業務/.test(h.text)) &&
    report.verify.app90 &&
    report.verify.app90.ver === '1.2.0' &&
    report.verify.app16 &&
    report.verify.app16.ver === NAV_EXPECT &&
    (report.verify.app16.hubTexts || []).includes('AYANAS 業務メニュー') &&
    (report.verify.app16.hubTexts || []).includes('工場業務メニュー') &&
    (report.verify.app16.hubTexts || []).includes('店舗業務メニュー');

  report.ok = !!ok;
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, verify: report.verify }, null, 2));
  console.log('wrote', WORK_DIR);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
