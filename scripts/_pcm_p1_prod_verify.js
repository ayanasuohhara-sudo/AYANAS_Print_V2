'use strict';

/**
 * App96 P1 本番検証（フィールド追加・JS反映後）
 *   node scripts/_pcm_p1_prod_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'pcm_p1_prod_verify_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const APP96 = 96;
const APP87 = 87;

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

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 1500));

  const api = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const APP = ${APP96};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const out = { steps: [] };
      try {
        const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
        out.hasTable = !!fields.properties.measure_history;
        out.inner = Object.keys((fields.properties.measure_history || {}).fields || {});

        // 既存 [TEST] があれば再利用（採番カウンタを増やさない）
        const found = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'customer_name = "[TEST]PCM_P1_MEASURE" limit 1',
          fields: ['$id', 'personal_customer_id', 'measure_history']
        });
        if (found.records && found.records[0]) {
          out.bareId = found.records[0].$id.value;
          out.steps.push({
            step: 'reuse_existing_test',
            id: out.bareId,
            pid: found.records[0].personal_customer_id && found.records[0].personal_customer_id.value
          });
        } else {
          try {
            if (!window.CAYANAS_PCM_Numbering) {
              throw new Error('CAYANAS_PCM_Numbering missing');
            }
            const allocated = await window.CAYANAS_PCM_Numbering.allocateNextPersonalCustomerId();
            const bare = await api('/k/v1/record.json', 'POST', {
              app: APP,
              record: {
                personal_customer_id: { value: allocated.personalCustomerId },
                customer_name: { value: '[TEST]PCM_P1_MEASURE' },
                customer_kana: { value: 'てすとぴーしーえむ' },
                registration_source: { value: 'その他' },
                customer_note: { value: 'PCM P1 本番テスト。削除可。' }
              }
            });
            out.bareId = bare.id;
            out.steps.push({
              step: 'bare_create',
              ok: true,
              id: bare.id,
              pid: allocated.personalCustomerId
            });
          } catch (e) {
            out.steps.push({
              step: 'bare_create',
              ok: false,
              error: e.message || String(e),
              code: e.code,
              errors: e.errors || null
            });
            return out;
          }
        }

        const id = out.bareId;
        const mkRow = (opts) => {
          const value = {
            measured_at: { value: opts.at },
            measure_kind: { value: opts.kind },
            garment_type: { value: opts.garment },
            measure_label: { value: opts.label || '' },
            is_current: { value: opts.current ? ['現行'] : [] },
            manage_no: { value: opts.manageNo || '' },
            measure_note: { value: opts.note || '' }
          };
          if (opts.mitake != null) value.mitake_cm = { value: String(opts.mitake) };
          if (opts.yuki != null) value.yuki_cm = { value: String(opts.yuki) };
          if (opts.sode != null) value.sode_cm = { value: String(opts.sode) };
          if (opts.mae != null) value.maehaba_cm = { value: String(opts.mae) };
          if (opts.ushi != null) value.ushirohaba_cm = { value: String(opts.ushi) };
          return { value };
        };

        const rows = [
          mkRow({
            at: '2025-01-10', kind: '仕上がり寸法', garment: '長着', label: '訪問着',
            current: true, mitake: 158.5, yuki: 64.5, sode: 49, mae: 24, ushi: 28, note: '初回'
          }),
          mkRow({
            at: '2026-03-01', kind: '仕上がり寸法', garment: '長着', label: '訪問着',
            current: true, mitake: 159, yuki: 65, sode: 49.5, mae: 24.5, ushi: 28.5, note: '更新'
          }),
          mkRow({
            at: '2026-03-01', kind: '身体寸法', garment: '身体', label: '初回採寸',
            current: true, yuki: 64.5, note: '身体'
          })
        ];

        try {
          await api('/k/v1/record.json', 'PUT', {
            app: APP,
            id,
            record: { measure_history: { value: rows } }
          });
          out.steps.push({ step: 'put_measures', ok: true });
        } catch (e) {
          out.steps.push({
            step: 'put_measures',
            ok: false,
            error: e.message || String(e),
            code: e.code,
            errors: e.errors || null
          });
          return out;
        }

        // 正規化 PUT（同キー現行1件）
        const got = await api('/k/v1/record.json', 'GET', { app: APP, id });
        const tableRows = JSON.parse(JSON.stringify(got.record.measure_history.value || []));
        const groups = {};
        tableRows.forEach((r, i) => {
          const v = r.value || {};
          const cur = v.is_current && Array.isArray(v.is_current.value)
            && v.is_current.value.indexOf('現行') >= 0;
          if (!cur) return;
          const label = String((v.measure_label && v.measure_label.value) || '').trim() || '（無名称）';
          const key = [v.measure_kind.value, v.garment_type.value, label].join('\\u0001');
          (groups[key] = groups[key] || []).push(i);
        });
        Object.keys(groups).forEach((key) => {
          const idxs = groups[key];
          const keep = idxs[idxs.length - 1];
          idxs.forEach((i) => {
            if (i !== keep) tableRows[i].value.is_current.value = [];
          });
        });
        await api('/k/v1/record.json', 'PUT', {
          app: APP,
          id,
          record: { measure_history: { value: tableRows } }
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
        out.measure = {
          id,
          pid: after.record.personal_customer_id && after.record.personal_customer_id.value,
          rowCount: afterRows.length,
          currentCount: currents.length,
          finishCurrentCount: finishCurrents.length,
          oldKept: !!(oldRow && String(oldRow.value.mitake_cm.value) === '158.5'),
          oldNotCurrent: !!(oldRow && (!oldRow.value.is_current.value || oldRow.value.is_current.value.length === 0)),
          decimalOk: String(finishCurrents[0] && finishCurrents[0].value.yuki_cm.value) === '65'
            || String(finishCurrents[0] && finishCurrents[0].value.mitake_cm.value) === '159'
        };

        // 既存顧客非破壊確認
        const ex = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'personal_customer_id = "P000075" limit 1',
          fields: ['$id', 'personal_customer_id', 'customer_name', 'measure_history']
        });
        const er = (ex.records || [])[0];
        out.existing = {
          ok: !!(er && er.personal_customer_id.value === 'P000075'),
          name: er && er.customer_name.value,
          historyLen: er && er.measure_history && er.measure_history.value
            ? er.measure_history.value.length : 0
        };

        // App16 利用履歴
        try {
          const oh = await api('/k/v1/records.json', 'GET', {
            app: 16,
            query: 'personal_customer_id = "P000075" order by order_date desc limit 5',
            fields: ['order_date', 'manage_no', 'delivery_date', 'store_payment_status', 'detail_table']
          });
          out.orderHistory = {
            count: (oh.records || []).length,
            sample: oh.records && oh.records[0] ? {
              manageNo: oh.records[0].manage_no && oh.records[0].manage_no.value,
              deliveryDate: oh.records[0].delivery_date && oh.records[0].delivery_date.value,
              payment: oh.records[0].store_payment_status && oh.records[0].store_payment_status.value
            } : null
          };
        } catch (e) {
          out.orderHistory = { error: e.message || String(e) };
        }

        out.ok = !!(out.measure && out.measure.rowCount === 3
          && out.measure.finishCurrentCount === 1
          && out.measure.oldKept
          && out.measure.oldNotCurrent
          && out.existing && out.existing.ok);
        return out;
      } catch (e) {
        return { ok: false, error: e.message || String(e), code: e.code, errors: e.errors || null, steps: out.steps };
      }
    })()`,
  });
  await page.close();
  const apiResult = api.result && api.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'api.json'), JSON.stringify(apiResult, null, 2));

  let detailUi = null;
  if (apiResult && apiResult.measure && apiResult.measure.id) {
    const dpage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=${apiResult.measure.id}`);
    await dpage.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 3000));
    const ui = await dpage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        pcm: (window.CAYANAS_PCM && window.CAYANAS_PCM.VERSION) || null,
        hasEngine: !!window.CAYANAS_PCM_Measure,
        measurePanel: !!document.getElementById('pcm-measure-panel'),
        historyPanel: !!document.getElementById('pcm-order-history-panel'),
        title: (document.querySelector('#pcm-measure-panel .pcm-measure-panel__title')||{}).textContent || '',
        cards: document.querySelectorAll('#pcm-measure-panel .pcm-measure-card').length,
        rows: document.querySelectorAll('#pcm-measure-panel .pcm-measure-panel__table tbody tr').length,
        currentBadge: document.querySelectorAll('#pcm-measure-panel .pcm-measure-card__badge').length
      })`,
    });
    detailUi = ui.result && ui.result.value;
    detailUi.ok = detailUi.pcm === '1.2.0-p1-measure' && detailUi.measurePanel && detailUi.cards >= 1;
    await dpage.close();
  }

  // existing + portal + ipad
  const epage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=71`);
  await epage.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 3000));
  const eui = await epage.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      pcm: (window.CAYANAS_PCM && window.CAYANAS_PCM.VERSION) || null,
      measurePanel: !!document.getElementById('pcm-measure-panel'),
      historyPanel: !!document.getElementById('pcm-order-history-panel'),
      historyStatus: (document.querySelector('#pcm-order-history-panel .pcm-order-history__status')||{}).textContent || '',
      historyHasAmount: /金額/.test((document.querySelector('#pcm-order-history-panel')||{}).innerText || ''),
      historyHasDelivery: /納品日/.test((document.querySelector('#pcm-order-history-panel')||{}).innerText || ''),
      historyHasPay: /入金/.test((document.querySelector('#pcm-order-history-panel')||{}).innerText || '')
    })`,
  });
  const existingUi = eui.result && eui.result.value;
  existingUi.ok = existingUi.measurePanel && existingUi.historyPanel && existingUi.historyHasAmount;
  await epage.close();

  const ppage = await openPage(`https://${SUB}.cybozu.com/k/${APP87}/`);
  await ppage.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2000));
  const pui = await ppage.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      ver: window.CAYANAS_FLOOR_PORTAL_VERSION || null,
      hasKarte: /顧客カルテ/.test(document.body.innerText||''),
      href: (Array.from(document.querySelectorAll('a')).find(a=>/顧客カルテ/.test(a.textContent||''))||{}).href||null,
      featured: !!document.querySelector('.cayan-fp-btn--menu.is-featured')
    })`,
  });
  const portalUi = pui.result && pui.result.value;
  portalUi.ok = portalUi.ver === '1.8.1' && portalUi.hasKarte && /\/k\/96\//.test(portalUi.href || '');
  await ppage.close();

  let ipadUi = null;
  if (apiResult && apiResult.measure && apiResult.measure.id) {
    const ipage = await openPage(`https://${SUB}.cybozu.com/k/${APP96}/show#record=${apiResult.measure.id}`);
    await ipage.send('Emulation.setDeviceMetricsOverride', {
      width: 1024, height: 768, deviceScaleFactor: 2, mobile: true,
    });
    await ipage.send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, 3000));
    const iui = await ipage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        w: window.innerWidth,
        measurePanel: !!document.getElementById('pcm-measure-panel'),
        cards: document.querySelectorAll('#pcm-measure-panel .pcm-measure-card').length,
        historyPanel: !!document.getElementById('pcm-order-history-panel')
      })`,
    });
    ipadUi = iui.result && iui.result.value;
    ipadUi.ok = !!(ipadUi.measurePanel && ipadUi.cards >= 1);
    await ipage.close();
  }

  const report = {
    stamp: STAMP,
    workDir: WORK_DIR,
    api: apiResult,
    detailUi,
    existingUi,
    portalUi,
    ipadUi,
    ok: !!(apiResult && apiResult.ok && detailUi && detailUi.ok && existingUi.ok && portalUi.ok && ipadUi && ipadUi.ok),
  };
  fs.writeFileSync(path.join(WORK_DIR, 'VERIFY_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
  console.log('VERIFY_OK');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
