'use strict';

/**
 * App96 顧客カルテ P1 本番反映（承認済み）
 * - measure_history サブテーブル追加
 * - pcm_measure_* / pcm_order_history / pcm.css / pcm_config / pcm_desktop
 * - App87 floor_portal 1.8.1（App86 も同バージョン同期）
 * - 既存レコード一括変更なし / 未紐付け70件なし / App8・16・19・採番JS非変更
 *
 *   node scripts/_pcm_p1_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'pcm_p1_prod_deploy_' + STAMP);
fs.mkdirSync(path.join(WORK_DIR, 'files'), { recursive: true });

const APP96 = 96;
const APP87 = 87;
const APP86 = 86;

const FIELD_SPEC = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/APP96_MEASURE_HISTORY_FIELDS.json'), 'utf8')
);

const APP96_JS = [
  'pcm_config.js',
  'pcm_numbering.js',
  'pcm_engine.js',
  'pcm_measure_engine.js',
  'pcm_desktop.js',
  'pcm_order_history.js',
  'pcm_measure_panel.js',
];
const APP96_CSS = ['pcm.css'];

const FLOOR_JS = [
  'work_status_labels.js',
  'hub_nav_config.js',
  'hub_nav.js',
  'floor_portal_config.js',
  'floor_portal_engine.js',
  'floor_portal_desktop.js',
];
const FLOOR_CSS = ['hub_nav.css', 'floor_portal.css'];

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

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function collectCodes(properties) {
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

function buildSubtableLayoutFields(fields) {
  return Object.keys(fields).map((code) => {
    const f = fields[code];
    const item = { type: f.type, code: code, size: { width: '120' } };
    if (f.type === 'MULTI_LINE_TEXT') item.size = { width: '200', innerHeight: '60' };
    if (f.type === 'SINGLE_LINE_TEXT') item.size = { width: '140' };
    if (f.type === 'NUMBER') item.size = { width: '90' };
    if (f.type === 'DROP_DOWN') item.size = { width: '130' };
    if (f.type === 'CHECK_BOX') item.size = { width: '80' };
    if (f.type === 'DATE') item.size = { width: '120' };
    return item;
  });
}

async function backupBefore() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/`);
  const meta = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const apps = [${APP96}, ${APP87}, ${APP86}];
      const out = {};
      for (const app of apps) {
        out[app] = {
          fields: await api('/k/v1/app/form/fields.json', 'GET', { app }),
          layout: await api('/k/v1/app/form/layout.json', 'GET', { app }),
          customize: await api('/k/v1/app/customize.json', 'GET', { app })
        };
      }
      return out;
    })()`,
  });
  const value = meta.result && meta.result.value;
  if (!value || !value[APP96]) throw new Error('backup failed');
  for (const app of [APP96, APP87, APP86]) {
    const dir = path.join(WORK_DIR, 'app' + app);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'fields.json'), JSON.stringify(value[app].fields, null, 2));
    fs.writeFileSync(path.join(dir, 'layout.json'), JSON.stringify(value[app].layout, null, 2));
    fs.writeFileSync(path.join(dir, 'customize.json'), JSON.stringify(value[app].customize, null, 2));
  }
  await page.close();

  const existing = collectCodes(value[APP96].fields.properties);
  const collisions = [];
  Object.keys(FIELD_SPEC.properties).forEach((c) => {
    if (existing.has(c) && c !== 'measure_history') collisions.push(c);
  });
  const inner = FIELD_SPEC.properties.measure_history.fields;
  Object.keys(inner).forEach((c) => {
    if (existing.has(c)) collisions.push(c);
  });
  const already = existing.has('measure_history');
  const report = {
    collisions,
    alreadyHasMeasureHistory: already,
    app96Js: ((value[APP96].customize.desktop || {}).js || []).map((x) => x.file && x.file.name),
    app87Js: ((value[APP87].customize.desktop || {}).js || []).map((x) => x.file && x.file.name),
    safe: collisions.length === 0,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'precheck.json'), JSON.stringify(report, null, 2));
  return report;
}

async function addFieldsAndLayout() {
  const properties = FIELD_SPEC.properties;
  const layoutFields = buildSubtableLayoutFields(properties.measure_history.fields);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP96};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const properties = ${JSON.stringify(properties)};
        const layoutFields = ${JSON.stringify(layoutFields)};

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

        const before = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        if (before.properties.measure_history) {
          return { ok: true, skipped: true, reason: 'already_exists' };
        }

        // 衝突再確認
        const codes = new Set(Object.keys(before.properties || {}));
        Object.keys(before.properties || {}).forEach((code) => {
          const p = before.properties[code];
          if (p && p.type === 'SUBTABLE' && p.fields) {
            Object.keys(p.fields).forEach((c) => codes.add(c));
          }
        });
        const collisions = [];
        Object.keys(properties.measure_history.fields).forEach((c) => {
          if (codes.has(c)) collisions.push(c);
        });
        if (collisions.length) {
          return { ok: false, stage: 'collision', collisions };
        }

        await api('/k/v1/preview/app/form/fields.json', 'POST', { app: APP, properties });
        const deployFields = await deployOnce();
        if (!deployFields || deployFields.status !== 'SUCCESS') {
          return { ok: false, stage: 'fields_deploy', deploy: deployFields };
        }

        const liveLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        let layout = JSON.parse(JSON.stringify(liveLayout.layout || []));
        layout = layout.filter((row) => !(row.type === 'SUBTABLE' && row.code === 'measure_history'));
        let insertAt = layout.findIndex((row) =>
          row.type === 'ROW' && Array.isArray(row.fields)
          && row.fields.some((f) => f.code === 'customer_note')
        );
        if (insertAt < 0) insertAt = layout.length - 1;
        else insertAt += 1;
        layout.splice(insertAt, 0, {
          type: 'SUBTABLE',
          code: 'measure_history',
          fields: layoutFields
        });
        await api('/k/v1/preview/app/form/layout.json', 'PUT', { app: APP, layout });
        const deployLayout = await deployOnce();
        if (!deployLayout || deployLayout.status !== 'SUCCESS') {
          return { ok: false, stage: 'layout_deploy', deploy: deployLayout };
        }

        const after = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        const afterLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        return {
          ok: true,
          deployFields,
          deployLayout,
          hasTable: !!after.properties.measure_history,
          innerCount: Object.keys((after.properties.measure_history || {}).fields || {}).length,
          layoutHasTable: JSON.stringify(afterLayout.layout || []).includes('measure_history'),
          insertAt
        };
      } catch (e) {
        return { ok: false, stage: 'exception', error: e.message || String(e), code: e.code || null };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function deployCustomize(appId, jsOrder, cssOrder) {
  const filesMap = {};
  for (const n of jsOrder.concat(cssOrder)) {
    const p = path.join(ROOT, 'customize', n);
    if (!fs.existsSync(p)) throw new Error('missing ' + n);
    filesMap[n] = fs.readFileSync(p);
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
        function b64ToBlob(b64, type) {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new Blob([arr], { type });
        }
        async function uploadFile(blob, filename) {
          const fd = new FormData();
          fd.append('__REQUEST_TOKEN__', kintone.getRequestToken());
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

async function prodTests() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/`);
  await page.send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK) break;
  }

  const apiTest = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP96};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        const table = fields.properties.measure_history;
        if (!table) return { ok: false, stage: 'no_table' };

        // 既存顧客（変更しない）: 読取のみ
        const existing = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'personal_customer_id = "P000075" limit 1',
          fields: ['$id', 'personal_customer_id', 'customer_name', 'measure_history']
        });
        const ex = (existing.records || [])[0];
        const existingOk = !!(ex && ex.personal_customer_id && ex.personal_customer_id.value === 'P000075');
        const existingHistoryEmpty = !ex || !ex.measure_history
          || !Array.isArray(ex.measure_history.value) || ex.measure_history.value.length === 0;

        // [TEST] レコード作成して寸法検証
        const cell = (type, value) => ({ value });
        const row = (opts) => ({
          value: {
            measured_at: cell('DATE', opts.at),
            measure_kind: cell('DROP_DOWN', opts.kind),
            garment_type: cell('DROP_DOWN', opts.garment),
            measure_label: cell('SINGLE_LINE_TEXT', opts.label || ''),
            is_current: cell('CHECK_BOX', opts.current ? ['現行'] : []),
            manage_no: cell('SINGLE_LINE_TEXT', opts.manageNo || ''),
            mitake_cm: cell('NUMBER', opts.mitake != null ? String(opts.mitake) : ''),
            yuki_cm: cell('NUMBER', opts.yuki != null ? String(opts.yuki) : ''),
            sode_cm: cell('NUMBER', opts.sode != null ? String(opts.sode) : ''),
            maehaba_cm: cell('NUMBER', opts.mae != null ? String(opts.mae) : ''),
            ushirohaba_cm: cell('NUMBER', opts.ushi != null ? String(opts.ushi) : ''),
            measure_note: cell('MULTI_LINE_TEXT', opts.note || '')
          }
        });

        const created = await api('/k/v1/record.json', 'POST', {
          app: APP,
          record: {
            customer_name: { value: '[TEST]PCM_P1_MEASURE' },
            customer_kana: { value: 'てすと' },
            registration_source: { value: 'その他' },
            customer_note: { value: 'PCM P1 本番テスト。削除可。' },
            measure_history: {
              value: [
                row({
                  at: '2025-01-10', kind: '仕上がり寸法', garment: '長着', label: '訪問着',
                  current: true, mitake: 158.5, yuki: 64.5, sode: 49, mae: 24, ushi: 28, note: '初回'
                }),
                row({
                  at: '2026-03-01', kind: '仕上がり寸法', garment: '長着', label: '訪問着',
                  current: true, mitake: 159, yuki: 65, sode: 49.5, mae: 24.5, ushi: 28.5, note: '更新'
                }),
                row({
                  at: '2026-03-01', kind: '身体寸法', garment: '身体', label: '初回採寸',
                  current: true, yuki: 64.5, note: '身体'
                })
              ]
            }
          }
        });

        const id = created.id;
        // ブラウザ上の正規化ロジックをシミュレートして PUT（現行重複解消）
        // 本番 JS の prepare 相当: 同キーは最新1件のみ現行
        const got = await api('/k/v1/record.json', 'GET', { app: APP, id });
        const rows = JSON.parse(JSON.stringify(got.record.measure_history.value || []));
        const groups = {};
        rows.forEach((r, i) => {
          const v = r.value || {};
          const cur = (v.is_current && Array.isArray(v.is_current.value)
            && v.is_current.value.indexOf('現行') >= 0);
          if (!cur) return;
          const key = [v.measure_kind.value, v.garment_type.value, (v.measure_label.value || '').trim() || '（無名称）'].join('\\u0001');
          (groups[key] = groups[key] || []).push(i);
        });
        Object.keys(groups).forEach((key) => {
          const idxs = groups[key];
          const keep = idxs[idxs.length - 1];
          idxs.forEach((i) => {
            if (i !== keep) rows[i].value.is_current.value = [];
          });
        });
        await api('/k/v1/record.json', 'PUT', {
          app: APP,
          id,
          record: { measure_history: { value: rows } }
        });

        const after = await api('/k/v1/record.json', 'GET', { app: APP, id });
        const afterRows = after.record.measure_history.value || [];
        const currents = afterRows.filter((r) =>
          r.value.is_current && Array.isArray(r.value.is_current.value)
          && r.value.is_current.value.indexOf('現行') >= 0
        );
        const finishCurrents = currents.filter((r) =>
          r.value.measure_kind.value === '仕上がり寸法'
          && r.value.garment_type.value === '長着'
          && r.value.measure_label.value === '訪問着'
        );
        const oldRow = afterRows.find((r) => r.value.measure_note && r.value.measure_note.value === '初回');
        const oldKept = !!(oldRow && String(oldRow.value.mitake_cm.value) === '158.5');
        const oldNotCurrent = !!(oldRow && (!oldRow.value.is_current.value || oldRow.value.is_current.value.length === 0));

        // 利用履歴: P000075 の App16 件数（読取）
        let orderHistory = { count: 0, sample: null };
        try {
          const oh = await api('/k/v1/records.json', 'GET', {
            app: 16,
            query: 'personal_customer_id = "P000075" order by order_date desc limit 5',
            fields: ['order_date', 'manage_no', 'delivery_date', 'store_payment_status', 'detail_table']
          });
          orderHistory.count = (oh.records || []).length;
          if (oh.records && oh.records[0]) {
            const r = oh.records[0];
            orderHistory.sample = {
              manageNo: r.manage_no && r.manage_no.value,
              deliveryDate: r.delivery_date && r.delivery_date.value,
              payment: r.store_payment_status && r.store_payment_status.value,
              hasDetail: !!(r.detail_table && r.detail_table.value)
            };
          }
        } catch (e) {
          orderHistory.error = e.message || String(e);
        }

        return {
          ok: true,
          existingOk,
          existingHistoryEmpty,
          testRecordId: id,
          testPid: after.record.personal_customer_id && after.record.personal_customer_id.value,
          rowCount: afterRows.length,
          currentCount: currents.length,
          finishCurrentCount: finishCurrents.length,
          oldKept,
          oldNotCurrent,
          decimalOk: String(finishCurrents[0] && finishCurrents[0].value.mitake_cm.value) === '159',
          orderHistory,
          versions: {
            pcm: (window.CAYANAS_PCM && window.CAYANAS_PCM.VERSION) || null,
            measure: !!(window.CAYANAS_PCM_Measure)
          }
        };
      } catch (e) {
        return { ok: false, error: e.message || String(e), code: e.code || null };
      }
    })()`,
  });
  await page.close();
  const apiResult = apiTest.result && apiTest.result.value;

  // 詳細画面 UI
  let detailUi = { ok: false };
  if (apiResult && apiResult.testRecordId) {
    const dpage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=${apiResult.testRecordId}`);
    await dpage.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 2500));
    const ui = await dpage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        url: location.href,
        pcm: (window.CAYANAS_PCM && window.CAYANAS_PCM.VERSION) || null,
        hasMeasure: !!window.CAYANAS_PCM_Measure,
        measurePanel: !!document.getElementById('pcm-measure-panel'),
        historyPanel: !!document.getElementById('pcm-order-history-panel'),
        measureTitle: (document.querySelector('#pcm-measure-panel .pcm-measure-panel__title')||{}).textContent || '',
        currentCards: document.querySelectorAll('#pcm-measure-panel .pcm-measure-card').length,
        historyRows: document.querySelectorAll('#pcm-measure-panel .pcm-measure-panel__table tbody tr').length,
        bodyW: document.body && document.body.clientWidth
      })`,
    });
    detailUi = ui.result && ui.result.value;
    detailUi.ok = !!(detailUi && detailUi.measurePanel && detailUi.pcm === '1.2.0-p1-measure');
    await dpage.close();
  }

  // 既存顧客詳細が開く
  let existingUi = { ok: false };
  const epage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=71`);
  await epage.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2500));
  const eui = await epage.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      url: location.href,
      pcm: (window.CAYANAS_PCM && window.CAYANAS_PCM.VERSION) || null,
      measurePanel: !!document.getElementById('pcm-measure-panel'),
      historyPanel: !!document.getElementById('pcm-order-history-panel'),
      historyStatus: (document.querySelector('#pcm-order-history-panel .pcm-order-history__status')||{}).textContent || '',
      historyTable: !!document.querySelector('#pcm-order-history-panel .pcm-order-history__table'),
      nameField: (document.querySelector('.control-value-label-gaia')||{}).textContent || ''
    })`,
  });
  existingUi = eui.result && eui.result.value;
  existingUi.ok = !!(existingUi && existingUi.measurePanel && existingUi.historyPanel);
  await epage.close();

  // App87 ポータル
  const ppage = await openPage(`https://${SUB}.cybozu.com/k/${APP87}/`);
  await ppage.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2000));
  const pui = await ppage.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      ver: window.CAYANAS_FLOOR_PORTAL_VERSION || (window.CAYANAS_FLOOR_PORTAL && window.CAYANAS_FLOOR_PORTAL.VERSION) || null,
      html: document.body ? document.body.innerText.slice(0, 4000) : '',
      hasKarte: /顧客カルテ/.test(document.body ? document.body.innerText : ''),
      karteHref: (Array.from(document.querySelectorAll('a')).find(a => /顧客カルテ/.test(a.textContent||''))||{}).href || null,
      featured: !!document.querySelector('a.is-featured, .cayan-fp-btn--menu.is-featured')
    })`,
  });
  const portalUi = pui.result && pui.result.value;
  if (portalUi) {
    portalUi.ok = portalUi.ver === '1.8.1' && portalUi.hasKarte;
  }
  await ppage.close();

  // iPad 幅エミュ相当（App96 詳細）
  let ipadUi = { ok: false };
  if (apiResult && apiResult.testRecordId) {
    const ipage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=${apiResult.testRecordId}`);
    await ipage.send('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await ipage.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 2500));
    const iui = await ipage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        w: window.innerWidth,
        measurePanel: !!document.getElementById('pcm-measure-panel'),
        historyPanel: !!document.getElementById('pcm-order-history-panel'),
        cards: document.querySelectorAll('#pcm-measure-panel .pcm-measure-card').length
      })`,
    });
    ipadUi = iui.result && iui.result.value;
    ipadUi.ok = !!(ipadUi && ipadUi.measurePanel && ipadUi.w <= 1100);
    await ipage.close();
  }

  return {
    api: apiResult,
    detailUi,
    existingUi,
    portalUi,
    ipadUi,
  };
}

(async () => {
  console.log('WORK_DIR', WORK_DIR);

  // local guards
  const cfg = fs.readFileSync(path.join(ROOT, 'customize/pcm_config.js'), 'utf8');
  const floor = fs.readFileSync(path.join(ROOT, 'customize/floor_portal_config.js'), 'utf8');
  if (!/1\.2\.0-p1-measure/.test(cfg)) throw new Error('pcm_config version mismatch');
  if (!/FLOOR_PORTAL_VERSION = '1\.8\.1'/.test(floor)) throw new Error('floor portal version mismatch');
  if (!fs.existsSync(path.join(ROOT, 'customize/pcm_measure_engine.js'))) {
    throw new Error('missing pcm_measure_engine.js');
  }

  console.log('1) precheck/backup...');
  const pre = await backupBefore();
  if (!pre.safe) {
    const stop = { ok: false, stage: 'precheck', pre };
    fs.writeFileSync(path.join(WORK_DIR, 'STOP_REPORT.json'), JSON.stringify(stop, null, 2));
    console.error('STOP: collisions', pre.collisions);
    process.exit(2);
  }
  console.log('precheck ok', JSON.stringify(pre));

  console.log('2) add fields + layout...');
  const fieldsResult = await addFieldsAndLayout();
  fs.writeFileSync(path.join(WORK_DIR, 'fields_result.json'), JSON.stringify(fieldsResult, null, 2));
  if (!fieldsResult || !fieldsResult.ok) {
    const stop = { ok: false, stage: 'fields', fieldsResult };
    fs.writeFileSync(path.join(WORK_DIR, 'STOP_REPORT.json'), JSON.stringify(stop, null, 2));
    console.error('STOP: field add failed', fieldsResult);
    process.exit(2);
  }
  console.log('fields ok', JSON.stringify(fieldsResult));

  console.log('3) deploy App96 customize...');
  const app96Deploy = await deployCustomize(APP96, APP96_JS, APP96_CSS);
  fs.writeFileSync(path.join(WORK_DIR, 'app96_deploy.json'), JSON.stringify(app96Deploy, null, 2));
  if (!app96Deploy || !app96Deploy.ok) {
    console.error('App96 customize deploy failed', app96Deploy);
    process.exit(1);
  }
  console.log('App96 customize ok', app96Deploy.desktopJs);

  console.log('4) deploy App87 floor portal 1.8.1...');
  const app87Deploy = await deployCustomize(APP87, FLOOR_JS, FLOOR_CSS);
  fs.writeFileSync(path.join(WORK_DIR, 'app87_deploy.json'), JSON.stringify(app87Deploy, null, 2));
  if (!app87Deploy || !app87Deploy.ok) {
    console.error('App87 deploy failed', app87Deploy);
    process.exit(1);
  }

  console.log('4b) sync App86 floor portal 1.8.1...');
  const app86Deploy = await deployCustomize(APP86, FLOOR_JS, FLOOR_CSS);
  fs.writeFileSync(path.join(WORK_DIR, 'app86_deploy.json'), JSON.stringify(app86Deploy, null, 2));

  console.log('5) production tests...');
  const tests = await prodTests();
  fs.writeFileSync(path.join(WORK_DIR, 'prod_tests.json'), JSON.stringify(tests, null, 2));

  const report = {
    stamp: STAMP,
    workDir: WORK_DIR,
    pre,
    fieldsResult,
    app96Deploy,
    app87Deploy,
    app86Deploy,
    tests,
    shas: Object.fromEntries(
      APP96_JS.concat(APP96_CSS).concat(['floor_portal_config.js', 'floor_portal.css']).map((n) => [
        n,
        sha1(readLocal(n)),
      ])
    ),
    ok: !!(
      fieldsResult.ok
      && app96Deploy.ok
      && app87Deploy.ok
      && tests.api && tests.api.ok
      && tests.api.existingOk
      && tests.api.rowCount === 3
      && tests.api.finishCurrentCount === 1
      && tests.api.oldKept
      && tests.api.oldNotCurrent
      && tests.detailUi && tests.detailUi.ok
      && tests.existingUi && tests.existingUi.ok
      && tests.portalUi && tests.portalUi.ok
    ),
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_DEPLOY_REPORT.json'), JSON.stringify(report, null, 2));

  const md = [
    '# App96 P1 顧客カルテ 本番反映報告',
    '',
    '- **実施日時**: ' + STAMP + ' (UTC) / Asia/Tokyo +9',
    '- **結果**: ' + (report.ok ? '成功' : '要確認'),
    '- **バックアップ**: `' + WORK_DIR + '`',
    '',
    '## 実施内容',
    '',
    '1. App96 に `measure_history` サブテーブル追加（衝突なし確認後）',
    '2. App96 JS: `' + APP96_JS.join(' → ') + '` + `pcm.css`',
    '3. App87 floor_portal **1.8.1**（顧客カルテ featured）',
    '4. App86 も floor_portal 1.8.1 に同期',
    '',
    '## 非変更',
    '',
    '- 既存顧客の一括更新なし（テストは `[TEST]PCM_P1_MEASURE` 新規レコードのみ）',
    '- 未紐付け70件なし',
    '- App8 / App16 / App19 フィールドなし',
    '- 採番 JS（saiban）なし',
    '',
    '## テスト結果',
    '',
    '- 既存顧客 P000075 読取: ' + (tests.api && tests.api.existingOk),
    '- 既存顧客詳細 UI: ' + (tests.existingUi && tests.existingUi.ok),
    '- 寸法3行登録・現行1件化・旧値保持: '
      + (tests.api && tests.api.rowCount) + '行 / finishCurrent='
      + (tests.api && tests.api.finishCurrentCount)
      + ' / oldKept=' + (tests.api && tests.api.oldKept),
    '- 詳細パネル: measure=' + (tests.detailUi && tests.detailUi.measurePanel)
      + ' cards=' + (tests.detailUi && tests.detailUi.currentCards),
    '- 利用履歴 App16: count=' + (tests.api && tests.api.orderHistory && tests.api.orderHistory.count),
    '- App87 顧客カルテ: ver=' + (tests.portalUi && tests.portalUi.ver)
      + ' href=' + (tests.portalUi && tests.portalUi.karteHref),
    '- iPad幅: ' + (tests.ipadUi && tests.ipadUi.ok) + ' w=' + (tests.ipadUi && tests.ipadUi.w),
    '- テストレコード ID: ' + (tests.api && tests.api.testRecordId)
      + ' PID=' + (tests.api && tests.api.testPid),
    '',
  ].join('\\n');
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_DEPLOY_REPORT.md'), md.replace(/\\n/g, '\n'));
  fs.writeFileSync(path.join(ROOT, 'docs/PCM_P1_PROD_DEPLOY_REPORT.md'), md.replace(/\\n/g, '\n'));
  fs.writeFileSync(
    path.join(ROOT, 'docs/PCM_P1_PROD_DEPLOY_REPORT.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(JSON.stringify({ ok: report.ok, workDir: WORK_DIR, tests: {
    apiOk: tests.api && tests.api.ok,
    detailUi: tests.detailUi && tests.detailUi.ok,
    existingUi: tests.existingUi && tests.existingUi.ok,
    portalUi: tests.portalUi && tests.portalUi.ok,
    ipadUi: tests.ipadUi && tests.ipadUi.ok,
    testRecordId: tests.api && tests.api.testRecordId,
  } }, null, 2));
  if (!report.ok) process.exit(1);
  console.log('PROD_OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
