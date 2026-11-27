'use strict';

/**
 * Probe live portal banners + system customize APIs + app_nav presence.
 *   node scripts/_portal_hub_nav_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const OUT = path.join(
  '/workspace/customize/backups',
  'portal_hub_nav_probe_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json'
);

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
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 180000);
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

async function main() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/#/portal`);
  await new Promise((r) => setTimeout(r, 2500));
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const token = kintone.getRequestToken();
      const out = {
        url: location.href,
        portalVer: window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION || null,
        portalTitle: (window.CAYANAS_PORTAL_BUSINESS_BANNERS && window.CAYANAS_PORTAL_BUSINESS_BANNERS.TITLE) || null,
        portalLead: (window.CAYANAS_PORTAL_BUSINESS_BANNERS && window.CAYANAS_PORTAL_BUSINESS_BANNERS.LEAD) || null,
        portalCats: ((window.CAYANAS_PORTAL_BUSINESS_BANNERS && window.CAYANAS_PORTAL_BUSINESS_BANNERS.CATEGORIES) || []).map((c) => ({
          no: c.no, label: c.label, hub: !!c.hub, mode: c.mode, appId: c.appId || null, cat: c.cat || null
        })),
        portalLabels: [...document.querySelectorAll('.ayanas-pbb-item__label')].map((el) => el.textContent.trim()),
        systemTries: [],
        apps: {}
      };

      async function tryFetch(path, body) {
        try {
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
          return { path, status: r.status, ok: r.ok, sample: text.slice(0, 800), keys: json ? Object.keys(json) : null, jsonPreview: json };
        } catch (e) {
          return { path, error: e.message || String(e) };
        }
      }

      out.systemTries.push(await tryFetch('/k/api/js/getSystemSetting.json', {}));
      out.systemTries.push(await tryFetch('/k/api/js/getSystemSetting.json', { includeFilesContent: false }));

      // also GET-style via form
      try {
        const r = await fetch('/k/api/js/getSystemSetting.json', {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: '__REQUEST_TOKEN__=' + encodeURIComponent(token)
        });
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        out.systemTries.push({ path: 'form-urlencoded getSystemSetting', status: r.status, sample: text.slice(0, 1200), keys: json ? Object.keys(json) : null, json });
      } catch (e) {
        out.systemTries.push({ path: 'form-urlencoded getSystemSetting', error: e.message || String(e) });
      }

      for (const app of [16, 19, 27, 30, 34, 35, 78, 84, 86, 87, 88, 90, 91]) {
        try {
          const c = await api('/k/v1/app/customize.json', 'GET', { app });
          const js = ((c.desktop || {}).js || []).map((x) => (x.file && x.file.name) || (x.url || null));
          const css = ((c.desktop || {}).css || []).map((x) => (x.file && x.file.name) || (x.url || null));
          out.apps[app] = {
            scope: c.scope,
            js,
            css,
            hasNav: js.some((n) => /app_nav/.test(String(n || ''))),
            versionsHint: js.filter((n) => /business_menu|factory_menu|floor_portal|app_nav|portal_business/.test(String(n || '')))
          };
        } catch (e) {
          out.apps[app] = { error: e.message || String(e) };
        }
      }
      return out;
    })()`,
  });
  const value = result && result.result && result.result.value;
  fs.writeFileSync(OUT, JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
  console.log('wrote', OUT);
  await page.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
