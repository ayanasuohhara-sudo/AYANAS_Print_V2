'use strict';

/**
 * App16 全レコード + フォームバックアップ（読み取りのみ）
 * Usage: node scripts/_app16_work_status_full_backup.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const OUT_DIR = path.join(
  '/workspace/customize/backups',
  'app16_work_status_full_' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
);

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
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
  for (let i = 0; i < 50; i++) {
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

async function evalJson(send, expression) {
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);

  const meta = await evalJson(
    send,
    `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP16} });
      const layout = await api('/k/v1/app/form/layout.json', 'GET', { app: ${APP16} });
      return { fields, layout };
    })()`
  );
  fs.writeFileSync(path.join(OUT_DIR, 'fields.json'), JSON.stringify(meta.fields, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'layout.json'), JSON.stringify(meta.layout, null, 2));

  const jsonlPath = path.join(OUT_DIR, 'records.jsonl');
  fs.writeFileSync(jsonlPath, '');
  let total = 0;
  let lastId = '0';

  while (true) {
    const chunk = await evalJson(
      send,
      `(async () => {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const lastId = ${JSON.stringify(lastId)};
        const r = await api('/k/v1/records.json', 'GET', {
          app: ${APP16},
          query: '$id > ' + lastId + ' order by $id asc limit 500',
        });
        return (r.records || []).map((rec) => ({
          id: String(rec.$id.value),
          revision: String(rec.$revision.value),
          record: rec,
        }));
      })()`
    );
    if (!chunk.length) break;
    fs.appendFileSync(jsonlPath, chunk.map((row) => JSON.stringify(row)).join('\n') + '\n');
    total += chunk.length;
    lastId = chunk[chunk.length - 1].id;
    console.log('backed up', total, 'lastId', lastId);
    if (chunk.length < 500) break;
  }

  fs.writeFileSync(jsonlPath + '.gz', zlib.gzipSync(fs.readFileSync(jsonlPath)));

  const summary = {
    at: new Date().toISOString(),
    app: APP16,
    total,
    jsonl: jsonlPath,
    gzip: jsonlPath + '.gz',
    fields: path.join(OUT_DIR, 'fields.json'),
    layout: path.join(OUT_DIR, 'layout.json'),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
