'use strict';

/**
 * A550 入金状況 — 本番適用（承認済み）
 *
 * 手順:
 *  1. App16 フィールド＋JS バックアップ
 *  2. store_payment_status 追加（重複確認）
 *  3. App16 / App92 に必要 JS のみデプロイ
 *  4. App19 / App21 / App35 は触らない
 *  5. 空欄動作・3パターン・App92 確認ダイアログ・3軸不変・法人非破壊を検証
 *  6. 過去データ一括更新なし / App97 削除なし
 *
 *   node scripts/_a550_payment_status_prod_deploy.js
 *
 * 前提: CDP 9222 にログイン済み kintone セッション
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'a550_payment_status_prod_' + STAMP);

const APP16 = 16;
const APP92 = 92;
const APP19 = 19;
const APP97 = 97;

const FIELD_CODE = 'store_payment_status';
const FIELD_SPEC = {
  type: 'DROP_DOWN',
  code: FIELD_CODE,
  label: '入金状況',
  noLabel: false,
  required: false,
  options: {
    未入金: { label: '未入金', index: '0' },
    一部入金: { label: '一部入金', index: '1' },
    入金済み: { label: '入金済み', index: '2' },
  },
  defaultValue: '未入金',
};

/** App16: 既存を維持しつつ status 系を挿入 */
const APP16_INSERT_JS = [
  'store_payment_status.js',
  'store_payment_status_desktop.js',
];
const APP16_INSERT_AFTER = 'order_customer_search.js';
const APP16_ADD_CSS = ['store_payment_status.css'];
const APP16_LOCAL_OVERRIDE = new Set([
  ...APP16_INSERT_JS,
  ...APP16_ADD_CSS,
]);

/** App92: status を先頭付近に追加し、改修対象のみローカル上書き */
const APP92_INSERT_JS = ['store_payment_status.js'];
const APP92_INSERT_BEFORE = 'store_deadline_config.js';
const APP92_OVERRIDE = new Set([
  'store_payment_status.js',
  'store_payment_config.js',
  'store_pickup_shared.js',
  'store_pickup_api.js',
  'store_deadline_config.js',
  'store_deadline_pickup.js',
]);

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
  let ready = false;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    const v = s.result && s.result.value;
    if (v && v.hasK && !/login/i.test(v.url || '')) {
      ready = true;
      break;
    }
  }
  if (!ready) {
    try {
      await httpJson('/json/close/' + page.id, 'GET');
    } catch (_) {}
    throw new Error('kintone session not ready (login required): ' + url);
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

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

async function backupApp16() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const APP = ${APP16};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
      const layout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
      const customize = await api('/k/v1/app/customize.json', 'GET', { app: APP });
      const settings = await api('/k/v1/app/settings.json', 'GET', { app: APP });
      const views = await api('/k/v1/app/views.json', 'GET', { app: APP });
      return { settings, fields, layout, customize, views };
    })()`,
  });
  await page.close();
  const data = result.result && result.result.value;
  if (!data) throw new Error('backup App16 failed');
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'app16_fields.json'), JSON.stringify(data.fields, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app16_layout.json'), JSON.stringify(data.layout, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app16_customize.json'), JSON.stringify(data.customize, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app16_settings.json'), JSON.stringify(data.settings, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app16_views.json'), JSON.stringify(data.views, null, 2));

  // download JS/CSS blobs for restore
  const filesDir = path.join(WORK_DIR, 'app16_files');
  fs.mkdirSync(filesDir, { recursive: true });
  const page2 = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const dl = await page2.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const customize = ${JSON.stringify(data.customize)};
      const out = [];
      async function pull(side) {
        for (const kind of ['js', 'css']) {
          for (const item of ((customize[side] || {})[kind] || [])) {
            if (item.type !== 'FILE' || !item.file || !item.file.fileKey) continue;
            const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(item.file.fileKey), {
              headers: { 'X-Requested-With': 'XMLHttpRequest' },
              credentials: 'same-origin'
            });
            if (!res.ok) throw new Error('dl ' + item.file.name + ' ' + res.status);
            const buf = await res.arrayBuffer();
            const bytes = Array.from(new Uint8Array(buf));
            out.push({ side, kind, name: item.file.name, bytes });
          }
        }
      }
      await pull('desktop');
      await pull('mobile');
      return out;
    })()`,
  });
  await page2.close();
  const blobs = (dl.result && dl.result.value) || [];
  for (const f of blobs) {
    const dir = path.join(filesDir, f.side, f.kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, f.name), Buffer.from(f.bytes));
  }
  fs.writeFileSync(path.join(WORK_DIR, 'RESTORE.md'), [
    '# Restore App16',
    '',
    '1. Re-upload desktop/mobile JS/CSS from `app16_files/` in the same order as `app16_customize.json`.',
    '2. If field `store_payment_status` must be removed, do so manually in form settings (kintone cannot always delete fields via API safely).',
    '3. Redeploy app.',
    '',
  ].join('\n'));
  return {
    workDir: WORK_DIR,
    hasFieldAlready: !!(data.fields.properties && data.fields.properties[FIELD_CODE]),
    desktopJs: ((data.customize.desktop || {}).js || []).map((x) => x.file && x.file.name),
    desktopCss: ((data.customize.desktop || {}).css || []).map((x) => x.file && x.file.name),
    fileCount: blobs.length,
  };
}

async function backupApp92() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      return await api('/k/v1/app/customize.json', 'GET', { app: ${APP92} });
    })()`,
  });
  await page.close();
  const customize = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'app92_customize.json'), JSON.stringify(customize, null, 2));
  return {
    desktopJs: ((customize.desktop || {}).js || []).map((x) => x.file && x.file.name),
  };
}

async function addFieldAndLayout() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP16};
        const FIELD = ${JSON.stringify(FIELD_SPEC)};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const before = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        const dupes = Object.keys(before.properties || {}).filter((k) =>
          /payment|入金/i.test(k) || /入金/.test((before.properties[k] && before.properties[k].label) || '')
        );
        if (before.properties[FIELD.code]) {
          return {
            ok: true,
            skipped: true,
            reason: 'already_exists',
            options: Object.keys(before.properties[FIELD.code].options || {}),
            dupes
          };
        }
        async function deployOnce() {
          await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: APP }] });
          let last = null;
          for (let i = 0; i < 120; i++) {
            const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [APP] });
            last = (st.apps || [])[0];
            if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
            await new Promise((r) => setTimeout(r, 500));
          }
          return last;
        }
        await api('/k/v1/preview/app/form/fields.json', 'POST', {
          app: APP,
          properties: { [FIELD.code]: FIELD }
        });
        const deployFields = await deployOnce();
        if (!deployFields || deployFields.status !== 'SUCCESS') {
          return { ok: false, stage: 'fields_deploy', deploy: deployFields, dupes };
        }

        // layout: place near delivery_status or client_name
        const liveLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        const layout = JSON.parse(JSON.stringify(liveLayout.layout || []));
        const hasInLayout = JSON.stringify(layout).includes(FIELD.code);
        let deployLayout = null;
        let layoutAction = 'skip';
        if (!hasInLayout) {
          // remove auto-placed row if any
          const filtered = layout.filter((row) => {
            if (row.type !== 'ROW' || !Array.isArray(row.fields)) return true;
            const codes = row.fields.map((f) => f.code || '');
            return !(codes.length === 1 && codes[0] === FIELD.code);
          });
          filtered.forEach((row) => {
            if (row.type === 'ROW' && Array.isArray(row.fields)) {
              row.fields = row.fields.filter((f) => f.code !== FIELD.code);
            }
          });
          let insertAt = -1;
          filtered.forEach((row, i) => {
            if (row.type === 'ROW' && Array.isArray(row.fields)
              && row.fields.some((f) => f.code === 'delivery_status' || f.code === 'client_name')) {
              insertAt = i + 1;
            }
          });
          if (insertAt < 0) insertAt = filtered.length;
          filtered.splice(insertAt, 0, {
            type: 'ROW',
            fields: [{ type: 'DROP_DOWN', code: FIELD.code, size: { width: '200' } }]
          });
          await api('/k/v1/preview/app/form/layout.json', 'PUT', { app: APP, layout: filtered });
          deployLayout = await deployOnce();
          layoutAction = 'updated';
          if (!deployLayout || deployLayout.status !== 'SUCCESS') {
            return { ok: false, stage: 'layout_deploy', deploy: deployLayout, dupes };
          }
        }
        const after = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        return {
          ok: true,
          skipped: false,
          deployFields,
          deployLayout,
          layoutAction,
          options: Object.keys((after.properties[FIELD.code] || {}).options || {}),
          defaultValue: (after.properties[FIELD.code] || {}).defaultValue,
          dupes
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function deployApp16Merge() {
  const filesMap = {};
  for (const n of APP16_LOCAL_OVERRIDE) {
    filesMap[n] = readLocal(n);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP16};
        const INSERT_JS = ${JSON.stringify(APP16_INSERT_JS)};
        const INSERT_AFTER = ${JSON.stringify(APP16_INSERT_AFTER)};
        const ADD_CSS = ${JSON.stringify(APP16_ADD_CSS)};
        const LOCAL_OVERRIDE = new Set(${JSON.stringify([...APP16_LOCAL_OVERRIDE])});
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();
        function b64ToBlob(b64, type) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
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
        async function downloadFileKey(fileKey) {
          const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(fileKey), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
          });
          if (!res.ok) throw new Error('download fail ' + res.status + ' ' + fileKey);
          return new Blob([await res.arrayBuffer()]);
        }
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const stripJs = new Set(INSERT_JS);
        const stripCss = new Set(ADD_CSS);
        const baseJs = ((current.desktop || {}).js || []).filter((x) =>
          !(x.type === 'FILE' && x.file && stripJs.has(x.file.name))
        );
        const baseCss = ((current.desktop || {}).css || []).filter((x) =>
          !(x.type === 'FILE' && x.file && stripCss.has(x.file.name))
        );
        const newJs = [];
        let inserted = false;
        for (const item of baseJs) {
          if (item.type === 'URL') { newJs.push({ type: 'URL', url: item.url }); continue; }
          const name = item.file && item.file.name;
          let blob = LOCAL_OVERRIDE.has(name) && files[name]
            ? b64ToBlob(files[name], 'text/javascript')
            : await downloadFileKey(item.file.fileKey);
          newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
          if (name === INSERT_AFTER) {
            for (const n of INSERT_JS) {
              newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) } });
            }
            inserted = true;
          }
        }
        if (!inserted) {
          for (const n of INSERT_JS) {
            newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) } });
          }
        }
        const newCss = [];
        for (const item of baseCss) {
          if (item.type === 'URL') { newCss.push({ type: 'URL', url: item.url }); continue; }
          const name = item.file && item.file.name;
          let blob = LOCAL_OVERRIDE.has(name) && files[name]
            ? b64ToBlob(files[name], 'text/css')
            : await downloadFileKey(item.file.fileKey);
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
        }
        for (const n of ADD_CSS) {
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/css'), n) } });
        }
        async function remapSide(side) {
          const out = { js: [], css: [] };
          for (const kind of ['js', 'css']) {
            for (const item of side[kind] || []) {
              if (item.type === 'URL') { out[kind].push({ type: 'URL', url: item.url }); continue; }
              const name = item.file && item.file.name;
              const blob = await downloadFileKey(item.file.fileKey);
              out[kind].push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name || ('mobile.' + kind)) } });
            }
          }
          return out;
        }
        const mobileOut = await remapSide(current.mobile || { js: [], css: [] });
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop: { js: newJs, css: newCss },
          mobile: mobileOut
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
        return {
          ok: !!(last && last.status === 'SUCCESS'),
          deploy: last,
          inserted,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name)
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function deployApp92Merge() {
  const filesMap = {};
  for (const n of APP92_OVERRIDE) {
    filesMap[n] = readLocal(n);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP92};
        const INSERT_JS = ${JSON.stringify(APP92_INSERT_JS)};
        const INSERT_BEFORE = ${JSON.stringify(APP92_INSERT_BEFORE)};
        const OVERRIDE = new Set(${JSON.stringify([...APP92_OVERRIDE])});
        const files = window.__SP_FILES;
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const token = kintone.getRequestToken();
        function b64ToBlob(b64, type) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
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
        async function downloadFileKey(fileKey) {
          const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(fileKey), {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin'
          });
          if (!res.ok) throw new Error('download fail ' + res.status);
          return new Blob([await res.arrayBuffer()]);
        }
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const strip = new Set(INSERT_JS);
        const baseJs = ((current.desktop || {}).js || []).filter((x) =>
          !(x.type === 'FILE' && x.file && strip.has(x.file.name))
        );
        const newJs = [];
        let inserted = false;
        for (const item of baseJs) {
          if (item.type === 'URL') { newJs.push({ type: 'URL', url: item.url }); continue; }
          const name = item.file && item.file.name;
          if (!inserted && name === INSERT_BEFORE) {
            for (const n of INSERT_JS) {
              newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) } });
            }
            inserted = true;
          }
          let blob = OVERRIDE.has(name) && files[name]
            ? b64ToBlob(files[name], 'text/javascript')
            : await downloadFileKey(item.file.fileKey);
          newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
        }
        if (!inserted) {
          for (const n of INSERT_JS) {
            newJs.unshift({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) } });
          }
        }
        // css: re-upload unchanged
        const newCss = [];
        for (const item of ((current.desktop || {}).css || [])) {
          if (item.type === 'URL') { newCss.push({ type: 'URL', url: item.url }); continue; }
          const name = item.file && item.file.name;
          const blob = await downloadFileKey(item.file.fileKey);
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
        }
        async function remapSide(side) {
          const out = { js: [], css: [] };
          for (const kind of ['js', 'css']) {
            for (const item of side[kind] || []) {
              if (item.type === 'URL') { out[kind].push({ type: 'URL', url: item.url }); continue; }
              const name = item.file && item.file.name;
              const blob = await downloadFileKey(item.file.fileKey);
              out[kind].push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name || ('mobile.' + kind)) } });
            }
          }
          return out;
        }
        const mobileOut = await remapSide(current.mobile || { js: [], css: [] });
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop: { js: newJs, css: newCss },
          mobile: mobileOut
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
        return {
          ok: !!(last && last.status === 'SUCCESS'),
          deploy: last,
          inserted,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name)
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verifyProd() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP16} });
      const field = fields.properties[${JSON.stringify(FIELD_CODE)}] || null;
      const customize16 = await api('/k/v1/app/customize.json', 'GET', { app: ${APP16} });
      const customize92 = await api('/k/v1/app/customize.json', 'GET', { app: ${APP92} });
      const customize19 = await api('/k/v1/app/customize.json', 'GET', { app: ${APP19} });
      // empty status sample: A550 records without value
      const emptyQ = 'customer_code = "A550" and ${FIELD_CODE} in ("") limit 5';
      let emptySamples = [];
      try {
        emptySamples = (await api('/k/v1/records.json', 'GET', {
          app: ${APP16},
          query: 'customer_code = "A550" limit 5',
          fields: ['$id','manage_no','customer_code',${JSON.stringify(FIELD_CODE)},'process_status','location_status','work_status','delivery_status']
        })).records || [];
      } catch (e) {
        emptySamples = [{ error: e.message || String(e) }];
      }
      // normalize empty via module if loaded
      const Status = window.CAYANAS_StorePaymentStatus;
      const emptyBehavior = emptySamples.map((r) => {
        const raw = r[${JSON.stringify(FIELD_CODE)}] && r[${JSON.stringify(FIELD_CODE)}].value;
        return {
          id: r.$id && r.$id.value,
          manage_no: r.manage_no && r.manage_no.value,
          raw: raw || '',
          normalized: Status ? Status.normalizeStatus(raw || '') : null,
          needsSmaregi: Status ? Status.needsSmaregiResidualConfirm(raw || '') : null
        };
      });
      // unit-like gate checks in-page
      const P = window.CAYANAS_StorePickup;
      const gateChecks = {};
      if (P && Status) {
        const base = {
          customer_code: { value: 'A550' },
          process_status: { value: '完了' },
          location_status: { value: '店舗' },
          delivery_status: { value: '引き取り待ち' },
          delivery_no: { value: 'N-TEST' },
          personal_customer_id: { value: 'P000001' },
          store_payment_status: { value: '入金済み' }
        };
        gateChecks.paid = P.evaluatePickupGate(base, { requirePaid: true }).ok;
        gateChecks.unpaidBlocked = !P.evaluatePickupGate({
          ...base, store_payment_status: { value: '未入金' }
        }, { requirePaid: true }).ok;
        gateChecks.partialWithConfirm = P.evaluatePickupGate({
          ...base, store_payment_status: { value: '一部入金' }
        }, { requirePaid: true, smaregiResidualConfirmed: true }).ok;
        gateChecks.putKeys = Object.keys(P.buildPickupPutRecord());
        gateChecks.confirmMsg = Status.buildSmaregiConfirmMessage([
          { manageNo: 'T1', paymentState: '未入金' },
          { manageNo: 'T2', paymentState: '一部入金' }
        ]);
      }
      // corporate delivery sync still present on App19
      const app19Js = ((customize19.desktop || {}).js || []).map((x) => x.file && x.file.name);
      // App97 record count sanity (no delete)
      let app97Count = null;
      try {
        const c = await api('/k/v1/records.json', 'GET', {
          app: ${APP97},
          query: 'limit 1',
          totalCount: true,
          fields: ['$id']
        });
        app97Count = c.totalCount;
      } catch (e) {
        app97Count = 'err:' + (e.message || String(e));
      }
      return {
        fieldPresent: !!field,
        fieldOptions: field ? Object.keys(field.options || {}) : [],
        defaultValue: field && field.defaultValue,
        app16Js: ((customize16.desktop || {}).js || []).map((x) => x.file && x.file.name),
        app16Css: ((customize16.desktop || {}).css || []).map((x) => x.file && x.file.name),
        app92Js: ((customize92.desktop || {}).js || []).map((x) => x.file && x.file.name),
        app19Js,
        app19UnchangedHint: app19Js.indexOf('delivery_complete_sync.js') >= 0,
        emptyBehavior,
        gateChecks,
        statusModuleVersion: Status && Status.VERSION,
        pickupVersion: P && P.VERSION,
        app97Count,
        smaregiMsg: Status && Status.SMAREGI_CONFIRM_MESSAGE
      };
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verifyApp92PageModules() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const Status = window.CAYANAS_StorePaymentStatus;
      const P = window.CAYANAS_StorePickup;
      const Api = window.CAYANAS_StorePickup_Api;
      const C = window.CAYANAS_STORE_DEADLINE;
      return {
        hasStatus: !!Status,
        statusVer: Status && Status.VERSION,
        hasPickup: !!P,
        pickupVer: P && P.VERSION,
        hasApi: !!Api,
        hasDeadlineCfg: !!C,
        smaregiMsg: Status && Status.SMAREGI_CONFIRM_MESSAGE,
        pickupLead: C && C.MESSAGES && C.MESSAGES.pickupLead,
        putOnlyDelivery: P && Object.keys(P.buildPickupPutRecord()),
      };
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const report = { stamp: STAMP, workDir: WORK_DIR, steps: {} };
  console.log('WORK_DIR', WORK_DIR);

  console.log('1) backup App16…');
  report.steps.backup16 = await backupApp16();
  console.log(JSON.stringify(report.steps.backup16, null, 2));

  console.log('1b) backup App92 customize…');
  report.steps.backup92 = await backupApp92();
  console.log(JSON.stringify(report.steps.backup92, null, 2));

  console.log('2-3) add field + dup check…');
  report.steps.field = await addFieldAndLayout();
  console.log(JSON.stringify(report.steps.field, null, 2));
  if (!report.steps.field || !report.steps.field.ok) {
    fs.writeFileSync(path.join(WORK_DIR, 'PROD_FAIL.json'), JSON.stringify(report, null, 2));
    throw new Error('field add failed — stop before JS deploy');
  }

  console.log('4) deploy App16 JS…');
  report.steps.deploy16 = await deployApp16Merge();
  console.log(JSON.stringify(report.steps.deploy16, null, 2));
  if (!report.steps.deploy16 || !report.steps.deploy16.ok) {
    fs.writeFileSync(path.join(WORK_DIR, 'PROD_FAIL.json'), JSON.stringify(report, null, 2));
    throw new Error('App16 JS deploy failed — restore from ' + WORK_DIR);
  }

  console.log('4b) deploy App92 JS…');
  report.steps.deploy92 = await deployApp92Merge();
  console.log(JSON.stringify(report.steps.deploy92, null, 2));
  if (!report.steps.deploy92 || !report.steps.deploy92.ok) {
    fs.writeFileSync(path.join(WORK_DIR, 'PROD_FAIL.json'), JSON.stringify(report, null, 2));
    throw new Error('App92 JS deploy failed — restore from ' + WORK_DIR);
  }

  console.log('8-12) verify…');
  report.steps.verify = await verifyProd();
  report.steps.verify92 = await verifyApp92PageModules();
  console.log(JSON.stringify({ verify: report.steps.verify, verify92: report.steps.verify92 }, null, 2));

  const ok = !!(
    report.steps.verify
    && report.steps.verify.fieldPresent
    && report.steps.verify.fieldOptions
    && report.steps.verify.fieldOptions.indexOf('未入金') >= 0
    && report.steps.verify.fieldOptions.indexOf('一部入金') >= 0
    && report.steps.verify.fieldOptions.indexOf('入金済み') >= 0
    && (report.steps.verify.app16Js || []).indexOf('store_payment_status.js') >= 0
    && (report.steps.verify.app92Js || []).indexOf('store_payment_status.js') >= 0
    && report.steps.verify92
    && report.steps.verify92.hasStatus
    && report.steps.verify.gateChecks
    && report.steps.verify.gateChecks.paid === true
    && report.steps.verify.gateChecks.unpaidBlocked === true
    && report.steps.verify.gateChecks.partialWithConfirm === true
    && JSON.stringify(report.steps.verify.gateChecks.putKeys) === JSON.stringify(['delivery_status'])
  );
  report.ok = ok;
  fs.writeFileSync(path.join(WORK_DIR, ok ? 'PROD_OK.json' : 'PROD_FAIL.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, 'docs/A550_PAYMENT_STATUS_PROD_DEPLOY_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(ok ? 'PROD_OK' : 'PROD_FAIL', WORK_DIR);
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  try {
    fs.writeFileSync(path.join(WORK_DIR, 'PROD_ERROR.json'), JSON.stringify({
      error: String(err && err.message ? err.message : err),
      stamp: STAMP,
    }, null, 2));
  } catch (_) {}
  process.exit(1);
});
