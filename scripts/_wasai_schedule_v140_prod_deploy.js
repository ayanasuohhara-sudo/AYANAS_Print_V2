'use strict';

/**
 * App98 和裁士カレンダー v1.4.0 を本番 customize へ反映。
 * セル表示を「出庫中」件数 → 顧客名/お客様名/商品名 に変更。
 * CDP Chrome :9399 前提。
 * node scripts/_wasai_schedule_v140_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/agent/repos/AYANAS_Print_V2';
const SUB = 'o5nppg7kb4ly';
const HOST_APP = 98;
const CDP_PORT = 9399;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'wasai_schedule_v140_' + STAMP);
const ART_DIR = '/opt/cursor/artifacts/wasai_schedule_v140';
const CUSTOMIZE_CSS = ['wasai_schedule.css'];
const CUSTOMIZE_JS = [
  'wasai_schedule_config.js',
  'wasai_schedule_engine.js',
  'wasai_schedule_desktop.js',
];

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => {
        d += c;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (e) {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
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
        const msg = JSON.parse(raw.toString());
        if (msg.id === i) {
          clearTimeout(t);
          ws.off('message', h);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    id: page.id,
    send,
    close: async () => {
      try {
        ws.close();
      } catch (_) { /* ignore */ }
      try {
        await httpJson('/json/close/' + page.id);
      } catch (_) { /* ignore */ }
    },
  };
}

function evalValue(resp) {
  return (resp.result && resp.result.result && resp.result.result.value)
    || (resp.result && resp.result.value);
}

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__SP_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.from(buf).toString('base64');
    const chunk = 80000;
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += chunk) {
      const part = b64.slice(i, i + chunk);
      await send('Runtime.evaluate', {
        expression: `window.__SP_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=window.__SP_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

(async () => {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(ART_DIR, { recursive: true });

  const filesMap = {};
  for (const name of CUSTOMIZE_CSS.concat(CUSTOMIZE_JS)) {
    const buf = fs.readFileSync(path.join(ROOT, 'customize', name));
    filesMap[name] = buf;
    fs.writeFileSync(path.join(WORK_DIR, name), buf);
  }

  const page = await openPage(`https://${SUB}.cybozu.com/k/${HOST_APP}/`);
  await new Promise((r) => setTimeout(r, 3500));
  await pushFilesToPage(page.send, filesMap);

  const deploy = evalValue(await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${HOST_APP};
        const CSS = ${JSON.stringify(CUSTOMIZE_CSS)};
        const JS = ${JSON.stringify(CUSTOMIZE_JS)};
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
        // backup current names
        const before = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const desktop = { js: [], css: [] };
        for (const name of CSS) {
          desktop.css.push({
            type: 'FILE',
            file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) },
          });
        }
        for (const name of JS) {
          desktop.js.push({
            type: 'FILE',
            file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) },
          });
        }
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: 'ALL',
          desktop,
          mobile: { js: [], css: [] },
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
          ok: !!(last && last.status === 'SUCCESS'),
          deploy: last,
          beforeJs: ((before.desktop && before.desktop.js) || []).map((i) => i.file && i.file.name),
          js: names('js'),
          css: names('css'),
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  }));

  fs.writeFileSync(path.join(WORK_DIR, 'deploy.json'), JSON.stringify(deploy, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'deploy.json'), JSON.stringify(deploy, null, 2));
  console.log('DEPLOY', JSON.stringify(deploy, null, 2));

  // hard reload + verify version + cell item markup
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 6000));

  const verify = evalValue(await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const root = document.querySelector('.cayan-ws-root');
      const html = root ? root.innerHTML : (document.body && document.body.innerText || '').slice(0, 500);
      const version = (window.CAYANAS_WASAI_SCHEDULE && CAYANAS_WASAI_SCHEDULE.VERSION) || null;
      const items = root ? root.querySelectorAll('.cayan-ws-item').length : 0;
      const hasOutboundLabel = root ? /出庫中\\s*<strong>|cayan-ws-count/.test(root.innerHTML) === false
        || root.querySelectorAll('.cayan-ws-item').length > 0 : false;
      // select first wasai if needed and wait
      const sel = document.querySelector('#cayan-ws-wasai');
      if (sel && sel.options && sel.options.length > 1 && !sel.value) {
        sel.value = sel.options[1].value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 4000));
      } else if (sel && sel.value) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      const root2 = document.querySelector('.cayan-ws-root');
      const sample = root2
        ? Array.from(root2.querySelectorAll('.cayan-ws-item')).slice(0, 8).map((el) => el.textContent)
        : [];
      return {
        version: (window.CAYANAS_WASAI_SCHEDULE && CAYANAS_WASAI_SCHEDULE.VERSION) || version,
        hasRoot: !!root2,
        itemCount: root2 ? root2.querySelectorAll('.cayan-ws-item').length : items,
        sample,
        hasOldCountChip: root2
          ? Array.from(root2.querySelectorAll('.cayan-ws-count')).some((el) => /出庫中/.test(el.textContent || ''))
          : null,
        snippet: (root2 && root2.innerText || html || '').slice(0, 400),
      };
    })()`,
  }));

  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.result.data, 'base64');
  fs.writeFileSync(path.join(WORK_DIR, 'calendar.png'), buf);
  fs.writeFileSync(path.join(ART_DIR, 'calendar.png'), buf);
  fs.writeFileSync('/opt/cursor/artifacts/wasai_schedule_v140_calendar.png', buf);

  const out = {
    ok: !!(deploy && deploy.ok && verify && verify.version === '1.4.0'),
    deploy,
    verify,
    at: new Date().toISOString(),
    work: WORK_DIR,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'verify.json'), JSON.stringify(out, null, 2));
  console.log('FINAL', JSON.stringify(out, null, 2));
  await page.close();
  if (!out.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
