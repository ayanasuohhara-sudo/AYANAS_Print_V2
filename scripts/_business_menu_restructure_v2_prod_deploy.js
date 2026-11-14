'use strict';

/**
 * AYANASU 業務メニュー再構成 v2 + 共通ナビ — 本番反映（承認済み）
 *
 * - App91/90/87/86 + ポータルバナー
 * - App16 等の app_nav_banner 表記統一（既存業務 JS は fileKey から再アップロード）
 * - App89/92/94/98 への hub_nav 展開はしない
 * - App87 は 1.6.1 ベースの 1.8.0（1.7.0 入金リンク未混入）
 *
 *   node scripts/_business_menu_restructure_v2_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'business_menu_restructure_v2_prod_' + STAMP);
fs.mkdirSync(path.join(WORK_DIR, 'files'), { recursive: true });

const HUB_APPS = {
  91: {
    js: [
      'hub_nav_config.js',
      'hub_nav.js',
      'business_menu_config.js',
      'business_menu_desktop.js',
    ],
    css: ['hub_nav.css', 'business_menu.css'],
    expect: { global: 'CAYANAS_BUSINESS_MENU_VERSION', ver: '2.0.0' },
  },
  90: {
    js: [
      'hub_nav_config.js',
      'hub_nav.js',
      'factory_menu_config.js',
      'factory_menu_desktop.js',
    ],
    css: ['hub_nav.css', 'factory_menu.css'],
    expect: { global: 'CAYANAS_FACTORY_MENU_VERSION', ver: '2.0.0' },
  },
  87: {
    js: [
      'work_status_labels.js',
      'hub_nav_config.js',
      'hub_nav.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['hub_nav.css', 'floor_portal.css'],
    expect: { global: 'CAYANAS_FLOOR_PORTAL_VERSION', ver: '1.8.0' },
  },
  86: {
    js: [
      'work_status_labels.js',
      'hub_nav_config.js',
      'hub_nav.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['hub_nav.css', 'floor_portal.css'],
    expect: { global: 'CAYANAS_FLOOR_PORTAL_VERSION', ver: '1.8.0' },
  },
};

const NAV_APPS = [16, 19, 27, 30, 34, 35, 78, 84, 88];
const NAV_JS = ['app_nav_banner_config.js', 'app_nav_banner.js'];
const NAV_CSS = ['app_nav_banner.css'];
const NAV_EXPECT = '1.3.0';

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

async function backupAppCustomize(appId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  const meta = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      return await api('/k/v1/app/customize.json', 'GET', { app: ${appId} });
    })()`,
  });
  const value = meta.result && meta.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'before_app' + appId + '_customize.json'), JSON.stringify(value, null, 2));

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
  if (!Array.isArray(files)) throw new Error('backup download failed app ' + appId);
  const dir = path.join(WORK_DIR, 'files', 'app' + appId);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files) {
    fs.writeFileSync(path.join(dir, f.name), Buffer.from(f.b64, 'base64'));
  }
  return { appId, count: files.length, names: files.map((f) => f.name) };
}

async function deployHubApp(appId) {
  const spec = HUB_APPS[appId];
  const filesMap = {};
  for (const n of spec.js.concat(spec.css)) filesMap[n] = readCustomize(n);
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
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type: type || 'application/octet-stream' });
        }
        async function uploadFile(blob, name) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, name);
          const bodyText = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('net'));
            xhr.send(fd);
          });
          const json = JSON.parse(bodyText);
          if (!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const desktop = { js: [], css: [] };
        for (const name of jsOrder) {
          desktop.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        for (const name of cssOrder) {
          desktop.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
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

async function deployPortalBanners() {
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
          update,
          beforeScripts: ((before.json && before.json.result && before.json.result.scripts) || [])
            .map((s) => s.name),
          afterScripts: ((after.json && after.json.result && after.json.result.scripts) || [])
            .map((s) => s.name),
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function updateNavApp(appId) {
  // Use backed-up files from WORK_DIR/files/app{id}, replace only app_nav_banner_*
  const dir = path.join(WORK_DIR, 'files', 'app' + appId);
  const meta = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'before_app' + appId + '_customize.json'), 'utf8'));
  const jsList = ((meta.desktop || {}).js || []);
  const cssList = ((meta.desktop || {}).css || []);

  const filesMap = {};
  for (const item of jsList) {
    if (item.type !== 'FILE' || !item.file || !item.file.name) continue;
    const name = item.file.name;
    if (/^app_nav_banner/.test(name)) {
      filesMap[name] = readCustomize(name);
    } else {
      filesMap[name] = fs.readFileSync(path.join(dir, name));
    }
  }
  for (const item of cssList) {
    if (item.type !== 'FILE' || !item.file || !item.file.name) continue;
    const name = item.file.name;
    if (/^app_nav_banner/.test(name)) {
      filesMap[name] = readCustomize(name);
    } else {
      filesMap[name] = fs.readFileSync(path.join(dir, name));
    }
  }
  // ensure nav files exist even if somehow missing
  for (const n of NAV_JS.concat(NAV_CSS)) {
    if (!filesMap[n]) filesMap[n] = readCustomize(n);
  }

  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${appId};
        const meta = ${JSON.stringify({
          scope: meta.scope || 'ALL',
          js: jsList.map((x) => ({ type: x.type, name: x.file && x.file.name, url: x.url || null })),
          css: cssList.map((x) => ({ type: x.type, name: x.file && x.file.name, url: x.url || null })),
          mobile: meta.mobile || { js: [], css: [] },
        })};
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();
        function b64ToBlob(b64, type) {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type: type || 'application/octet-stream' });
        }
        async function uploadFile(blob, name) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, name);
          const bodyText = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.onload = () => resolve(xhr.responseText);
            xhr.onerror = () => reject(new Error('net'));
            xhr.send(fd);
          });
          const json = JSON.parse(bodyText);
          if (!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const desktop = { js: [], css: [] };
        // ensure nav files first if present in map
        const navJs = ${JSON.stringify(NAV_JS)};
        const navCss = ${JSON.stringify(NAV_CSS)};
        const seenJs = {};
        for (const name of navJs) {
          if (files[name]) {
            desktop.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
            seenJs[name] = true;
          }
        }
        for (const item of meta.js) {
          if (item.type === 'URL') {
            desktop.js.push({ type: 'URL', url: item.url });
            continue;
          }
          if (!item.name || seenJs[item.name] || /^app_nav_banner/.test(item.name)) continue;
          desktop.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[item.name], 'text/javascript'), item.name) } });
        }
        const seenCss = {};
        for (const name of navCss) {
          if (files[name]) {
            desktop.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
            seenCss[name] = true;
          }
        }
        for (const item of meta.css) {
          if (item.type === 'URL') {
            desktop.css.push({ type: 'URL', url: item.url });
            continue;
          }
          if (!item.name || seenCss[item.name] || /^app_nav_banner/.test(item.name)) continue;
          desktop.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[item.name], 'text/css'), item.name) } });
        }
        // mobile: re-upload from backup if files exist; else keep empty URL-only
        const mobile = { js: [], css: [] };
        for (const item of (meta.mobile.js || [])) {
          if (item.type === 'URL') mobile.js.push({ type: 'URL', url: item.url });
          else if (item.file && item.file.name && files[item.file.name]) {
            mobile.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[item.file.name], 'text/javascript'), item.file.name) } });
          }
        }
        for (const item of (meta.mobile.css || [])) {
          if (item.type === 'URL') mobile.css.push({ type: 'URL', url: item.url });
          else if (item.file && item.file.name && files[item.file.name]) {
            mobile.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[item.file.name], 'text/css'), item.file.name) } });
          }
        }
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: meta.scope || 'ALL',
          desktop,
          mobile,
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
          ok: last && last.status === 'SUCCESS',
          deploy: last,
          js: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          css: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name),
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
  const out = {};

  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/#/portal`);
    await new Promise((r) => setTimeout(r, 3500));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION || null,
        labels: [...document.querySelectorAll('.ayanas-pbb-item__label')].map((el) => el.textContent.trim()),
        hubs: [...document.querySelectorAll('.ayanas-pbb-item--hub .ayanas-pbb-item__label')].map((el) => el.textContent.trim()),
        firstHref: (document.querySelector('a.ayanas-pbb-item') || {}).href || null
      }))()`,
    });
    out.portal = r.result && r.result.value;
    await page.close();
  }

  async function hubCheck(appId, expectVer, activeLabel) {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
    await new Promise((r) => setTimeout(r, 3500));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const nav = document.querySelector('.cayan-hub-nav');
        const btns = [...document.querySelectorAll('.cayan-hub-nav__btn')].map((el) => ({
          text: el.textContent.trim(),
          active: el.classList.contains('is-active') || el.getAttribute('aria-current') === 'page',
          href: el.getAttribute('href') || null,
          tag: el.tagName
        }));
        const storePaymentLink = [...document.querySelectorAll('a')].some((a) => /入金登録/.test(a.textContent || '') && /\\/k\\/97\\//.test(a.getAttribute('href') || ''));
        const nyuko17 = (document.body.innerText || '').indexOf('入金状況（受注一覧）') !== -1;
        return {
          appId: kintone.app.getId(),
          bm: window.CAYANAS_BUSINESS_MENU_VERSION || null,
          fm: window.CAYANAS_FACTORY_MENU_VERSION || null,
          fp: window.CAYANAS_FLOOR_PORTAL_VERSION || null,
          hub: window.CAYANAS_HUB_NAV_VERSION || null,
          hasNav: !!nav,
          btns,
          activeText: (btns.find((b) => b.active) || {}).text || null,
          expectVer: ${JSON.stringify(expectVer)},
          activeOk: (btns.find((b) => b.active) || {}).text === ${JSON.stringify(activeLabel)},
          storePaymentLink,
          nyuko17,
          cats: (window.CAYANAS_BUSINESS_MENU && CAYANAS_BUSINESS_MENU.CATEGORIES || []).map((c) => c.id),
          has98: !!(window.CAYANAS_FACTORY_MENU && (CAYANAS_FACTORY_MENU.SECTIONS || []).some((s) => (s.items || []).some((i) => i.appId === 98)))
        };
      })()`,
    });
    // viewport shots
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(WORK_DIR, 'shot_app' + appId + '.png'), Buffer.from(shot.data, 'base64'));
    // mobile emulation
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    });
    await new Promise((r) => setTimeout(r, 500));
    const shotM = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(WORK_DIR, 'shot_app' + appId + '_mobile.png'), Buffer.from(shotM.data, 'base64'));
    await page.send('Emulation.clearDeviceMetricsOverride');
    await page.close();
    return r.result && r.result.value;
  }

  out.app91 = await hubCheck(91, '2.0.0', 'TOP');
  out.app87 = await hubCheck(87, '1.8.0', '店舗');
  out.app90 = await hubCheck(90, '2.0.0', '工場');
  out.app86 = await hubCheck(86, '1.8.0', '工場');

  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/16/`);
    await new Promise((r) => setTimeout(r, 3500));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: (window.CAYANAS_APP_NAV && CAYANAS_APP_NAV.VERSION) || null,
        hubs: [...document.querySelectorAll('.ayanas-app-nav__hub')].map((el) => el.textContent.trim()),
        hasBanner: !!document.getElementById('ayanas-app-nav-banner')
      }))()`,
    });
    out.app16 = r.result && r.result.value;
    const shot = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(WORK_DIR, 'shot_app16.png'), Buffer.from(shot.data, 'base64'));
    await page.close();
  }

  // click nav hops from 91
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/91/`);
    await new Promise((r) => setTimeout(r, 3000));
    const hop = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const store = document.querySelector('.cayan-hub-nav__btn[href*="/k/87/"]');
        if (!store) return { ok: false, reason: 'no store link' };
        store.click();
        await new Promise((r) => setTimeout(r, 4000));
        return {
          ok: /\\/k\\/87\\//.test(location.href),
          href: location.href,
          active: (document.querySelector('.cayan-hub-nav__btn.is-active, .cayan-hub-nav__btn[aria-current="page"]') || {}).textContent || null,
          hubVer: window.CAYANAS_HUB_NAV_VERSION || null,
          fp: window.CAYANAS_FLOOR_PORTAL_VERSION || null
        };
      })()`,
    });
    out.hop91to87 = hop.result && hop.result.value;
    await page.close();
  }

  return out;
}

(async () => {
  // Guard: refuse if floor config still has unapproved 1.7.0 payment strings
  const floorSrc = fs.readFileSync(path.join(ROOT, 'customize/floor_portal_config.js'), 'utf8');
  if (floorSrc.indexOf('入金状況（受注一覧）') !== -1 || floorSrc.indexOf("label: '入金登録'") !== -1) {
    throw new Error('Refusing deploy: floor_portal_config contains unapproved payment menu strings');
  }
  if (floorSrc.indexOf("FLOOR_PORTAL_VERSION = '1.8.0'") === -1) {
    throw new Error('Refusing deploy: expected floor portal 1.8.0');
  }

  const report = { stamp: STAMP, workDir: WORK_DIR, steps: {} };
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), [
    '# Rollback',
    '',
    '本番反映前の customize メタとファイル実体をこのディレクトリに保存しています。',
    '',
    '- `before_app{ID}_customize.json` … 反映前メタ',
    '- `files/app{ID}/` … 反映前ファイル実体',
    '',
    '復旧時は各アプリのデスクトップ JS/CSS をバックアップ内容で再アップロードし、deploy してください。',
    'ポータルは beforeScripts（deploy 結果 JSON）を参照。',
    '',
  ].join('\n'));

  console.log('0) Backup prod customize files');
  report.steps.backup = {};
  for (const appId of [91, 90, 87, 86].concat(NAV_APPS)) {
    console.log('  backup', appId);
    report.steps.backup[appId] = await backupAppCustomize(appId);
  }
  fs.writeFileSync(path.join(WORK_DIR, 'backup.json'), JSON.stringify(report.steps.backup, null, 2));

  console.log('1) Portal banners 2.0.0');
  report.steps.portal = await deployPortalBanners();
  fs.writeFileSync(path.join(WORK_DIR, 'portal.json'), JSON.stringify(report.steps.portal, null, 2));
  if (!report.steps.portal.ok) throw new Error('portal deploy failed');

  console.log('2) Hub apps 91/90/87/86');
  report.steps.hubs = {};
  for (const appId of [91, 90, 87, 86]) {
    console.log('  deploy hub', appId);
    report.steps.hubs[appId] = await deployHubApp(appId);
    if (!report.steps.hubs[appId].ok) throw new Error('hub deploy failed ' + appId + ' ' + JSON.stringify(report.steps.hubs[appId]));
  }
  fs.writeFileSync(path.join(WORK_DIR, 'hubs.json'), JSON.stringify(report.steps.hubs, null, 2));

  console.log('3) Update app_nav_banner on operational apps');
  report.steps.nav = {};
  for (const appId of NAV_APPS) {
    console.log('  nav', appId);
    report.steps.nav[appId] = await updateNavApp(appId);
    if (!report.steps.nav[appId].ok) throw new Error('nav deploy failed ' + appId + ' ' + JSON.stringify(report.steps.nav[appId]));
  }
  fs.writeFileSync(path.join(WORK_DIR, 'nav.json'), JSON.stringify(report.steps.nav, null, 2));

  console.log('4) Verify');
  report.verify = await verify();
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(report.verify, null, 2));

  // copy key shots to artifacts
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  for (const name of ['shot_app91.png', 'shot_app87.png', 'shot_app90.png', 'shot_app86.png', 'shot_app16.png', 'shot_app91_mobile.png']) {
    const src = path.join(WORK_DIR, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join('/opt/cursor/artifacts', 'menu_v2_' + name));
  }

  const v = report.verify;
  const ok = !!(
    v.portal && v.portal.ver === '2.0.0'
    && (v.portal.hubs || []).includes('店舗ポータル')
    && (v.portal.hubs || []).includes('工場ポータル')
    && v.app91 && v.app91.bm === '2.0.0' && v.app91.hub === '1.0.0' && v.app91.activeOk
    && v.app87 && v.app87.fp === '1.8.0' && v.app87.activeOk && !v.app87.storePaymentLink && !v.app87.nyuko17
    && v.app90 && v.app90.fm === '2.0.0' && v.app90.activeOk && v.app90.has98
    && v.app86 && v.app86.fp === '1.8.0' && v.app86.activeOk
    && v.app16 && v.app16.ver === NAV_EXPECT
    && (v.app16.hubs || []).includes('TOP')
    && (v.app16.hubs || []).includes('店舗')
    && (v.app16.hubs || []).includes('工場')
    && v.hop91to87 && v.hop91to87.ok
  );
  report.ok = ok;
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok,
    portal: v.portal,
    app91: { bm: v.app91 && v.app91.bm, active: v.app91 && v.app91.activeText, hub: v.app91 && v.app91.hub },
    app87: { fp: v.app87 && v.app87.fp, active: v.app87 && v.app87.activeText, no97: v.app87 && !v.app87.storePaymentLink },
    app90: { fm: v.app90 && v.app90.fm, active: v.app90 && v.app90.activeText, has98: v.app90 && v.app90.has98 },
    app86: { fp: v.app86 && v.app86.fp, active: v.app86 && v.app86.activeText },
    app16: v.app16,
    hop: v.hop91to87,
    workDir: WORK_DIR,
  }, null, 2));
  if (!ok) process.exit(2);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
