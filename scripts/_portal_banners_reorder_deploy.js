'use strict';

/**
 * Reorder portal business banners (factory/store → 09/10) and deploy system customize.
 *   node scripts/_portal_banners_reorder_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'portal_banners_reorder_' + STAMP);
const EXPECT_VER = '1.1.1';

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
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 300000);
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

async function deploy() {
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
          updateSample: update.text && update.text.slice(0, 400),
          after: after.json && after.json.result,
          keys: { kConfig, kJs, kCss }
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verify() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/#/portal`);
  await new Promise((r) => setTimeout(r, 4000));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const items = [...document.querySelectorAll('.ayanas-pbb-item')].map((el) => ({
        no: ((el.querySelector('.ayanas-pbb-item__no') || {}).textContent || '').trim(),
        label: ((el.querySelector('.ayanas-pbb-item__label') || {}).textContent || '').trim(),
        hub: el.classList.contains('ayanas-pbb-item--hub'),
        href: el.getAttribute('href') || null
      }));
      return {
        ver: window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION || null,
        items
      };
    })()`,
  });
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await page.close();
  return {
    verify: result.result && result.result.value,
    screenshotB64: shot && shot.data,
  };
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  console.log('deploy...');
  const deployed = await deploy();
  fs.writeFileSync(path.join(WORK_DIR, 'deploy.json'), JSON.stringify(deployed, null, 2));
  if (!deployed || !deployed.ok) throw new Error('deploy failed ' + JSON.stringify(deployed));

  console.log('verify...');
  const { verify: v, screenshotB64 } = await verify();
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(v, null, 2));
  if (screenshotB64) {
    const art = '/opt/cursor/artifacts/portal-hub-nav';
    fs.mkdirSync(art, { recursive: true });
    fs.writeFileSync(path.join(art, '05_portal_menu_09_10.png'), Buffer.from(screenshotB64, 'base64'));
    fs.writeFileSync(path.join(WORK_DIR, 'portal.png'), Buffer.from(screenshotB64, 'base64'));
  }

  const labels = (v.items || []).map((i) => i.no + ':' + i.label);
  const ok =
    v.ver === EXPECT_VER &&
    v.items &&
    v.items.length === 10 &&
    v.items[0].label === '受注登録・検索' &&
    v.items[7].label === 'マスタ登録' &&
    v.items[8].no === '09' &&
    v.items[8].label === '工場ポータル（業務）' &&
    v.items[9].no === '10' &&
    v.items[9].label === '店舗ポータル（業務）';

  const report = { ok: !!ok, expectVer: EXPECT_VER, labels, verify: v, deployed };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, ver: v.ver, labels }, null, 2));
  console.log('wrote', WORK_DIR);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
