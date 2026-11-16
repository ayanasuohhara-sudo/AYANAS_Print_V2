'use strict';

/**
 * App96/App87 P1 本番反映前バックアップ＋衝突確認（読取のみ）
 *   node scripts/_pcm_p1_prod_backup_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'pcm_p1_prod_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const PROPOSED = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/APP96_MEASURE_HISTORY_FIELDS.json'), 'utf8')
).properties;

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

function collectFieldCodes(properties) {
  const codes = new Set();
  Object.keys(properties || {}).forEach((code) => {
    codes.add(code);
    const p = properties[code];
    if (p && p.type === 'SUBTABLE' && p.fields) {
      Object.keys(p.fields).forEach((c) => codes.add(c));
    }
  });
  return codes;
}

async function backupApp(appId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${appId};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const out = { ok: true, stages: {} };
        try {
          out.fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
          out.stages.fields = 'ok';
        } catch (e) {
          return { ok: false, stage: 'fields', error: e.message || String(e) };
        }
        try {
          out.layout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
          out.stages.layout = 'ok';
        } catch (e) {
          return { ok: false, stage: 'layout', error: e.message || String(e) };
        }
        try {
          out.customize = await api('/k/v1/app/customize.json', 'GET', { app: APP });
          out.stages.customize = 'ok';
        } catch (e) {
          return { ok: false, stage: 'customize', error: e.message || String(e) };
        }
        try {
          out.settings = await api('/k/v1/app/settings.json', 'GET', { app: APP });
          out.stages.settings = 'ok';
        } catch (e) {
          out.settings = { name: '(settings unavailable)' };
          out.stages.settings = e.message || String(e);
        }
        out.name = (out.settings && out.settings.name) || '';
        out.revision = out.fields.revision;
        out.fieldCodes = Object.keys(out.fields.properties || {});
        out.desktopJs = ((out.customize.desktop || {}).js || []).map((x) => x.file && x.file.name);
        out.desktopCss = ((out.customize.desktop || {}).css || []).map((x) => x.file && x.file.name);
        out.scope = out.customize.scope;
        out.sample = null;
        if (APP === 96) {
          try {
            const recs = await api('/k/v1/records.json', 'GET', {
              app: APP,
              query: 'limit 3',
              fields: ['$id', 'personal_customer_id', 'customer_name', 'phone', 'order_count']
            });
            out.sample = (recs.records || []).map((r) => ({
              id: r.$id && r.$id.value,
              pid: r.personal_customer_id && r.personal_customer_id.value,
              name: r.customer_name && r.customer_name.value,
              phone: r.phone && r.phone.value,
              orderCount: r.order_count && r.order_count.value
            }));
            out.stages.sample = 'ok';
          } catch (e) {
            out.stages.sample = e.message || String(e);
          }
        }
        return out;
      } catch (e) {
        return { ok: false, stage: 'outer', error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

(async () => {
  console.log('WORK_DIR', WORK_DIR);
  const app96 = await backupApp(96);
  const app87 = await backupApp(87);
  if (!app96 || !app96.ok) throw new Error('App96 backup failed: ' + JSON.stringify(app96));
  if (!app87 || !app87.ok) throw new Error('App87 backup failed: ' + JSON.stringify(app87));

  fs.writeFileSync(path.join(WORK_DIR, 'app96_fields.json'), JSON.stringify(app96.fields, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app96_layout.json'), JSON.stringify(app96.layout, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app96_customize.json'), JSON.stringify(app96.customize, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app96_settings.json'), JSON.stringify(app96.settings, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app87_fields.json'), JSON.stringify(app87.fields, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app87_layout.json'), JSON.stringify(app87.layout, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app87_customize.json'), JSON.stringify(app87.customize, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app87_settings.json'), JSON.stringify(app87.settings, null, 2));

  const existing = collectFieldCodes(app96.fields.properties);
  const proposedTop = Object.keys(PROPOSED);
  const proposedInner = Object.keys((PROPOSED.measure_history && PROPOSED.measure_history.fields) || {});
  const collisions = [];
  proposedTop.forEach((c) => {
    if (existing.has(c)) collisions.push({ code: c, where: 'top' });
  });
  proposedInner.forEach((c) => {
    if (existing.has(c)) collisions.push({ code: c, where: 'inner' });
  });

  const report = {
    stamp: STAMP,
    workDir: WORK_DIR,
    app96: {
      name: app96.name,
      revision: app96.revision,
      desktopJs: app96.desktopJs,
      desktopCss: app96.desktopCss,
      sampleRecords: app96.sample,
      fieldCount: app96.fieldCodes.length,
      hasMeasureHistory: existing.has('measure_history'),
    },
    app87: {
      name: app87.name,
      desktopJs: app87.desktopJs,
      desktopCss: app87.desktopCss,
    },
    collisions,
    proposedTop,
    proposedInner,
    safeToAdd: collisions.length === 0 && !existing.has('measure_history'),
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROBE_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.safeToAdd) {
    console.error('STOP: field collision or measure_history already present');
    process.exit(2);
  }
  console.log('PROBE_OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
