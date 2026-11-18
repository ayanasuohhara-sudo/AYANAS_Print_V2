'use strict';

/**
 * Probe updateSystemSetting payload shape (dry validation only).
 */

const http = require('http');
const WebSocket = require('ws');

const SUB = 'o5nppg7kb4ly';

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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 120000);
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
  for (let i = 0; i < 60; i++) {
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

async function main() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/admin/system/customize/`);
  await new Promise((r) => setTimeout(r, 2000));
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const token = kintone.getRequestToken();
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
        return { status: r.status, text: text.slice(0, 1500), json };
      }

      const get = await post('/k/api/js/getSystemSetting.json', {});
      const cur = get.json && get.json.result;

      // Probe blob upload endpoints
      const blobEndpoints = [];
      const tiny = new Blob(['// probe'], { type: 'text/javascript' });
      for (const path of [
        '/k/api/blob/upload.json',
        '/k/api/js/upload.json',
        '/k/api/file/uploadTemporary.json',
        '/k/v1/file.json'
      ]) {
        try {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', tiny, 'probe.js');
          const r = await fetch(path, {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
          });
          const text = await r.text();
          blobEndpoints.push({ path, status: r.status, sample: text.slice(0, 500) });
        } catch (e) {
          blobEndpoints.push({ path, error: e.message || String(e) });
        }
      }

      // Dry-run update with missing fields to learn required shape (should fail validation)
      const trials = [];
      trials.push(await post('/k/api/js/updateSystemSetting.json', {
        scope: 'ALL',
        active: true
      }));
      trials.push(await post('/k/api/js/updateSystemSetting.json', {
        scope: 'ALL',
        active: true,
        jsFiles: [],
        cssFiles: []
      }));
      trials.push(await post('/k/api/js/updateSystemSetting.json', {
        scope: 'ALL',
        active: true,
        scripts: cur && cur.scripts
      }));
      // common cybozu admin shape
      trials.push(await post('/k/api/js/updateSystemSetting.json', {
        item: {
          scope: 'ALL',
          active: true,
          scripts: cur && cur.scripts
        }
      }));

      return {
        url: location.href,
        getOk: !!(get.json && get.json.success),
        current: cur,
        blobEndpoints,
        trials: trials.map((t) => ({
          status: t.status,
          success: t.json && t.json.success,
          code: t.json && t.json.code,
          message: t.json && t.json.message,
          sample: t.text.slice(0, 400)
        }))
      };
    })()`,
  });
  console.log(JSON.stringify(result.result && result.result.value, null, 2));
  await page.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
