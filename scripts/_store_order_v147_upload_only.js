'use strict';

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ZIP_SRC = '/workspace/plugin.zip';
const ZIP = '/tmp/ayanas-print-v148.zip';
const WORK_DIR = path.join(
  '/workspace/customize/backups',
  'store_order_v148_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
);
const ART_DIR = '/opt/cursor/artifacts/store_order_v148';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
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
  await send('DOM.enable');
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

(async () => {
  fs.copyFileSync(ZIP_SRC, ZIP);
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.copyFileSync(ZIP, path.join(WORK_DIR, 'plugin_v148.zip'));

  const page = await openPage('https://o5nppg7kb4ly.cybozu.com/k/admin/system/plugin/');
  await new Promise((r) => setTimeout(r, 4000));

  const click = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const b = [...document.querySelectorAll('button')]
        .find((x) => /^(Import|インポート)$/.test((x.innerText || '').trim()));
      if (!b) return { ok: false };
      b.click();
      return { ok: true };
    })()`,
  });
  console.log('click raw', JSON.stringify(click, null, 2).slice(0, 2000));
  const clickVal = (click.result && click.result.result && click.result.result.value)
    || (click.result && click.result.value)
    || click.value;
  console.log('click', clickVal);
  if (!clickVal || !clickVal.ok) throw new Error('Import click failed');

  await new Promise((r) => setTimeout(r, 2000));

  const doc = await page.send('DOM.getDocument', { depth: -1 });
  const q = await page.send('DOM.querySelector', {
    nodeId: doc.result.root.nodeId,
    selector: 'input[type=file]',
  });
  console.log('query', q.result);
  const nodeId = q.result && q.result.nodeId;
  if (!nodeId) throw new Error('no file input nodeId');

  await page.send('DOM.setFileInputFiles', { nodeId, files: [ZIP] });
  console.log('files set');
  await new Promise((r) => setTimeout(r, 1500));

  const imp = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')]
        .filter((b) => /^(Import|インポート)$/.test((b.innerText || '').trim()));
      const dialog = btns.find((b) => {
        const c = b.className || '';
        return /DialogOk|_DialogOk/i.test(c) || !/_HeaderButton_/i.test(c);
      });
      const target = dialog || btns[btns.length - 1];
      if (!target) return { ok: false, count: btns.length };
      target.click();
      return { ok: true, cls: String(target.className || ''), text: target.innerText };
    })()`,
  });
  console.log('import dialog', imp.result && imp.result.result && imp.result.result.value);

  let verify = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const text = document.body && document.body.innerText || '';
        return {
          has148: /\\b148\\b/.test(text) && /AYANAS\\s*Print/i.test(text),
          sample: [...text.matchAll(/AYANAS\\s*Print[^\\n]{0,100}/gi)].map((m) => m[0]).slice(0, 5),
          versions: (text.match(/Version:\\s*\\d+/g) || []).slice(0, 5),
        };
      })()`,
    });
    verify = r.result && r.result.result && r.result.result.value;
    console.log('tick', i, verify);
    if (verify && verify.has148) break;
  }

  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_list_v148.png'), Buffer.from(shot.result.data, 'base64'));
  fs.writeFileSync(path.join(ART_DIR, 'plugin_list_v148.png'), Buffer.from(shot.result.data, 'base64'));

  const out = {
    ok: !!(verify && verify.has148),
    verify,
    zip: ZIP,
    work: WORK_DIR,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_upload.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'plugin_upload.json'), JSON.stringify(out, null, 2));
  console.log('FINAL', JSON.stringify(out, null, 2));
  await page.close();
  if (!out.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
