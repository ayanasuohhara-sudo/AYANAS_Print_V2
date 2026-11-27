'use strict';

/**
 * App16 work_status 移行準備（読み取りのみ）
 * - フォーム fields / form バックアップ
 * - work_status 件数集計
 * - 「未着手」対象レコード ID 一覧
 *
 * Usage: node scripts/_app16_work_status_prep.js
 * 本番選択肢変更・一括更新はしない。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const OUT_DIR = path.join(
  '/workspace/customize/backups',
  'app16_work_status_prep_' + new Date().toISOString().slice(0, 10).replace(/-/g, '')
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
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) {
      break;
    }
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
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);

  const snapshot = await evalJson(
    send,
    `(async () => {
      const APP = ${APP16};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
      const layout = await api('/k/v1/app/form/layout.json', 'GET', { app: APP });
      const workField = (fields.properties || {}).work_status || null;
      const options = workField && workField.options ? workField.options : {};
      const labels = Object.keys(options).sort((a, b) => (options[a].index || 0) - (options[b].index || 0));

      const countQuery = async (q) => {
        const r = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: q + ' limit 1',
          totalCount: true,
          fields: ['$id'],
        });
        return Number(r.totalCount || 0);
      };

      const counts = {};
      for (const label of labels) {
        counts[label] = await countQuery('work_status in ("' + label + '")');
      }
      counts['__empty__'] = await countQuery('work_status not in (' + labels.map((l) => '"' + l + '"').join(',') + ')');
      counts['__total__'] = await countQuery('$id > 0');

      const targets = [];
      let offset = 0;
      while (true) {
        const page = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'work_status in ("未着手") order by $id asc limit 500 offset ' + offset,
          fields: ['$id', '$revision', 'manage_no', 'work_status', 'process_status', 'location_status', 'delivery_status', 'customer_code'],
        });
        const rows = page.records || [];
        if (!rows.length) break;
        rows.forEach((rec) => {
          targets.push({
            id: String(rec.$id.value),
            revision: String(rec.$revision.value),
            manage_no: String((rec.manage_no && rec.manage_no.value) || ''),
            work_status: String((rec.work_status && rec.work_status.value) || ''),
            process_status: String((rec.process_status && rec.process_status.value) || ''),
            location_status: String((rec.location_status && rec.location_status.value) || ''),
            delivery_status: String((rec.delivery_status && rec.delivery_status.value) || ''),
            customer_code: String((rec.customer_code && rec.customer_code.value) || ''),
          });
        });
        offset += rows.length;
        if (rows.length < 500) break;
      }

      const formHas = (label) => labels.indexOf(label) >= 0;
      const probeLabels = ['仕上げ待ち', 'しみ抜き待ち', '未着', 'しみ抜き中', '未着手'];
      const extraCounts = {};
      probeLabels.forEach((label) => {
        extraCounts[label] = {
          existsInForm: formHas(label),
          count: formHas(label) ? counts[label] : null,
          note: formHas(label) ? 'from form option counts' : 'option not in form; query skipped',
        };
      });

      return {
        at: new Date().toISOString(),
        app: APP,
        workField: {
          type: workField && workField.type,
          required: workField && workField.required,
          defaultValue: workField && workField.defaultValue,
          labels,
          options,
        },
        counts,
        extraCounts,
        target未着手: {
          count: targets.length,
          records: targets,
        },
        fields,
        layout,
      };
    })()`
  );

  fs.writeFileSync(path.join(OUT_DIR, 'fields.json'), JSON.stringify(snapshot.fields, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'layout.json'), JSON.stringify(snapshot.layout, null, 2));
  fs.writeFileSync(
    path.join(OUT_DIR, 'work_status_counts.json'),
    JSON.stringify(
      {
        at: snapshot.at,
        workField: snapshot.workField,
        counts: snapshot.counts,
        extraCounts: snapshot.extraCounts,
        target未着手Count: snapshot.target未着手.count,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'target_mishishu_ids.json'),
    JSON.stringify(snapshot.target未着手, null, 2)
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'target_mishishu_ids.csv'),
    ['id,revision,manage_no,work_status,process_status,location_status,delivery_status,customer_code']
      .concat(
        snapshot.target未着手.records.map((r) =>
          [r.id, r.revision, r.manage_no, r.work_status, r.process_status, r.location_status, r.delivery_status, r.customer_code]
            .map((v) => '"' + String(v).replace(/"/g, '""') + '"')
            .join(',')
        )
      )
      .join('\n')
  );

  const summary = {
    outDir: OUT_DIR,
    at: snapshot.at,
    defaultValue: snapshot.workField.defaultValue,
    labels: snapshot.workField.labels,
    counts: snapshot.counts,
    extraCounts: snapshot.extraCounts,
    target未着手: snapshot.target未着手.count,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
