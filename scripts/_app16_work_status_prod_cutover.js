'use strict';

/**
 * App16 work_status 本番カットオーバー補助
 * Modes:
 *   node scripts/_app16_work_status_prod_cutover.js inspect
 *   node scripts/_app16_work_status_prod_cutover.js backup
 *   node scripts/_app16_work_status_prod_cutover.js deploy-js
 *   node scripts/_app16_work_status_prod_cutover.js add-options
 *   node scripts/_app16_work_status_prod_cutover.js drop-old-options
 *   node scripts/_app16_work_status_prod_cutover.js verify
 *   node scripts/_app16_work_status_prod_cutover.js smoke-js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const ROOT = '/workspace';
const MODE = process.argv[2] || 'inspect';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_ROOT = process.env.CUTOVER_DIR
  || path.join(ROOT, 'customize/backups', 'app16_work_status_cutover_' + STAMP.slice(0, 19));

const FINAL_OPTIONS = [
  '未着',
  '問合せ・見積り',
  '丸洗い待ち',
  '丸洗い中・乾燥',
  'しみ抜き中',
  '修理中',
  '再直し中',
  '仕上げ中',
  '仕上げ完了',
];

const COEXIST_OPTIONS = [
  '未着手', // keep temporarily
  '未着',
  '問合せ・見積り',
  '丸洗い待ち',
  '丸洗い中・乾燥',
  'しみ抜き待ち', // keep temporarily
  'しみ抜き中',
  '修理中',
  '再直し中',
  '仕上げ中',
  '仕上げ完了',
];

const APP_JS = {
  30: {
    js: [
      'work_status_labels.js',
      'internal_ops_config.js',
      'barcode_batch_core.js',
      'barcode_batch_ui.js',
      'complete_register_engine.js',
      'complete_register_desktop.js',
    ],
    css: [],
    keepUnknown: false,
  },
  84: {
    js: [
      'work_status_labels.js',
      'internal_ops_config.js',
      'barcode_batch_core.js',
      'barcode_batch_ui.js',
      'internal_work_engine.js',
      'internal_work_desktop.js',
    ],
    css: [],
    keepUnknown: false,
  },
  87: {
    js: [
      'work_status_labels.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['floor_portal.css'],
    keepUnknown: false,
  },
};

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
    pageId: page.id,
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

function readCustomizeFile(name) {
  const p = path.join(ROOT, 'customize', name);
  if (!fs.existsSync(p)) throw new Error('missing ' + p);
  return fs.readFileSync(p);
}

async function inspect() {
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const report = await evalJson(
    send,
    `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const apps = [16, 30, 84, 85, 87, 92, 97];
      const out = { at: new Date().toISOString(), apps: {} };
      for (const app of apps) {
        try {
          const settings = await api('/k/v1/app.json', 'GET', { id: app });
          let customize = null;
          try {
            customize = await api('/k/v1/app/customize.json', 'GET', { app });
          } catch (e) {
            customize = { error: String(e && e.message || e) };
          }
          out.apps[app] = {
            name: settings.name,
            js: ((customize.desktop || {}).js || []).map((x) => ({
              type: x.type,
              name: x.file && x.file.name,
            })),
            css: ((customize.desktop || {}).css || []).map((x) => ({
              type: x.type,
              name: x.file && x.file.name,
            })),
          };
        } catch (e) {
          out.apps[app] = { error: String(e && e.message || e) };
        }
      }
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: 16 });
      const ws = (fields.properties || {}).work_status || {};
      const options = ws.options || {};
      const labels = Object.keys(options).sort((a, b) => (options[a].index || 0) - (options[b].index || 0));
      const countQ = async (q) => {
        const r = await api('/k/v1/records.json', 'GET', {
          app: 16, query: q + ' limit 1', totalCount: true, fields: ['$id'],
        });
        return Number(r.totalCount || 0);
      };
      const counts = {};
      for (const label of labels) counts[label] = await countQ('work_status in ("' + label + '")');
      counts.__empty__ = await countQ('work_status not in (' + labels.map((l) => '"' + l + '"').join(',') + ')');
      counts.__total__ = await countQ('$id > 0');
      out.work_status = {
        defaultValue: ws.defaultValue,
        labels,
        counts,
      };
      return out;
    })()`
  );
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'inspect.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await close();
  return report;
}

async function backup() {
  const dir = path.join(OUT_ROOT, 'full_backup');
  fs.mkdirSync(dir, { recursive: true });
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const meta = await evalJson(
    send,
    `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      return {
        fields: await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP16} }),
        layout: await api('/k/v1/app/form/layout.json', 'GET', { app: ${APP16} }),
      };
    })()`
  );
  fs.writeFileSync(path.join(dir, 'fields.json'), JSON.stringify(meta.fields, null, 2));
  fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(meta.layout, null, 2));
  const jsonlPath = path.join(dir, 'records.jsonl');
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
    fs.appendFileSync(jsonlPath, chunk.map((r) => JSON.stringify(r)).join('\n') + '\n');
    total += chunk.length;
    lastId = chunk[chunk.length - 1].id;
    console.error('backup', total, lastId);
    if (chunk.length < 500) break;
  }
  fs.writeFileSync(jsonlPath + '.gz', zlib.gzipSync(fs.readFileSync(jsonlPath)));
  const summary = { at: new Date().toISOString(), total, dir };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await close();
  return summary;
}

async function deployJs() {
  const report = { at: new Date().toISOString(), apps: {} };
  for (const [appId, conf] of Object.entries(APP_JS)) {
    const app = Number(appId);
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${app}/`);
    // push file contents into page
    await send('Runtime.evaluate', { expression: 'window.__WS_FILES={}; true' });
    const files = {};
    for (const name of conf.js) files[name] = readCustomizeFile(name).toString('base64');
    for (const name of conf.css) files[name] = readCustomizeFile(name).toString('base64');
    for (const [name, b64] of Object.entries(files)) {
      // chunk if needed
      const CHUNK = 400000;
      await send('Runtime.evaluate', {
        expression: `window.__WS_FILES[${JSON.stringify(name)}]=[]; true`,
      });
      for (let i = 0; i < b64.length; i += CHUNK) {
        const part = b64.slice(i, i + CHUNK);
        await send('Runtime.evaluate', {
          expression: `window.__WS_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
        });
      }
      await send('Runtime.evaluate', {
        expression: `window.__WS_FILES[${JSON.stringify(name)}]=window.__WS_FILES[${JSON.stringify(name)}].join(''); true`,
      });
    }

    const result = await evalJson(
      send,
      `(async () => {
        const APP = ${app};
        const desiredJs = ${JSON.stringify(conf.js)};
        const desiredCss = ${JSON.stringify(conf.css)};
        const keepUnknown = ${conf.keepUnknown ? 'true' : 'false'};
        const files = window.__WS_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();

        function b64ToBlob(b64, type) {
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadBlob(blob, filename) {
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

        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const curJs = (current.desktop && current.desktop.js) || [];
        const curCss = (current.desktop && current.desktop.css) || [];

        // Build final JS order: desired first (uploaded), then keep unknown existing files not in desired
        const keys = {};
        for (const name of desiredJs) {
          keys[name] = await uploadBlob(b64ToBlob(files[name], 'text/javascript'), name);
        }
        for (const name of desiredCss) {
          keys[name] = await uploadBlob(b64ToBlob(files[name], 'text/css'), name);
        }

        const desiredSet = new Set(desiredJs);
        const jsEntries = desiredJs.map((name) => ({ type: 'FILE', file: { fileKey: keys[name] } }));
        if (keepUnknown) {
          for (const entry of curJs) {
            const name = entry.file && entry.file.name;
            if (!name || desiredSet.has(name)) continue;
            // re-upload existing unknown by downloading? cannot easily. Keep by fileKey if present.
            if (entry.file && entry.file.fileKey) {
              jsEntries.push({ type: 'FILE', file: { fileKey: entry.file.fileKey } });
            }
          }
        }

        const cssDesiredSet = new Set(desiredCss);
        const cssEntries = desiredCss.map((name) => ({ type: 'FILE', file: { fileKey: keys[name] } }));
        if (keepUnknown) {
          for (const entry of curCss) {
            const name = entry.file && entry.file.name;
            if (!name || cssDesiredSet.has(name)) continue;
            if (entry.file && entry.file.fileKey) {
              cssEntries.push({ type: 'FILE', file: { fileKey: entry.file.fileKey } });
            }
          }
        }

        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop: { js: jsEntries, css: cssEntries },
          mobile: current.mobile || { js: [], css: [] },
        });
        await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: APP }] });
        let last = null;
        for (let i = 0; i < 100; i++) {
          const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [APP] });
          last = (st.apps || [])[0];
          if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
          await new Promise((r) => setTimeout(r, 400));
        }
        const after = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        return {
          ok: last && last.status === 'SUCCESS',
          deploy: last,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name),
        };
      })()`
    );
    report.apps[app] = result;
    console.error('deploy app', app, JSON.stringify(result));
    await close();
    if (!result.ok) throw new Error('deploy failed for app ' + app);
    // verify work_status_labels is first among our files
    const idx = (result.desktopJs || []).indexOf('work_status_labels.js');
    if (idx !== 0 && (result.desktopJs || []).includes('work_status_labels.js')) {
      // may have been prepended correctly as first of desired; if not first overall due to keepUnknown prepend issue
      // Our code puts desired first, so index should be 0
    }
    if ((result.desktopJs || [])[0] !== 'work_status_labels.js') {
      throw new Error('work_status_labels.js is not first for app ' + app + ': ' + JSON.stringify(result.desktopJs));
    }
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'deploy_js.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function setOptions(mode) {
  const labels = mode === 'final' ? FINAL_OPTIONS : COEXIST_OPTIONS;
  const defaultValue = '未着';
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await evalJson(
    send,
    `(async () => {
      const APP = ${APP16};
      const labels = ${JSON.stringify(labels)};
      const defaultValue = ${JSON.stringify(defaultValue)};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const current = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
      const ws = (current.properties || {}).work_status;
      if (!ws) throw new Error('work_status missing');
      const options = {};
      labels.forEach((label, index) => {
        options[label] = { label, index: String(index) };
      });
      await api('/k/v1/preview/app/form/fields.json', 'PUT', {
        app: APP,
        properties: {
          work_status: {
            type: 'DROP_DOWN',
            code: 'work_status',
            label: ws.label || '作業ステータス',
            noLabel: ws.noLabel,
            required: ws.required,
            options,
            defaultValue,
          },
        },
      });
      await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: APP }] });
      let last = null;
      for (let i = 0; i < 100; i++) {
        const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [APP] });
        last = (st.apps || [])[0];
        if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
        await new Promise((r) => setTimeout(r, 400));
      }
      const after = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
      const aws = (after.properties || {}).work_status || {};
      const alabels = Object.keys(aws.options || {}).sort((a, b) => (aws.options[a].index || 0) - (aws.options[b].index || 0));
      return {
        ok: last && last.status === 'SUCCESS',
        deploy: last,
        defaultValue: aws.defaultValue,
        labels: alabels,
        mode: ${JSON.stringify(mode)},
      };
    })()`
  );
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'options_' + mode + '.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await close();
  if (!result.ok) throw new Error('options deploy failed');
  return result;
}

async function verify() {
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await evalJson(
    send,
    `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: 16 });
      const ws = (fields.properties || {}).work_status || {};
      const options = ws.options || {};
      const labels = Object.keys(options).sort((a, b) => (options[a].index || 0) - (options[b].index || 0));
      const countQ = async (q) => {
        const r = await api('/k/v1/records.json', 'GET', {
          app: 16, query: q + ' limit 1', totalCount: true, fields: ['$id'],
        });
        return Number(r.totalCount || 0);
      };
      const counts = {};
      for (const label of labels) counts[label] = await countQ('work_status in ("' + label + '")');
      counts.__empty__ = await countQ('work_status not in (' + labels.map((l) => '"' + l + '"').join(',') + ')');
      counts.__total__ = await countQ('$id > 0');
      return { at: new Date().toISOString(), defaultValue: ws.defaultValue, labels, counts };
    })()`
  );
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'verify.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await close();
  return result;
}

async function smokeJs() {
  const apps = [30, 84, 87];
  const report = { at: new Date().toISOString(), apps: {} };
  for (const app of apps) {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${app}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const result = await evalJson(
      send,
      `(async () => {
        const logs = [];
        return {
          url: location.href,
          hasLabels: typeof CAYANAS_WORK_STATUS !== 'undefined',
          labelsVersion: typeof CAYANAS_WORK_STATUS !== 'undefined' ? CAYANAS_WORK_STATUS.VERSION : null,
          hasInternal: typeof CAYANAS_INTERNAL_OPS !== 'undefined',
          hasFloor: typeof CAYANAS_FLOOR_PORTAL !== 'undefined',
          internalWork: typeof CAYANAS_INTERNAL_OPS !== 'undefined' ? CAYANAS_INTERNAL_OPS.WORK.sortPending : null,
          floorPending: typeof CAYANAS_FLOOR_PORTAL !== 'undefined' ? CAYANAS_FLOOR_PORTAL.WORK.pending : null,
          pageErrors: (window.__wsPageErrors || []),
        };
      })()`
    );
    report.apps[app] = result;
    await close();
  }
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(path.join(OUT_ROOT, 'smoke_js.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  if (MODE === 'inspect') return inspect();
  if (MODE === 'backup') return backup();
  if (MODE === 'deploy-js') return deployJs();
  if (MODE === 'add-options') return setOptions('coexist');
  if (MODE === 'drop-old-options') return setOptions('final');
  if (MODE === 'verify') return verify();
  if (MODE === 'smoke-js') return smokeJs();
  throw new Error('unknown mode ' + MODE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
