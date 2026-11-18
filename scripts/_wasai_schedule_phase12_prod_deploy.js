'use strict';

/**
 * 和裁士別仕事予定カレンダー — 第1・第2段階 本番反映（承認済み）
 *
 * 1. App73 バックアップ
 * 2. App73 に monthly_capacity 追加（既存5名は空のまま）
 * 3. ホスト App 新規作成
 * 4. HOST_APP_ID 設定して CSS→config→engine→desktop 登録
 * 5. App73/74/78 閲覧スモーク
 * 6. カレンダー動作スモーク
 *
 * App74 / App78 / App16 の処理・カスタマイズは変更しない。
 *
 *   node scripts/_wasai_schedule_phase12_prod_deploy.js
 * 前提: CDP :9222 にログイン済み kintone
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'wasai_schedule_phase12_prod_' + STAMP);

const APP73 = 73;
const APP74 = 74;
const APP78 = 78;
const FIELD_CODE = 'monthly_capacity';
const HOST_NAME = '和裁士別仕事予定カレンダー';

const FIELD_SPEC = {
  type: 'NUMBER',
  code: FIELD_CODE,
  label: '月間処理可能枚数',
  noLabel: false,
  required: false,
  unique: false,
  maxValue: '',
  minValue: '0',
  defaultValue: '',
  digit: false,
  displayScale: '0',
  unit: '枚',
  unitPosition: 'AFTER',
};

const CUSTOMIZE_CSS = ['wasai_schedule.css'];
const CUSTOMIZE_JS = [
  'wasai_schedule_config.js',
  'wasai_schedule_engine.js',
  'wasai_schedule_desktop.js',
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
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error('open failed ' + JSON.stringify(page));
  }
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
      expression: "({hasK:typeof kintone!=='undefined',url:location.href})",
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/i.test(s.result.value.url || '')) {
      break;
    }
  }
  return {
    id: page.id,
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

function ensureWorkDir() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
}

async function backupApp73() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP73}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const settings = await api('/k/v1/app/settings.json', 'GET', { app: ${APP73} });
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: ${APP73} });
      const layout = await api('/k/v1/app/form/layout.json', 'GET', { app: ${APP73} });
      let customize = null;
      try { customize = await api('/k/v1/app/customize.json', 'GET', { app: ${APP73} }); } catch (e) {
        customize = { error: String(e && e.message || e) };
      }
      const masters = await api('/k/v1/records.json', 'GET', {
        app: ${APP73},
        query: 'order by wasai_code asc limit 100',
        fields: ['$id', 'wasai_code', 'wasai_name', 'registration_statu', 'registration_status']
      });
      return { settings, fields, layout, customize, masters: masters.records || [] };
    })()`,
  });
  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'app73_backup.json'), JSON.stringify(value, null, 2));
  fs.writeFileSync(
    path.join(WORK_DIR, 'RESTORE.md'),
    [
      '# Wasai schedule Phase1+2 prod backup',
      '',
      'Stamp: ' + STAMP,
      'App73 fields/settings/layout/customize + master list snapshot.',
      'Host app customize backups are written as host_customize_before.json after create.',
      '',
      'Do not change App74/78/16.',
      '',
    ].join('\n')
  );
  return {
    name: value && value.settings && value.settings.name,
    hasCapacity: !!(value && value.fields && value.fields.properties && value.fields.properties[FIELD_CODE]),
    masterCount: (value && value.masters && value.masters.length) || 0,
  };
}

async function addMonthlyCapacityField() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP73}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${APP73};
        const FIELD = ${JSON.stringify(FIELD_SPEC)};
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const before = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
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
        if (before.properties[FIELD.code]) {
          const masters = await api('/k/v1/records.json', 'GET', {
            app: APP,
            query: 'order by wasai_code asc limit 20',
            fields: ['$id', 'wasai_code', 'wasai_name', FIELD.code]
          });
          return {
            ok: true,
            skipped: true,
            reason: 'already_exists',
            field: before.properties[FIELD.code],
            masters: (masters.records || []).map((r) => ({
              id: r.$id.value,
              code: r.wasai_code.value,
              name: r.wasai_name.value,
              capacity: r[FIELD.code] ? r[FIELD.code].value : null
            }))
          };
        }
        await api('/k/v1/preview/app/form/fields.json', 'POST', {
          app: APP,
          properties: { [FIELD.code]: FIELD }
        });
        const deployFields = await deployOnce();
        if (!deployFields || deployFields.status !== 'SUCCESS') {
          return { ok: false, stage: 'fields_deploy', deploy: deployFields };
        }

        const liveLayout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
        const layout = JSON.parse(JSON.stringify(liveLayout.layout || []));
        let deployLayout = null;
        let layoutAction = 'skip';
        if (!JSON.stringify(layout).includes(FIELD.code)) {
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
          let insertAt = filtered.length;
          filtered.forEach((row, i) => {
            if (row.type === 'ROW' && Array.isArray(row.fields)
              && row.fields.some((f) => f.code === 'wasai_name' || f.code === 'registration_statu')) {
              insertAt = i + 1;
            }
          });
          filtered.splice(insertAt, 0, {
            type: 'ROW',
            fields: [{ type: 'NUMBER', code: FIELD.code, size: { width: '193' } }]
          });
          await api('/k/v1/preview/app/form/layout.json', 'PUT', { app: APP, layout: filtered });
          deployLayout = await deployOnce();
          layoutAction = 'updated';
          if (!deployLayout || deployLayout.status !== 'SUCCESS') {
            return { ok: false, stage: 'layout_deploy', deploy: deployLayout };
          }
        }

        const after = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        const masters = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'order by wasai_code asc limit 20',
          fields: ['$id', 'wasai_code', 'wasai_name', FIELD.code]
        });
        return {
          ok: true,
          skipped: false,
          deployFields,
          deployLayout,
          layoutAction,
          field: after.properties[FIELD.code] || null,
          masters: (masters.records || []).map((r) => ({
            id: r.$id.value,
            code: r.wasai_code.value,
            name: r.wasai_name.value,
            capacity: r[FIELD.code] ? r[FIELD.code].value : null
          }))
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function createHostApp() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        // reuse if same name already exists among known free ids
        const probeIds = [];
        for (let i = 90; i <= 120; i++) probeIds.push(i);
        for (const id of probeIds) {
          try {
            const s = await api('/k/v1/app/settings.json', 'GET', { app: id });
            if (s && s.name === ${JSON.stringify(HOST_NAME)}) {
              return { ok: true, reused: true, appId: id, name: s.name };
            }
          } catch (e) {}
        }
        const created = await api('/k/v1/preview/app.json', 'POST', {
          name: ${JSON.stringify(HOST_NAME)}
        });
        const appId = Number(created.app);
        await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: appId }] });
        let last = null;
        for (let i = 0; i < 120; i++) {
          const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [appId] });
          last = (st.apps || [])[0];
          if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        if (!last || last.status !== 'SUCCESS') {
          return { ok: false, stage: 'create_deploy', deploy: last, created };
        }
        const settings = await api('/k/v1/app/settings.json', 'GET', { app: appId });
        return { ok: true, reused: false, appId, name: settings.name, created, deploy: last };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

function patchConfigHostId(hostAppId) {
  const configPath = path.join(ROOT, 'customize/wasai_schedule_config.js');
  let text = fs.readFileSync(configPath, 'utf8');
  if (!/HOST_APP_ID:\s*null/.test(text) && !/HOST_APP_ID:\s*\d+/.test(text)) {
    throw new Error('HOST_APP_ID pattern not found in config');
  }
  text = text.replace(/HOST_APP_ID:\s*null|HOST_APP_ID:\s*\d+/, 'HOST_APP_ID: ' + Number(hostAppId));
  fs.writeFileSync(configPath, text);
  return text.includes('HOST_APP_ID: ' + Number(hostAppId));
}

async function deployHostCustomize(hostAppId) {
  const filesMap = {};
  for (const name of CUSTOMIZE_CSS.concat(CUSTOMIZE_JS)) {
    filesMap[name] = readLocal(name);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/${hostAppId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${Number(hostAppId)};
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
            xhr.onerror = () => reject(new Error('upload network error'));
            xhr.send(fd);
          });
          let json = null;
          try { json = JSON.parse(bodyText); } catch (e) {}
          if (!json || !json.fileKey) throw new Error('upload fail ' + name + ' ' + String(bodyText).slice(0, 200));
          return json.fileKey;
        }
        let before = null;
        try { before = await api('/k/v1/app/customize.json', 'GET', { app: APP }); } catch (e) {
          before = { error: String(e && e.message || e) };
        }
        const desktop = { js: [], css: [] };
        for (const name of CSS) {
          desktop.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        }
        for (const name of JS) {
          desktop.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP,
          scope: 'ALL',
          desktop: desktop,
          mobile: { js: [], css: [] }
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
          .map((item) => (item.file && item.file.name) || item.url || item.type);
        return {
          ok: last && last.status === 'SUCCESS',
          deploy: last,
          before,
          afterNames: { js: names('js'), css: names('css') }
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function verifyRightsAndCalendar(hostAppId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${hostAppId}/`);
  // inject engine for aggregation check in-page
  const config = fs.readFileSync(path.join(ROOT, 'customize/wasai_schedule_config.js'), 'utf8');
  const engine = fs.readFileSync(path.join(ROOT, 'customize/wasai_schedule_engine.js'), 'utf8');
  await page.send('Runtime.evaluate', { expression: config });
  await page.send('Runtime.evaluate', { expression: engine });
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const hostId = kintone.app.getId();
        const rights = {};
        for (const app of [73, 74, 78]) {
          try {
            const r = await api('/k/v1/records.json', 'GET', {
              app, query: 'limit 1', fields: ['$id'], totalCount: true
            });
            rights[app] = { ok: true, totalCount: r.totalCount };
          } catch (e) {
            rights[app] = { ok: false, error: String(e && e.message || e) };
          }
        }
        const customize = await api('/k/v1/app/customize.json', 'GET', { app: hostId });
        const jsNames = ((customize.desktop && customize.desktop.js) || [])
          .map((item) => (item.file && item.file.name) || '');
        const cssNames = ((customize.desktop && customize.desktop.css) || [])
          .map((item) => (item.file && item.file.name) || '');
        const cfg = CAYANAS_WASAI_SCHEDULE;
        const Engine = CAYANAS_WasaiScheduleEngine;
        const mastersRaw = (await api('/k/v1/records.json', 'GET', {
          app: 73,
          query: Engine.masterQuery() + ' limit 100',
          fields: Engine.masterFetchFields({ includeCapacity: true })
        })).records || [];
        const masters = Engine.normalizeMasters(mastersRaw);
        const code = (masters.find((m) => m.wasaiCode === '002') || masters[0] || {}).wasaiCode || '';
        const today = Engine.todayParts(new Date());
        const out = (await api('/k/v1/records.json', 'GET', {
          app: 74,
          query: Engine.buildOutboundMonthQuery(code, today.year, today.month) + ' limit 100',
          fields: Engine.outboundFetchFields()
        })).records || [];
        let inbound = [];
        try {
          inbound = (await api('/k/v1/records.json', 'GET', {
            app: 78,
            query: Engine.inboundMonthQuery(today.year, today.month) + ' limit 100',
            fields: Engine.inboundFetchFields()
          })).records || [];
        } catch (e) {}
        const model = Engine.aggregateMonth(out, inbound, code, today.year, today.month);
        const selected = masters.find((m) => m.wasaiCode === code);
        // UI presence after index show — wait briefly for desktop mount
        await new Promise((r) => setTimeout(r, 1500));
        const root = document.getElementById('ayanas-wasai-schedule-root');
        const capacityText = root && root.querySelector('.cayan-ws-capacity')
          ? root.querySelector('.cayan-ws-capacity').textContent
          : '';
        const select = root && root.querySelector('#cayan-ws-wasai');
        return {
          ok: true,
          hostId,
          cfgHost: cfg.HOST_APP_ID,
          version: cfg.VERSION,
          rights,
          jsNames,
          cssNames,
          masters: masters.map((m) => ({
            code: m.wasaiCode,
            name: m.wasaiName,
            capacity: m.monthlyCapacity,
            label: m.monthlyCapacityLabel
          })),
          selectedCode: code,
          selectedCapacityLabel: selected && selected.monthlyCapacityLabel,
          month: model.label,
          totals: model.totals,
          uiMounted: !!root,
          capacityText: String(capacityText || '').slice(0, 120),
          selectOptions: select ? select.options.length : 0
        };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    })()`,
  });
  // screenshot
  await new Promise((r) => setTimeout(r, 500));
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  const shotPath = '/opt/cursor/artifacts/wasai_schedule_phase12_prod.png';
  fs.writeFileSync(shotPath, buf);
  fs.writeFileSync(path.join(WORK_DIR, 'prod_calendar.png'), buf);
  await page.close();
  const value = result.result && result.result.value;
  if (value) value.screenshot = shotPath;
  return value;
}

async function main() {
  ensureWorkDir();
  const report = { stamp: STAMP, workDir: WORK_DIR, steps: {} };

  console.log('1) backup App73…');
  report.steps.backup = await backupApp73();
  console.log(JSON.stringify(report.steps.backup));

  console.log('2) add monthly_capacity…');
  report.steps.field = await addMonthlyCapacityField();
  console.log(JSON.stringify(report.steps.field, null, 2));
  if (!report.steps.field || !report.steps.field.ok) {
    throw new Error('field add failed');
  }

  console.log('3) create host app…');
  report.steps.host = await createHostApp();
  console.log(JSON.stringify(report.steps.host, null, 2));
  if (!report.steps.host || !report.steps.host.ok) {
    throw new Error('host create failed');
  }
  const hostAppId = report.steps.host.appId;

  console.log('4) patch HOST_APP_ID =', hostAppId);
  report.steps.patchConfig = { ok: patchConfigHostId(hostAppId), hostAppId };

  console.log('5) deploy customize…');
  report.steps.customize = await deployHostCustomize(hostAppId);
  console.log(JSON.stringify(report.steps.customize, null, 2));
  if (!report.steps.customize || !report.steps.customize.ok) {
    throw new Error('customize deploy failed');
  }

  console.log('6) verify rights + calendar…');
  report.steps.verify = await verifyRightsAndCalendar(hostAppId);
  console.log(JSON.stringify(report.steps.verify, null, 2));

  fs.writeFileSync(path.join(WORK_DIR, 'deploy_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, 'docs/WASAI_WORK_SCHEDULE_PHASE12_PROD_DEPLOY_REPORT.json'), JSON.stringify(report, null, 2));
  console.log('DONE', WORK_DIR);
  if (!report.steps.verify || !report.steps.verify.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
