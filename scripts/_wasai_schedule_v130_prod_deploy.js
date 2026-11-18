'use strict';

/**
 * 和裁士入庫予定カレンダー v1.3.0 — App98 JS/CSS のみ更新
 * 納期負荷カレンダーと同仕様のセル／明細。軸は入庫予定日（return_date）。
 * App73/74/78/16/99 のフィールド・データは変更しない。
 *
 *   node scripts/_wasai_schedule_v130_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const HOST = 98;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'wasai_schedule_v130_prod_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const CUSTOMIZE_CSS = ['wasai_schedule.css'];
const CUSTOMIZE_JS = [
  'wasai_schedule_config.js',
  'wasai_schedule_engine.js',
  'wasai_schedule_desktop.js',
];

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('to ' + method)), 600000);
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
    if (s.result && s.result.value && s.result.value.hasK && !/login/i.test(s.result.value.url || '')) {
      break;
    }
  }
  return {
    send,
    id: page.id,
    close: async () => {
      try { await httpJson('/json/close/' + page.id); } catch (_) {}
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
      await send('Runtime.evaluate', {
        expression: `window.__SP_FILES[${JSON.stringify(name)}].push(${JSON.stringify(b64.slice(i, i + CHUNK))}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=window.__SP_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

(async () => {
  const filesMap = {};
  for (const name of CUSTOMIZE_CSS.concat(CUSTOMIZE_JS)) {
    filesMap[name] = fs.readFileSync(path.join(ROOT, 'customize', name));
  }

  // backup current customize metadata
  const backupPage = await openPage(`https://${SUB}.cybozu.com/k/${HOST}/`);
  const backup = await backupPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      return await api('/k/v1/app/customize.json', 'GET', { app: ${HOST} });
    })()`,
  });
  fs.writeFileSync(
    path.join(WORK_DIR, 'customize_before.json'),
    JSON.stringify(backup.result && backup.result.value, null, 2)
  );
  await backupPage.close();

  const page = await openPage(`https://${SUB}.cybozu.com/k/${HOST}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${HOST};
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
          desktop: desktop,
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
        return { ok: last && last.status === 'SUCCESS', deploy: last, js: names('js'), css: names('css') };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  console.log('customize', JSON.stringify(result.result && result.result.value, null, 2));
  fs.writeFileSync(
    path.join(WORK_DIR, 'deploy.json'),
    JSON.stringify(result.result && result.result.value, null, 2)
  );
  await page.close();
  if (!(result.result && result.result.value && result.result.value.ok)) process.exit(1);

  const page2 = await openPage(`https://${SUB}.cybozu.com/k/${HOST}/`);
  await new Promise((r) => setTimeout(r, 3000));
  const ver = await page2.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      await new Promise((r) => setTimeout(r, 2000));
      const root = document.getElementById('ayanas-wasai-schedule-root');
      const title = root && root.querySelector('.cayan-ws-title')
        ? root.querySelector('.cayan-ws-title').textContent : '';
      const lead = root && root.querySelector('.cayan-ws-lead')
        ? root.querySelector('.cayan-ws-lead').textContent : '';
      const counts = root ? root.querySelectorAll('.cayan-ws-count').length : 0;
      const cells = root ? root.querySelectorAll('.cayan-ws-cell[data-ymd]').length : 0;
      let detailOk = false;
      let groupTitle = '';
      const firstBusy = root && Array.from(root.querySelectorAll('.cayan-ws-cell[data-ymd]'))
        .find((el) => el.querySelector('.cayan-ws-count'));
      if (firstBusy) {
        firstBusy.click();
        await new Promise((r) => setTimeout(r, 400));
        const detail = root.querySelector('#cayan-ws-detail');
        detailOk = !!(detail && detail.querySelector('.cayan-ws-detail-count'));
        const gt = detail && detail.querySelector('.cayan-ws-group-title');
        groupTitle = gt ? gt.textContent : '';
      }
      return {
        hostId: kintone.app.getId(),
        version: window.CAYANAS_WASAI_SCHEDULE && CAYANAS_WASAI_SCHEDULE.VERSION,
        planApp: window.CAYANAS_WASAI_SCHEDULE && CAYANAS_WASAI_SCHEDULE.PLAN_APP_ID,
        title: title,
        leadHasNyuko: String(lead || '').indexOf('入庫予定') !== -1,
        uiMounted: !!root,
        cellCount: cells,
        countLineCount: counts,
        detailOk: detailOk,
        groupTitle: groupTitle,
        chipsGone: root ? root.querySelectorAll('.cayan-ws-chip').length === 0 : false,
      };
    })()`,
  });
  const shot = await page2.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/wasai_schedule_v130_inbound.png', buf);
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(ver.result && ver.result.value, null, 2));
  console.log('verify', JSON.stringify(ver.result && ver.result.value, null, 2));
  await page2.close();
  console.log('WORK_DIR', WORK_DIR);
  console.log('SHOT /opt/cursor/artifacts/wasai_schedule_v130_inbound.png');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
