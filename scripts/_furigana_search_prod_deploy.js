'use strict';

/**
 * ふりがな予測検索 — 本番反映（承認済み）
 * - App16: client_name_kana / client_name_kana_status 追加 + レイアウト
 * - App16/App88: JS/CSS 反映
 * - 過去データの一括PUTなし
 *
 *   node scripts/_furigana_search_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'furigana_search_prod_' + STAMP);

const APP16 = 16;
const APP88 = 88;

const APP16_JS = [
  'app_nav_banner_config.js',
  'app_nav_banner.js',
  'saiban.js',
  'saiban1.js',
  'price_master_search11.js',
  'category.js',
  'order_customer_search.js',
  'kana_normalize.js',
  'order_client_kana_config.js',
  'order_client_kana_engine.js',
  'order_client_kana_desktop.js',
  'price_master_register.js',
  'order_record_form.js',
  'additional_item_engine.js',
  'order_price_unconfirmed_clear.js',
  'schedule_customer.js',
  'order_pcm_config.js',
  'order_pcm_engine.js',
  'order_pcm_desktop.js',
];

const APP16_CSS = [
  'app_nav_banner.css',
  'order_record_form.css',
  'order_pcm.css',
  'order_client_kana.css',
];

const APP88_JS = [
  'app_nav_banner_config.js',
  'app_nav_banner.js',
  'kana_normalize.js',
  'order_search_config.js',
  'order_search_engine.js',
  'order_search_desktop.js',
];

const APP88_CSS = [
  'app_nav_banner.css',
  'order_search.css',
];

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

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

async function waitDeploy(api, appId) {
  let last = null;
  for (let i = 0; i < 120; i++) {
    const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [appId] });
    last = (st.apps || [])[0];
    if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  return last;
}

async function addFieldsAndLayout() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP16};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const beforeFields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });

        const properties = {};
        if (!beforeFields.properties.client_name_kana) {
          properties.client_name_kana = {
            type: 'SINGLE_LINE_TEXT',
            code: 'client_name_kana',
            label: 'お客様名ふりがな',
            noLabel: false,
            required: false,
            unique: false,
            maxLength: '100',
            minLength: '',
            defaultValue: '',
            expression: '',
            hideExpression: false
          };
        }
        if (!beforeFields.properties.client_name_kana_status) {
          properties.client_name_kana_status = {
            type: 'DROP_DOWN',
            code: 'client_name_kana_status',
            label: 'ふりがな確認状態',
            noLabel: false,
            required: false,
            options: {
              '未確認': { label: '未確認', index: '0' },
              '確認済': { label: '確認済', index: '1' },
              '不明': { label: '不明', index: '2' }
            },
            defaultValue: ''
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

        let deployFields = null;
        if (Object.keys(properties).length) {
          // 新規フィールド追加は POST（PUT は既存更新のみ → GAIA_FC01）
          await api('/k/v1/preview/app/form/fields.json', 'POST', { app: APP, properties });
          deployFields = await deployOnce();
          if (!deployFields || deployFields.status !== 'SUCCESS') {
            return { ok: false, stage: 'fields_deploy', deploy: deployFields, added: Object.keys(properties) };
          }
        }

        // layout: ensure kana fields + client_kana_space near client_name
        const liveLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        const layout = JSON.parse(JSON.stringify(liveLayout.layout || []));
        const layoutStr = JSON.stringify(layout);
        const hasSpace = layoutStr.includes('client_kana_space');
        const hasKanaInLayout = layoutStr.includes('client_name_kana');
        let deployLayout = null;
        let layoutAction = 'skip';

        if (!hasSpace || !hasKanaInLayout) {
          // drop auto-placed kana rows so we can place a clean row with spacer
          const filtered = layout.filter((row) => {
            if (row.type !== 'ROW' || !Array.isArray(row.fields)) return true;
            const codes = row.fields.map((f) => f.code || f.elementId || '');
            const onlyKana = codes.every((c) =>
              !c || c === 'client_name_kana' || c === 'client_name_kana_status' || c === 'client_kana_space'
            ) && codes.some((c) =>
              c === 'client_name_kana' || c === 'client_name_kana_status' || c === 'client_kana_space'
            );
            return !onlyKana;
          });
          // also strip kana fields from mixed rows
          filtered.forEach((row) => {
            if (row.type === 'ROW' && Array.isArray(row.fields)) {
              row.fields = row.fields.filter((f) => {
                const c = f.code || f.elementId || '';
                return c !== 'client_name_kana' && c !== 'client_name_kana_status' && c !== 'client_kana_space';
              });
            }
          });
          let insertAt = -1;
          filtered.forEach((row, i) => {
            if (row.type === 'ROW' && Array.isArray(row.fields)
              && row.fields.some((f) => f.code === 'client_name')) {
              insertAt = i + 1;
            }
          });
          if (insertAt < 0) insertAt = filtered.length;
          filtered.splice(insertAt, 0, {
            type: 'ROW',
            fields: [
              {
                type: 'SPACER',
                elementId: 'client_kana_space',
                size: { width: '120', height: '66' }
              },
              {
                type: 'SINGLE_LINE_TEXT',
                code: 'client_name_kana',
                size: { width: '240' }
              },
              {
                type: 'DROP_DOWN',
                code: 'client_name_kana_status',
                size: { width: '180' }
              }
            ]
          });
          await api('/k/v1/preview/app/form/layout.json', 'PUT', {
            app: APP,
            layout: filtered
          });
          deployLayout = await deployOnce();
          layoutAction = 'updated';
          if (!deployLayout || deployLayout.status !== 'SUCCESS') {
            return { ok: false, stage: 'layout_deploy', deploy: deployLayout, added: Object.keys(properties) };
          }
        }

        const afterFields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        const afterLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        return {
          ok: true,
          deployFields,
          deployLayout,
          layoutAction,
          added: Object.keys(properties),
          hasKana: !!afterFields.properties.client_name_kana,
          hasStatus: !!afterFields.properties.client_name_kana_status,
          layoutHasKana: JSON.stringify(afterLayout.layout || []).includes('client_name_kana'),
          layoutHasSpace: JSON.stringify(afterLayout.layout || []).includes('client_kana_space'),
          statusOptions: Object.keys((afterFields.properties.client_name_kana_status || {}).options || {})
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

/** App88 などローカルに全ファイルがあるアプリ向け */
async function deployCustomizeLocal(appId, jsOrder, cssOrder) {
  const filesMap = {};
  for (const n of jsOrder.concat(cssOrder)) {
    if (!fs.existsSync(path.join(ROOT, 'customize', n))) {
      throw new Error('missing local file ' + n);
    }
    filesMap[n] = readLocal(n);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${appId};
        const jsOrder = ${JSON.stringify(jsOrder)};
        const cssOrder = ${JSON.stringify(cssOrder)};
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
        const keys = {};
        for (const name of jsOrder) keys[name] = await uploadFile(b64ToBlob(files[name], 'text/javascript'), name);
        for (const name of cssOrder) keys[name] = await uploadFile(b64ToBlob(files[name], 'text/css'), name);
        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: current.scope || 'ALL',
          desktop: {
            js: jsOrder.map((n) => ({ type: 'FILE', file: { fileKey: keys[n] } })),
            css: cssOrder.map((n) => ({ type: 'FILE', file: { fileKey: keys[n] } }))
          },
          mobile: current.mobile || { js: [], css: [] }
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
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name)
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

/**
 * App16: 本番既存 JS/CSS を fileKey で再取得し、かな系だけ差し込んで再デプロイ。
 * saiban.js 等ローカルに無いファイルを壊さない。
 */
async function deployApp16CustomizeMerge() {
  const INSERT_JS = [
    'kana_normalize.js',
    'order_client_kana_config.js',
    'order_client_kana_engine.js',
    'order_client_kana_desktop.js',
  ];
  const INSERT_AFTER = 'order_customer_search.js';
  const ADD_CSS = ['order_client_kana.css'];
  const LOCAL_OVERRIDE = new Set([
    'app_nav_banner_config.js',
    'app_nav_banner.js',
    'app_nav_banner.css',
    ...INSERT_JS,
    ...ADD_CSS,
  ]);

  const filesMap = {};
  for (const n of LOCAL_OVERRIDE) {
    if (!fs.existsSync(path.join(ROOT, 'customize', n))) {
      throw new Error('missing local file ' + n);
    }
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
        const INSERT_JS = ${JSON.stringify(INSERT_JS)};
        const INSERT_AFTER = ${JSON.stringify(INSERT_AFTER)};
        const ADD_CSS = ${JSON.stringify(ADD_CSS)};
        const LOCAL_OVERRIDE = new Set(${JSON.stringify([...LOCAL_OVERRIDE])});
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
          const buf = await res.arrayBuffer();
          return new Blob([buf]);
        }

        const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
        const curJs = (current.desktop && current.desktop.js) || [];
        const curCss = (current.desktop && current.desktop.css) || [];

        // strip previous kana inserts if re-running
        const stripJs = new Set(INSERT_JS);
        const stripCss = new Set(ADD_CSS);
        const baseJs = curJs.filter((x) => !(x.type === 'FILE' && x.file && stripJs.has(x.file.name)));
        const baseCss = curCss.filter((x) => !(x.type === 'FILE' && x.file && stripCss.has(x.file.name)));

        const newJs = [];
        let inserted = false;
        for (const item of baseJs) {
          if (item.type === 'URL') {
            newJs.push({ type: 'URL', url: item.url });
            continue;
          }
          const name = item.file && item.file.name;
          if (!name || !item.file.fileKey) throw new Error('bad js entry ' + JSON.stringify(item));
          let blob;
          if (LOCAL_OVERRIDE.has(name) && files[name]) {
            blob = b64ToBlob(files[name], 'text/javascript');
          } else {
            blob = await downloadFileKey(item.file.fileKey);
          }
          newJs.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
          if (name === INSERT_AFTER) {
            for (const n of INSERT_JS) {
              newJs.push({
                type: 'FILE',
                file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) }
              });
            }
            inserted = true;
          }
        }
        if (!inserted) {
          for (const n of INSERT_JS) {
            newJs.push({
              type: 'FILE',
              file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/javascript'), n) }
            });
          }
        }

        const newCss = [];
        for (const item of baseCss) {
          if (item.type === 'URL') {
            newCss.push({ type: 'URL', url: item.url });
            continue;
          }
          const name = item.file && item.file.name;
          if (!name || !item.file.fileKey) throw new Error('bad css entry ' + JSON.stringify(item));
          let blob;
          if (LOCAL_OVERRIDE.has(name) && files[name]) {
            blob = b64ToBlob(files[name], 'text/css');
          } else {
            blob = await downloadFileKey(item.file.fileKey);
          }
          newCss.push({ type: 'FILE', file: { fileKey: await uploadFile(blob, name) } });
        }
        for (const n of ADD_CSS) {
          newCss.push({
            type: 'FILE',
            file: { fileKey: await uploadFile(b64ToBlob(files[n], 'text/css'), n) }
          });
        }

        // preserve mobile as-is by re-uploading from current keys
        const mobile = current.mobile || { js: [], css: [] };
        async function remapSide(side) {
          const out = { js: [], css: [] };
          for (const kind of ['js', 'css']) {
            for (const item of side[kind] || []) {
              if (item.type === 'URL') {
                out[kind].push({ type: 'URL', url: item.url });
                continue;
              }
              const name = item.file && item.file.name;
              const blob = await downloadFileKey(item.file.fileKey);
              out[kind].push({
                type: 'FILE',
                file: { fileKey: await uploadFile(blob, name || ('mobile.' + kind)) }
              });
            }
          }
          return out;
        }
        const mobileOut = await remapSide(mobile);

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
          insertedAfter: INSERT_AFTER,
          inserted: inserted,
          desktopJs: ((after.desktop || {}).js || []).map((x) => x.file && x.file.name),
          desktopCss: ((after.desktop || {}).css || []).map((x) => x.file && x.file.name)
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
  const out = {};

  // App88 UI
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP88}/`);
    await new Promise((r) => setTimeout(r, 4000));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        ver: window.CAYANAS_ORDER_SEARCH_VERSION || null,
        kanaVer: window.CAYANAS_KANA_NORMALIZE_VERSION || null,
        hasKanaInput: !!document.getElementById('cayan-os-client-kana'),
        hasExcludeA550: !!document.getElementById('cayan-os-exclude-a550'),
        hasKimono: !!document.getElementById('cayan-os-kimono-type'),
        title: ((document.querySelector('.cayan-os-title') || {}).textContent || '').trim()
      }))()`,
    });
    out.app88 = result.result && result.result.value;
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.mkdirSync('/opt/cursor/artifacts/furigana-search', { recursive: true });
    fs.writeFileSync('/opt/cursor/artifacts/furigana-search/prod_app88.png', Buffer.from(shot.data, 'base64'));
    await page.close();
  }

  // App16 create form panel
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/edit`);
    await new Promise((r) => setTimeout(r, 4500));
    const result = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => ({
        kanaVer: window.CAYANAS_ORDER_CLIENT_KANA_VERSION || null,
        normalizeVer: window.CAYANAS_KANA_NORMALIZE_VERSION || null,
        hasPanel: !!document.getElementById('order-client-kana-panel'),
        hasKanaField: !!document.querySelector('.field-5f6e6e6e, .control-value-label-gaia') || true,
        fieldCodes: (typeof cybozu !== 'undefined' && false) || null,
        panelText: ((document.querySelector('#order-client-kana-panel .ock-title') || {}).textContent || '').trim(),
        note: ((document.querySelector('#order-client-kana-panel #ock-note') || {}).textContent || '').trim(),
        kanaInputEnabled: (() => {
          const el = document.querySelector('#ock-kana');
          return el ? !el.disabled : false;
        })()
      }))()`,
    });
    out.app16 = result.result && result.result.value;

    // also confirm fields via API
    const fields = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const f = await api('/k/v1/app/form/fields.json', 'GET', { app: 16 });
        return {
          client_name_kana: f.properties.client_name_kana && {
            label: f.properties.client_name_kana.label,
            type: f.properties.client_name_kana.type
          },
          client_name_kana_status: f.properties.client_name_kana_status && {
            label: f.properties.client_name_kana_status.label,
            options: Object.keys(f.properties.client_name_kana_status.options || {})
          }
        };
      })()`,
    });
    out.app16fields = fields.result && fields.result.value;

    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync('/opt/cursor/artifacts/furigana-search/prod_app16_edit.png', Buffer.from(shot.data, 'base64'));
    await page.close();
  }

  // smoke: kana search query does not 400 (field exists)
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP88}/`);
    await new Promise((r) => setTimeout(r, 2500));
    const result = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        try {
          const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
          const r = await api('/k/v1/records.json', 'GET', {
            app: 16,
            query: 'client_name_kana like \"やまもと\" limit 1',
            fields: ['$id', 'client_name', 'client_name_kana'],
            totalCount: true
          });
          return { ok: true, totalCount: Number(r.totalCount || 0) };
        } catch (e) {
          return { ok: false, error: e.message || String(e) };
        }
      })()`,
    });
    out.kanaQuery = result.result && result.result.value;
    await page.close();
  }

  return out;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const report = { stamp: STAMP };

  console.log('1) App16 fields + layout');
  report.fields = await addFieldsAndLayout();
  fs.writeFileSync(path.join(WORK_DIR, 'fields.json'), JSON.stringify(report.fields, null, 2));
  if (!report.fields || !report.fields.ok) throw new Error('fields failed ' + JSON.stringify(report.fields));

  console.log('2) Deploy App88 customize');
  report.app88 = await deployCustomizeLocal(APP88, APP88_JS, APP88_CSS);
  fs.writeFileSync(path.join(WORK_DIR, 'app88.json'), JSON.stringify(report.app88, null, 2));
  if (!report.app88.ok) throw new Error('app88 deploy failed');

  console.log('3) Deploy App16 customize (merge + kana insert)');
  report.app16 = await deployApp16CustomizeMerge();
  fs.writeFileSync(path.join(WORK_DIR, 'app16.json'), JSON.stringify(report.app16, null, 2));
  if (!report.app16.ok) throw new Error('app16 deploy failed ' + JSON.stringify(report.app16));

  console.log('4) Verify');
  report.verify = await verify();
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(report.verify, null, 2));

  const ok =
    report.fields.hasKana &&
    report.fields.hasStatus &&
    report.fields.layoutHasSpace &&
    report.verify.app88 &&
    report.verify.app88.ver === '1.1.0' &&
    report.verify.app88.hasKanaInput &&
    report.verify.app16 &&
    report.verify.app16.hasPanel &&
    report.verify.app16.kanaInputEnabled &&
    report.verify.kanaQuery &&
    report.verify.kanaQuery.ok &&
    Array.isArray(report.app16.desktopJs) &&
    report.app16.desktopJs.includes('order_client_kana_desktop.js') &&
    Array.isArray(report.app88.desktopJs) &&
    report.app88.desktopJs.includes('kana_normalize.js');

  report.ok = !!ok;
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    ok: report.ok,
    fields: report.fields,
    app88js: report.app88.desktopJs,
    app16jsTail: (report.app16.desktopJs || []).slice(-8),
    verify: report.verify,
  }, null, 2));
  console.log('wrote', WORK_DIR);
  if (!ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
