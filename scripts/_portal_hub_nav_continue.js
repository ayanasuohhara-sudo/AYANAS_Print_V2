'use strict';

/**
 * Continue app_nav prepend for remaining apps + full verify.
 *   node scripts/_portal_hub_nav_continue.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'portal_hub_nav_continue_' + STAMP);
const REMAINING = [27, 30, 34, 35, 78, 84, 88];
const NAV_JS = ['app_nav_banner_config.js', 'app_nav_banner.js'];
const NAV_CSS = ['app_nav_banner.css'];

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

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__SP_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', { expression: `window.__SP_FILES[${JSON.stringify(name)}]=[]; true` });
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

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

async function prependNavToApp(appId) {
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

  const keepJsNames = meta.js.filter((x) => x.type === 'FILE' && x.name && !/^app_nav_banner/.test(x.name)).map((x) => x.name);
  const keepCssNames = meta.css.filter((x) => x.type === 'FILE' && x.name && !/^app_nav_banner/.test(x.name)).map((x) => x.name);
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
  if (missing.length) return { ok: false, error: 'missing local files: ' + missing.join(', ') };

  const filesMap = {};
  for (const n of NAV_JS.concat(NAV_CSS).concat(keepJsNames).concat(keepCssNames).concat(mobileJsNames).concat(mobileCssNames)) {
    filesMap[n] = readLocal(n);
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
        const newJs = [];
        for (const name of NAV_JS) newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        for (const name of keepJsNames) newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        for (const item of urlJs) newJs.push({ type: 'URL', url: item.url });
        const newCss = [];
        for (const name of NAV_CSS) newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        for (const name of keepCssNames) newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        for (const item of urlCss) newCss.push({ type: 'URL', url: item.url });
        const mobileJs = [];
        for (const name of mobileJsNames) mobileJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        for (const item of mobileUrlJs) mobileJs.push({ type: 'URL', url: item.url });
        const mobileCss = [];
        for (const name of mobileCssNames) mobileCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
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
  return (result && result.result && result.result.value) || { ok: false, error: 'empty' };
}

async function verifyAll() {
  const out = {};
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
        hrefs: [...document.querySelectorAll('a.ayanas-pbb-item')].slice(0, 4).map((a) => ({
          label: ((a.querySelector('.ayanas-pbb-item__label') || {}).textContent || '').trim(),
          href: a.getAttribute('href')
        }))
      }))()`,
    });
    out.portal = result.result && result.result.value;
    await page.close();
  }
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/91/?cat=order`);
    await new Promise((r) => setTimeout(r, 3000));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_BUSINESS_MENU_VERSION || null,
        hubs: [...document.querySelectorAll('.cayan-bm-hub')].map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') }))
      }))()`,
    });
    out.app91 = result.result && result.result.value;
    await page.close();
  }
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
  const nav = {};
  for (const appId of REMAINING) {
    console.log('nav app', appId);
    nav[appId] = await prependNavToApp(appId);
    console.log(JSON.stringify({ appId, ok: nav[appId].ok, error: nav[appId].error, desktopJs: nav[appId].desktopJs }, null, 2));
    if (!nav[appId].ok) throw new Error('nav deploy failed app ' + appId);
  }
  fs.writeFileSync(path.join(WORK_DIR, 'nav_remaining.json'), JSON.stringify(nav, null, 2));
  console.log('verify...');
  const verify = await verifyAll();
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(verify, null, 2));
  const ok =
    verify.portal &&
    verify.portal.ver === '1.1.0' &&
    (verify.portal.hubs || []).includes('工場ポータル（業務）') &&
    (verify.portal.hubs || []).includes('店舗ポータル（業務）') &&
    verify.app91 &&
    verify.app91.ver === '1.2.0' &&
    (verify.app91.hubs || []).some((h) => /工場業務/.test(h.text)) &&
    (verify.app91.hubs || []).some((h) => /店舗業務/.test(h.text)) &&
    verify.app90 &&
    verify.app90.ver === '1.2.0' &&
    verify.app16 &&
    verify.app16.ver === '1.2.0' &&
    (verify.app16.hubTexts || []).includes('AYANAS 業務メニュー') &&
    (verify.app16.hubTexts || []).includes('工場業務メニュー') &&
    (verify.app16.hubTexts || []).includes('店舗業務メニュー');
  const report = { ok: !!ok, nav, verify };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, verify }, null, 2));
  console.log('wrote', WORK_DIR);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
