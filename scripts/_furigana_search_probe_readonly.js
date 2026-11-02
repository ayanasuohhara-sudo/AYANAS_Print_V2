'use strict';

/**
 * READ-ONLY probe for furigana search investigation.
 * No writes / no deploy / no field changes.
 *   node scripts/_furigana_search_probe_readonly.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const OUT = path.join(
  '/workspace/customize/backups',
  'furigana_search_probe_' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.json'
);

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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 300000);
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
        await httpJson('/json/close/' + page.id);
      } catch (_) {}
    },
  };
}

async function main() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/16/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);

      function pickKanaish(fields) {
        const out = [];
        for (const [code, f] of Object.entries(fields || {})) {
          const label = String(f.label || '');
          const blob = (code + ' ' + label).toLowerCase();
          if (/kana|yomi|ふりがな|フリガナ|読み|カナ/.test(blob) || /kana|yomi/.test(code)) {
            out.push({ code, label, type: f.type });
          }
        }
        return out;
      }

      function pickNamed(fields, codes) {
        const out = {};
        for (const c of codes) {
          if (fields[c]) out[c] = { label: fields[c].label, type: fields[c].type };
        }
        return out;
      }

      const out = { apps: {}, counts: {}, samples: {}, notes: [] };

      // App16 fields
      const f16 = await api('/k/v1/app/form/fields.json', 'GET', { app: 16 });
      out.apps[16] = {
        relevant: pickNamed(f16.properties, [
          'customer_code', 'customer_name', 'client_name', 'personal_customer_id',
          'kimono_type', 'kimono_type_code', 'manage_no', 'order_date',
          'delivery_status', 'process_status', 'work_status', 'location_status'
        ]),
        kanaish: pickKanaish(f16.properties),
        fieldCount: Object.keys(f16.properties || {}).length
      };

      // App8 fields
      try {
        const f8 = await api('/k/v1/app/form/fields.json', 'GET', { app: 8 });
        out.apps[8] = {
          relevant: pickNamed(f8.properties, ['customer_code', 'customer_name']),
          kanaish: pickKanaish(f8.properties),
          fieldCount: Object.keys(f8.properties || {}).length
        };
      } catch (e) {
        out.apps[8] = { error: e.message || String(e) };
      }

      // App96 fields
      try {
        const f96 = await api('/k/v1/app/form/fields.json', 'GET', { app: 96 });
        out.apps[96] = {
          relevant: pickNamed(f96.properties, [
            'personal_customer_id', 'customer_name', 'customer_kana', 'phone', 'mobile_phone', 'member_no'
          ]),
          kanaish: pickKanaish(f96.properties),
          fieldCount: Object.keys(f96.properties || {}).length
        };
      } catch (e) {
        out.apps[96] = { error: e.message || String(e) };
      }

      // App88 customize presence (order search app)
      try {
        const c88 = await api('/k/v1/app/customize.json', 'GET', { app: 88 });
        out.apps[88] = {
          js: ((c88.desktop || {}).js || []).map((x) => (x.file && x.file.name) || x.url)
        };
      } catch (e) {
        out.apps[88] = { error: e.message || String(e) };
      }

      // Counts App16
      const total16 = await api('/k/v1/records.json', 'GET', { app: 16, query: '', totalCount: true, fields: ['$id'], size: 1 });
      out.counts.app16_total = Number(total16.totalCount || 0);

      const withClient = await api('/k/v1/records.json', 'GET', {
        app: 16, query: 'client_name != \"\"', totalCount: true, fields: ['$id'], size: 1
      });
      out.counts.app16_with_client_name = Number(withClient.totalCount || 0);

      const a550 = await api('/k/v1/records.json', 'GET', {
        app: 16, query: 'customer_code = \"A550\"', totalCount: true, fields: ['$id'], size: 1
      });
      out.counts.app16_a550 = Number(a550.totalCount || 0);

      const nonA550 = await api('/k/v1/records.json', 'GET', {
        app: 16, query: 'customer_code != \"A550\"', totalCount: true, fields: ['$id'], size: 1
      });
      out.counts.app16_non_a550 = Number(nonA550.totalCount || 0);

      // personal_customer_id presence (may fail if field missing)
      try {
        const withPcm = await api('/k/v1/records.json', 'GET', {
          app: 16, query: 'personal_customer_id != \"\"', totalCount: true, fields: ['$id'], size: 1
        });
        out.counts.app16_with_personal_customer_id = Number(withPcm.totalCount || 0);
      } catch (e) {
        out.counts.app16_with_personal_customer_id = { error: e.message || String(e) };
      }

      // App8 / App96 totals
      try {
        const t8 = await api('/k/v1/records.json', 'GET', { app: 8, query: '', totalCount: true, fields: ['$id'], size: 1 });
        out.counts.app8_total = Number(t8.totalCount || 0);
      } catch (e) {
        out.counts.app8_total = { error: e.message || String(e) };
      }
      try {
        const t96 = await api('/k/v1/records.json', 'GET', { app: 96, query: '', totalCount: true, fields: ['$id'], size: 1 });
        out.counts.app96_total = Number(t96.totalCount || 0);
        const kanaFilled = await api('/k/v1/records.json', 'GET', {
          app: 96, query: 'customer_kana != \"\"', totalCount: true, fields: ['$id'], size: 1
        });
        out.counts.app96_with_kana = Number(kanaFilled.totalCount || 0);
        const kanaEmpty = await api('/k/v1/records.json', 'GET', {
          app: 96, query: 'customer_kana = \"\"', totalCount: true, fields: ['$id'], size: 1
        });
        out.counts.app96_without_kana = Number(kanaEmpty.totalCount || 0);
      } catch (e) {
        out.counts.app96 = { error: e.message || String(e) };
      }

      // Sample recent App16 with client_name (corp-like)
      const sampleCorp = await api('/k/v1/records.json', 'GET', {
        app: 16,
        query: 'client_name != \"\" and customer_code != \"A550\" order by order_date desc limit 5',
        fields: ['manage_no', 'customer_code', 'customer_name', 'client_name', 'kimono_type', 'order_date', 'process_status', 'delivery_status', 'personal_customer_id']
      });
      out.samples.corp_orders = (sampleCorp.records || []).map((r) => ({
        manage_no: r.manage_no && r.manage_no.value,
        customer_code: r.customer_code && r.customer_code.value,
        customer_name: r.customer_name && r.customer_name.value,
        client_name: r.client_name && r.client_name.value,
        kimono_type: r.kimono_type && r.kimono_type.value,
        order_date: r.order_date && r.order_date.value,
        process_status: r.process_status && r.process_status.value,
        delivery_status: r.delivery_status && r.delivery_status.value,
        personal_customer_id: r.personal_customer_id && r.personal_customer_id.value
      }));

      // Sample App96 with/without kana
      try {
        const s96 = await api('/k/v1/records.json', 'GET', {
          app: 96,
          query: 'order by 更新日時 desc limit 5',
          fields: ['personal_customer_id', 'customer_name', 'customer_kana', 'phone', 'mobile_phone']
        });
        out.samples.app96 = (s96.records || []).map((r) => ({
          personal_customer_id: r.personal_customer_id && r.personal_customer_id.value,
          customer_name: r.customer_name && r.customer_name.value,
          customer_kana: r.customer_kana && r.customer_kana.value,
          phone: r.phone && r.phone.value
        }));
      } catch (e) {
        out.samples.app96 = { error: e.message || String(e) };
      }

      // Distinct corp client_name count approximation: sample size check via query with client
      // How many corp orders have empty client_name
      const corpEmptyClient = await api('/k/v1/records.json', 'GET', {
        app: 16,
        query: 'customer_code != \"A550\" and client_name = \"\"',
        totalCount: true, fields: ['$id'], size: 1
      });
      out.counts.app16_non_a550_empty_client = Number(corpEmptyClient.totalCount || 0);

      return out;
    })()`,
  });
  const value = result.result && result.result.value;
  fs.writeFileSync(OUT, JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
  console.log('wrote', OUT);
  await page.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
