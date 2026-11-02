'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const htmlPath = '/opt/cursor/artifacts/store_order_v148/store_order_TSP815835U.html';
const css = fs.readFileSync('/workspace/css/print.css', 'utf8');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*>/i, '<style>' + css + '</style>');
const out = '/tmp/store_order_v148_preview.html';
fs.writeFileSync(out, html);

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

(async () => {
  const page = await httpJson('/json/new?' + encodeURIComponent('file://' + out), 'PUT');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.on('open', r);
    ws.on('error', j);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error(method)), 60000);
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
  await new Promise((r) => setTimeout(r, 2500));
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  const buf = Buffer.from(shot.result.data, 'base64');
  fs.mkdirSync('/opt/cursor/artifacts/store_order_v148', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/store_order_v148/store_order_TSP815835U_styled.png', buf);
  const workScreens = fs.readdirSync('/workspace/customize/backups')
    .filter((d) => d.startsWith('store_order_v148_'))
    .map((d) => path.join('/workspace/customize/backups', d, 'screens'))
    .sort()
    .slice(-1)[0];
  if (workScreens) {
    fs.mkdirSync(workScreens, { recursive: true });
    fs.writeFileSync(path.join(workScreens, 'store_order_TSP815835U_styled.png'), buf);
  }
  console.log('wrote styled screenshot', buf.length);
  await httpJson('/json/close/' + page.id);
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
