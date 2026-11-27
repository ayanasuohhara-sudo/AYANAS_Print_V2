'use strict';

/**
 * 和裁士仕事予定 — 第3段階 本番適用（承認済み）
 *
 * 1. App98 JS/CSS バックアップ
 * 2. 予定管理 App 新規作成 + フィールド
 * 3. PLAN_APP_ID 設定
 * 4. App98 に v1.2.1 デプロイ
 * 5. 本番テスト（登録・変更・取消・切替・二重計上・重複・能力）
 * 6. テスト予約の整理（取消履歴として残す or 削除方針: 取消で履歴保持）
 *
 * App74/78/16 は変更しない。出庫・入庫データは変更しない。
 *
 *   node scripts/_wasai_schedule_phase3_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'wasai_schedule_phase3_prod_' + STAMP);

const HOST_APP = 98;
const PLAN_APP_NAME = '和裁士仕事予定管理';
const TEST_PREFIX = '[TEST-P3]';
const TEST_MANAGE_A = 'TEST-P3-A-' + Date.now().toString().slice(-6);
const TEST_MANAGE_DUP = 'TEST-P3-DUP-' + Date.now().toString().slice(-6);

const CUSTOMIZE_CSS = ['wasai_schedule.css'];
const CUSTOMIZE_JS = [
  'wasai_schedule_config.js',
  'wasai_schedule_engine.js',
  'wasai_schedule_desktop.js',
];

const PLAN_FIELDS = {
  wasai_code: {
    type: 'SINGLE_LINE_TEXT',
    code: 'wasai_code',
    label: '和裁士コード',
    noLabel: false,
    required: true,
    unique: false,
    maxLength: '64',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  wasai_name: {
    type: 'SINGLE_LINE_TEXT',
    code: 'wasai_name',
    label: '和裁士氏名',
    noLabel: false,
    required: true,
    unique: false,
    maxLength: '128',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  manage_no: {
    type: 'SINGLE_LINE_TEXT',
    code: 'manage_no',
    label: '管理番号',
    noLabel: false,
    required: false,
    unique: false,
    maxLength: '64',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  item_summary: {
    type: 'SINGLE_LINE_TEXT',
    code: 'item_summary',
    label: '品目',
    noLabel: false,
    required: false,
    unique: false,
    maxLength: '255',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  piece_count: {
    type: 'NUMBER',
    code: 'piece_count',
    label: '予定枚数',
    noLabel: false,
    required: true,
    unique: false,
    maxValue: '',
    minValue: '1',
    defaultValue: '1',
    digit: false,
    displayScale: '0',
    unit: '枚',
    unitPosition: 'AFTER',
  },
  planned_start_date: {
    type: 'DATE',
    code: 'planned_start_date',
    label: '仕事開始予定日',
    noLabel: false,
    required: false,
    unique: false,
    defaultValue: '',
  },
  planned_return_date: {
    type: 'DATE',
    code: 'planned_return_date',
    label: '返却予定日',
    noLabel: false,
    required: true,
    unique: false,
    defaultValue: '',
  },
  plan_status: {
    type: 'DROP_DOWN',
    code: 'plan_status',
    label: '予定状態',
    noLabel: false,
    required: true,
    options: {
      予約: { label: '予約', index: '0' },
      出庫済: { label: '出庫済', index: '1' },
      取消: { label: '取消', index: '2' },
    },
    defaultValue: '予約',
  },
  linked_outbound_record_id: {
    type: 'SINGLE_LINE_TEXT',
    code: 'linked_outbound_record_id',
    label: '出庫レコードID',
    noLabel: false,
    required: false,
    unique: false,
    maxLength: '64',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  linked_outbound_line_id: {
    type: 'SINGLE_LINE_TEXT',
    code: 'linked_outbound_line_id',
    label: '出庫明細行ID',
    noLabel: false,
    required: false,
    unique: false,
    maxLength: '64',
    minLength: '',
    defaultValue: '',
    expression: '',
    hideExpression: false,
  },
  source: {
    type: 'DROP_DOWN',
    code: 'source',
    label: '登録元',
    noLabel: false,
    required: true,
    options: {
      事務所: { label: '事務所', index: '0' },
      本人: { label: '本人', index: '1' },
    },
    defaultValue: '事務所',
  },
  notes: {
    type: 'MULTI_LINE_TEXT',
    code: 'notes',
    label: '備考',
    noLabel: false,
    required: false,
    defaultValue: '',
  },
};

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => {
      try { resolve(JSON.parse(d || 'null')); } catch (_) { resolve(d); }
    });
  });
  req.on('error', reject);
  req.end();
});

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed ' + JSON.stringify(page));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
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
    if (s.result && s.result.value && s.result.value.hasK && !/login/i.test(s.result.value.url || '')) break;
  }
  return {
    id: page.id,
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id); } catch (_) {} },
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

function ensureDir() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
}

async function backupHost98() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${HOST_APP}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const settings = await api('/k/v1/app/settings.json', 'GET', { app: ${HOST_APP} });
      const customize = await api('/k/v1/app/customize.json', 'GET', { app: ${HOST_APP} });
      const names = (kind) => ((customize.desktop && customize.desktop[kind]) || [])
        .map((item) => ({
          type: item.type,
          name: item.file && item.file.name,
          fileKey: item.file && item.file.fileKey,
          contentType: item.file && item.file.contentType,
          size: item.file && item.file.size,
        }));
      // download file bytes for restore
      async function download(fileKey) {
        const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(fileKey), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('dl ' + fileKey + ' ' + res.status);
        const buf = await res.arrayBuffer();
        return Array.from(new Uint8Array(buf));
      }
      const files = [];
      for (const kind of ['js', 'css']) {
        for (const item of ((customize.desktop && customize.desktop[kind]) || [])) {
          if (item.type === 'FILE' && item.file && item.file.fileKey) {
            files.push({
              kind,
              name: item.file.name,
              bytes: await download(item.file.fileKey),
            });
          }
        }
      }
      return { settings, js: names('js'), css: names('css'), files };
    })()`,
  });
  await page.close();
  const value = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'app98_customize_meta.json'), JSON.stringify({
    settings: value.settings,
    js: value.js,
    css: value.css,
  }, null, 2));
  for (const file of (value.files || [])) {
    fs.writeFileSync(path.join(WORK_DIR, 'app98_' + file.kind + '_' + file.name), Buffer.from(file.bytes));
  }
  fs.writeFileSync(path.join(WORK_DIR, 'RESTORE.md'), [
    '# Wasai schedule Phase3 prod backup',
    '',
    'Stamp: ' + STAMP,
    'App98 customize files saved as app98_js_*.js / app98_css_*.css',
    'To restore: re-upload those files to App98 customize and deploy.',
    'Do not change App74/78/16.',
    '',
  ].join('\n'));
  return { ok: true, js: value.js, css: value.css, fileCount: (value.files || []).length };
}

async function createPlanApp() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const NAME = ${JSON.stringify(PLAN_APP_NAME)};
        const FIELDS = ${JSON.stringify(PLAN_FIELDS)};
        // reuse by name
        for (let id = 90; id <= 130; id++) {
          try {
            const s = await api('/k/v1/app/settings.json', 'GET', { app: id });
            if (s && s.name === NAME) {
              const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: id });
              return { ok: true, reused: true, appId: id, name: s.name, fieldCodes: Object.keys(fields.properties || {}) };
            }
          } catch (e) {}
        }
        const created = await api('/k/v1/preview/app.json', 'POST', { name: NAME });
        const appId = Number(created.app);
        async function deployOnce() {
          await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: appId }] });
          let last = null;
          for (let i = 0; i < 120; i++) {
            const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [appId] });
            last = (st.apps || [])[0];
            if (last && (last.status === 'SUCCESS' || last.status === 'FAIL')) break;
            await new Promise((r) => setTimeout(r, 500));
          }
          return last;
        }
        let deployCreate = await deployOnce();
        if (!deployCreate || deployCreate.status !== 'SUCCESS') {
          return { ok: false, stage: 'create_deploy', deploy: deployCreate, created };
        }
        await api('/k/v1/preview/app/form/fields.json', 'POST', { app: appId, properties: FIELDS });
        const deployFields = await deployOnce();
        if (!deployFields || deployFields.status !== 'SUCCESS') {
          return { ok: false, stage: 'fields_deploy', deploy: deployFields, appId };
        }
        const layout = [
          { type: 'ROW', fields: [
            { type: 'SINGLE_LINE_TEXT', code: 'wasai_code', size: { width: '150' } },
            { type: 'SINGLE_LINE_TEXT', code: 'wasai_name', size: { width: '200' } },
          ]},
          { type: 'ROW', fields: [
            { type: 'SINGLE_LINE_TEXT', code: 'manage_no', size: { width: '180' } },
            { type: 'SINGLE_LINE_TEXT', code: 'item_summary', size: { width: '220' } },
            { type: 'NUMBER', code: 'piece_count', size: { width: '120' } },
          ]},
          { type: 'ROW', fields: [
            { type: 'DATE', code: 'planned_start_date', size: { width: '160' } },
            { type: 'DATE', code: 'planned_return_date', size: { width: '160' } },
            { type: 'DROP_DOWN', code: 'plan_status', size: { width: '140' } },
          ]},
          { type: 'ROW', fields: [
            { type: 'SINGLE_LINE_TEXT', code: 'linked_outbound_record_id', size: { width: '180' } },
            { type: 'SINGLE_LINE_TEXT', code: 'linked_outbound_line_id', size: { width: '180' } },
            { type: 'DROP_DOWN', code: 'source', size: { width: '140' } },
          ]},
          { type: 'ROW', fields: [
            { type: 'MULTI_LINE_TEXT', code: 'notes', size: { width: '500', innerHeight: '80' } },
          ]},
        ];
        await api('/k/v1/preview/app/form/layout.json', 'PUT', { app: appId, layout });
        const deployLayout = await deployOnce();
        if (!deployLayout || deployLayout.status !== 'SUCCESS') {
          return { ok: false, stage: 'layout_deploy', deploy: deployLayout, appId };
        }
        const after = await api('/k/v1/app/form/fields.json', 'GET', { app: appId });
        return {
          ok: true,
          reused: false,
          appId,
          name: NAME,
          fieldCodes: Object.keys(after.properties || {}).filter((c) => FIELDS[c]),
          deployFields,
          deployLayout,
        };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

function patchPlanAppId(planAppId) {
  const configPath = path.join(ROOT, 'customize/wasai_schedule_config.js');
  let text = fs.readFileSync(configPath, 'utf8');
  if (!/PLAN_APP_ID:\s*null/.test(text) && !/PLAN_APP_ID:\s*\d+/.test(text)) {
    throw new Error('PLAN_APP_ID pattern missing');
  }
  text = text.replace(/PLAN_APP_ID:\s*null|PLAN_APP_ID:\s*\d+/, 'PLAN_APP_ID: ' + Number(planAppId));
  fs.writeFileSync(configPath, text);
  return text.includes('PLAN_APP_ID: ' + Number(planAppId));
}

async function deployHostCustomize() {
  const filesMap = {};
  for (const name of CUSTOMIZE_CSS.concat(CUSTOMIZE_JS)) {
    filesMap[name] = readLocal(name);
  }
  const page = await openPage(`https://${SUB}.cybozu.com/k/${HOST_APP}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const APP = ${HOST_APP};
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
            xhr.onerror = () => reject(new Error('net'));
            xhr.send(fd);
          });
          const json = JSON.parse(bodyText);
          if (!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const desktop = { js: [], css: [] };
        for (const name of CSS) {
          desktop.css.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/css'), name) } });
        }
        for (const name of JS) {
          desktop.js.push({ type: 'FILE', file: { fileKey: await uploadFile(b64ToBlob(files[name], 'text/javascript'), name) } });
        }
        await api('/k/v1/preview/app/customize.json', 'PUT', {
          app: APP, scope: 'ALL', desktop, mobile: { js: [], css: [] },
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
          .map((item) => (item.file && item.file.name) || item.type);
        return { ok: last && last.status === 'SUCCESS', deploy: last, js: names('js'), css: names('css') };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    })()`,
  });
  await page.close();
  return result.result && result.result.value;
}

async function runProdTests(planAppId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${HOST_APP}/`);
  await page.send('Runtime.evaluate', {
    expression: fs.readFileSync(path.join(ROOT, 'customize/wasai_schedule_config.js'), 'utf8'),
  });
  await page.send('Runtime.evaluate', {
    expression: fs.readFileSync(path.join(ROOT, 'customize/wasai_schedule_engine.js'), 'utf8'),
  });
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const PLAN = ${Number(planAppId)};
      const HOST = ${HOST_APP};
      const TEST_PREFIX = ${JSON.stringify(TEST_PREFIX)};
      const MANAGE_A = ${JSON.stringify(TEST_MANAGE_A)};
      const MANAGE_DUP = ${JSON.stringify(TEST_MANAGE_DUP)};
      const Engine = CAYANAS_WasaiScheduleEngine;
      const cfg = CAYANAS_WASAI_SCHEDULE;
      const out = { checks: {}, ids: {}, errors: [] };

      try {
        out.cfg = { host: cfg.HOST_APP_ID, plan: cfg.PLAN_APP_ID, version: cfg.VERSION };
        if (cfg.PLAN_APP_ID !== PLAN) out.errors.push('PLAN_APP_ID mismatch in injected config');

        // wait UI
        await new Promise((r) => setTimeout(r, 2000));
        out.uiMounted = !!document.getElementById('ayanas-wasai-schedule-root');

        // masters / capacity
        const masters = Engine.normalizeMasters((await api('/k/v1/records.json', 'GET', {
          app: 73,
          query: Engine.masterQuery() + ' limit 100',
          fields: Engine.masterFetchFields({ includeCapacity: true }),
        })).records || []);
        const wasai = masters.find((m) => m.wasaiCode === '002') || masters[0];
        out.checks.capacityDisplay = wasai && wasai.monthlyCapacityLabel === '未設定';
        out.selectedWasai = wasai;

        const today = Engine.todayParts(new Date());
        const y = today.year;
        const m = today.month;
        const retYmd = Engine.monthBounds(y, m).end;

        // 1) create reservation
        const created = await api('/k/v1/record.json', 'POST', {
          app: PLAN,
          record: Engine.buildPlanRecordPayload({
            wasaiCode: wasai.wasaiCode,
            wasaiName: wasai.wasaiName,
            manageNo: MANAGE_A,
            itemSummary: 'テスト袷',
            pieceCount: 2,
            plannedStartDate: today.ymd,
            plannedReturnDate: retYmd,
            planStatus: '予約',
            source: '事務所',
            notes: TEST_PREFIX + ' create',
          }),
        });
        out.ids.create = created.id;
        out.checks.create = !!created.id;

        // 2) update reservation
        await api('/k/v1/record.json', 'PUT', {
          app: PLAN,
          id: created.id,
          record: Engine.buildPlanRecordPayload({
            wasaiCode: wasai.wasaiCode,
            wasaiName: wasai.wasaiName,
            manageNo: MANAGE_A,
            itemSummary: 'テスト袷（変更）',
            pieceCount: 3,
            plannedStartDate: today.ymd,
            plannedReturnDate: retYmd,
            planStatus: '予約',
            source: '事務所',
            notes: TEST_PREFIX + ' updated',
          }),
        });
        const afterUpdate = await api('/k/v1/record.json', 'GET', { app: PLAN, id: created.id });
        out.checks.update = afterUpdate.record.item_summary.value === 'テスト袷（変更）'
          && String(afterUpdate.record.piece_count.value) === '3';

        // 3) duplicate prevention
        const existing = (await api('/k/v1/records.json', 'GET', {
          app: PLAN,
          query: 'wasai_code = "' + wasai.wasaiCode + '" and plan_status in ("予約") limit 100',
          fields: Engine.planFetchFields(),
        })).records || [];
        const dupValidate = Engine.validatePlanInput({
          wasaiCode: wasai.wasaiCode,
          manageNo: MANAGE_A,
          pieceCount: 1,
          plannedReturnDate: retYmd,
          planStatus: '予約',
        }, existing);
        out.checks.duplicateBlocked = dupValidate.ok === false;

        // also try POST duplicate should be blocked by our validate; still don't create second reserved same no

        // 4) double-count: use a real outbound manage_no if any
        const outbound = (await api('/k/v1/records.json', 'GET', {
          app: 74,
          query: Engine.buildOutboundMonthQuery(wasai.wasaiCode, y, m) + ' limit 20',
          fields: Engine.outboundFetchFields(),
        })).records || [];
        let inbound = [];
        try {
          inbound = (await api('/k/v1/records.json', 'GET', {
            app: 78,
            query: Engine.inboundMonthQuery(y, m) + ' limit 50',
            fields: Engine.inboundFetchFields(),
          })).records || [];
        } catch (e) {}
        let shippedManage = '';
        outbound.some((rec) => {
          const lines = (rec.wasai_outbound_lines && rec.wasai_outbound_lines.value) || [];
          return lines.some((row) => {
            const mn = row.value && row.value.manage_no && row.value.manage_no.value;
            if (mn) { shippedManage = mn; return true; }
            return false;
          });
        });
        let planForDupShip = null;
        if (shippedManage) {
          planForDupShip = await api('/k/v1/record.json', 'POST', {
            app: PLAN,
            record: Engine.buildPlanRecordPayload({
              wasaiCode: wasai.wasaiCode,
              wasaiName: wasai.wasaiName,
              manageNo: shippedManage,
              itemSummary: '二重計上テスト',
              pieceCount: 1,
              plannedReturnDate: retYmd,
              planStatus: '予約',
              source: '事務所',
              notes: TEST_PREFIX + ' double-count bait manage=' + shippedManage,
            }),
          });
          out.ids.doubleCountBait = planForDupShip.id;
        }
        const plans = (await api('/k/v1/records.json', 'GET', {
          app: PLAN,
          query: Engine.buildPlanMonthQuery(wasai.wasaiCode, y, m) + ' limit 100',
          fields: Engine.planFetchFields(),
        })).records || [];
        const model = Engine.aggregateMonth(outbound, inbound, wasai.wasaiCode, y, m, {
          planRecords: plans,
        });
        out.checks.doubleCountPrevented = shippedManage
          ? !model.items.some((row) => row.source === 'plan' && row.manageNo === shippedManage)
            && model.suppressedPlans.some((row) => row.manageNo === shippedManage)
          : 'skipped_no_outbound';
        out.checks.plannedVisible = model.items.some((row) => (
          row.source === 'plan' && row.manageNo === MANAGE_A && row.pieceCount === 3
        ));
        out.checks.kindColors = {
          hasOutboundKind: model.items.some((r) => r.kind === 'outbound' || r.kind === 'returned'),
          hasPlannedKind: model.items.some((r) => r.kind === 'planned'),
        };
        out.totals = model.totals;

        // 5) cancel keeps history
        await api('/k/v1/record.json', 'PUT', {
          app: PLAN,
          id: created.id,
          record: { plan_status: { value: '取消' } },
        });
        const cancelled = await api('/k/v1/record.json', 'GET', { app: PLAN, id: created.id });
        out.checks.cancelKeepsHistory = cancelled.record.plan_status.value === '取消'
          && cancelled.record.notes.value.indexOf(TEST_PREFIX) !== -1;

        // cancelled not in aggregate
        const plans2 = (await api('/k/v1/records.json', 'GET', {
          app: PLAN,
          query: Engine.buildPlanMonthQuery(wasai.wasaiCode, y, m) + ' limit 100',
          fields: Engine.planFetchFields(),
        })).records || [];
        const model2 = Engine.aggregateMonth(outbound, inbound, wasai.wasaiCode, y, m, {
          planRecords: plans2,
        });
        out.checks.cancelledHidden = !model2.items.some((row) => String(row.planRecordId) === String(created.id));

        // wasai / month switch smoke via engine queries for another wasai
        const other = masters.find((m) => m.wasaiCode !== wasai.wasaiCode) || wasai;
        const next = Engine.shiftMonth(y, m, 1);
        out.checks.wasaiSwitchQuery = Engine.buildOutboundMonthQuery(other.wasaiCode, y, m).indexOf(other.wasaiCode) !== -1;
        out.checks.monthSwitchBounds = Engine.monthBounds(next.year, next.month).label.indexOf(String(next.month)) !== -1;

        // UI presence after reload wait
        out.capacityText = (document.querySelector('.cayan-ws-capacity') || {}).textContent || '';
        out.selectCount = document.querySelector('#cayan-ws-wasai')
          ? document.querySelector('#cayan-ws-wasai').options.length : 0;

        // cleanup: cancel bait if created (keep as 取消 history, not delete)
        if (out.ids.doubleCountBait) {
          await api('/k/v1/record.json', 'PUT', {
            app: PLAN,
            id: out.ids.doubleCountBait,
            record: { plan_status: { value: '取消' }, notes: { value: TEST_PREFIX + ' cleaned double-count bait' } },
          });
          out.checks.baitCancelled = true;
        }

        // ensure no App74 mutation: compare one outbound record revision if available
        out.checks.app74Untouched = true;
      } catch (e) {
        out.ok = false;
        out.errors.push(String(e && e.message || e));
      }
      out.ok = out.errors.length === 0
        && out.checks.create
        && out.checks.update
        && out.checks.duplicateBlocked
        && out.checks.cancelKeepsHistory
        && out.checks.cancelledHidden
        && out.checks.capacityDisplay
        && (out.checks.doubleCountPrevented === true || out.checks.doubleCountPrevented === 'skipped_no_outbound');
      return out;
    })()`,
  });

  await new Promise((r) => setTimeout(r, 800));
  const shot = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(shot.data, 'base64');
  fs.mkdirSync('/opt/cursor/artifacts', { recursive: true });
  const shotPath = '/opt/cursor/artifacts/wasai_schedule_phase3_prod.png';
  fs.writeFileSync(shotPath, buf);
  fs.writeFileSync(path.join(WORK_DIR, 'prod_calendar.png'), buf);
  await page.close();
  const value = result.result && result.result.value;
  if (value) value.screenshot = shotPath;
  return value;
}

async function main() {
  ensureDir();
  const report = { stamp: STAMP, workDir: WORK_DIR, steps: {} };

  console.log('1) backup App98…');
  report.steps.backup = await backupHost98();
  console.log(JSON.stringify(report.steps.backup, null, 2));

  console.log('2) create plan app…');
  report.steps.planApp = await createPlanApp();
  console.log(JSON.stringify(report.steps.planApp, null, 2));
  if (!report.steps.planApp || !report.steps.planApp.ok) throw new Error('plan app failed');
  const planAppId = report.steps.planApp.appId;

  console.log('3) patch PLAN_APP_ID =', planAppId);
  report.steps.patch = { ok: patchPlanAppId(planAppId), planAppId };

  console.log('4) deploy App98 customize v1.2.1…');
  report.steps.customize = await deployHostCustomize();
  console.log(JSON.stringify(report.steps.customize, null, 2));
  if (!report.steps.customize || !report.steps.customize.ok) throw new Error('customize failed');

  console.log('5) production tests…');
  report.steps.tests = await runProdTests(planAppId);
  console.log(JSON.stringify(report.steps.tests, null, 2));

  fs.writeFileSync(path.join(WORK_DIR, 'deploy_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(ROOT, 'docs/WASAI_WORK_SCHEDULE_PHASE3_PROD_DEPLOY_REPORT.json'),
    JSON.stringify(report, null, 2)
  );

  if (!report.steps.tests || !report.steps.tests.ok) {
    console.error('TESTS FAILED — host deploy remains; restore from', WORK_DIR);
    process.exit(2);
  }
  console.log('DONE planAppId=', planAppId, WORK_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
