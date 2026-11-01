'use strict';

/**
 * App16 work_status: 未着手 → 未着（work_status のみ）
 *
 * 既定は DRY-RUN。本番更新は明示確認が必要:
 *   CONFIRM_MIGRATE=YES EXECUTE=1 node scripts/_app16_work_status_migrate.js
 *
 * 前提:
 * - 選択肢に「未着手」と「未着」が併存していること
 * - バックアップ取得済みであること
 * - App16 の同時編集を停止していること
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const FROM = '未着手';
const TO = '未着';
const BATCH = 100;
const EXECUTE = process.env.EXECUTE === '1' && process.env.CONFIRM_MIGRATE === 'YES';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join('/workspace/customize/backups', 'app16_work_status_migrate_' + STAMP.slice(0, 10));

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

  const result = await evalJson(
    send,
    `(async () => {
      const APP = ${APP16};
      const FROM = ${JSON.stringify(FROM)};
      const TO = ${JSON.stringify(TO)};
      const BATCH = ${BATCH};
      const EXECUTE = ${EXECUTE ? 'true' : 'false'};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);

      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: APP });
      const options = ((fields.properties || {}).work_status || {}).options || {};
      const hasFrom = Object.prototype.hasOwnProperty.call(options, FROM);
      const hasTo = Object.prototype.hasOwnProperty.call(options, TO);
      if (!hasFrom || !hasTo) {
        return {
          ok: false,
          error: 'options missing',
          hasFrom, hasTo,
          labels: Object.keys(options),
        };
      }

      const countQ = async (q) => {
        const r = await api('/k/v1/records.json', 'GET', {
          app: APP, query: q + ' limit 1', totalCount: true, fields: ['$id'],
        });
        return Number(r.totalCount || 0);
      };

      const labels = Object.keys(options);
      const beforeFrom = await countQ('work_status in ("' + FROM + '")');
      const beforeTo = await countQ('work_status in ("' + TO + '")');
      const beforeEmptySafe = await countQ(
        'work_status not in (' + labels.map((l) => '"' + l + '"').join(',') + ')'
      );

      const targets = [];
      let offset = 0;
      while (true) {
        const page = await api('/k/v1/records.json', 'GET', {
          app: APP,
          query: 'work_status in ("' + FROM + '") order by $id asc limit 500 offset ' + offset,
          fields: ['$id', '$revision', 'manage_no', 'work_status', 'process_status', 'location_status', 'delivery_status'],
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
          });
        });
        offset += rows.length;
        if (rows.length < 500) break;
      }

      const failures = [];
      const successes = [];
      if (EXECUTE) {
        for (let i = 0; i < targets.length; i += BATCH) {
          const chunk = targets.slice(i, i + BATCH);
          const records = chunk.map((t) => ({
            id: t.id,
            revision: t.revision,
            record: { work_status: { value: TO } },
          }));
          try {
            const put = await api('/k/v1/records.json', 'PUT', { app: APP, records });
            (put.records || []).forEach((r, idx) => {
              successes.push({ id: String(r.id), revision: String(r.revision), manage_no: chunk[idx].manage_no });
            });
          } catch (err) {
            // fallback one-by-one for this chunk
            for (const t of chunk) {
              try {
                const one = await api('/k/v1/record.json', 'PUT', {
                  app: APP,
                  id: t.id,
                  revision: t.revision,
                  record: { work_status: { value: TO } },
                });
                successes.push({ id: t.id, revision: String(one.revision), manage_no: t.manage_no });
              } catch (oneErr) {
                failures.push({
                  id: t.id,
                  manage_no: t.manage_no,
                  revision: t.revision,
                  error: String(oneErr && oneErr.message || oneErr),
                });
              }
            }
          }
        }
      }

      const afterFrom = await countQ('work_status in ("' + FROM + '")');
      const afterTo = await countQ('work_status in ("' + TO + '")');
      const afterEmptySafe = await countQ(
        'work_status not in (' + labels.map((l) => '"' + l + '"').join(',') + ')'
      );

      return {
        ok: true,
        execute: EXECUTE,
        before: { from: beforeFrom, to: beforeTo, empty: beforeEmptySafe },
        after: { from: afterFrom, to: afterTo, empty: afterEmptySafe },
        planned: targets.length,
        successCount: successes.length,
        failureCount: failures.length,
        successes,
        failures,
        sampleTargets: targets.slice(0, 5),
      };
    })()`
  );

  fs.writeFileSync(path.join(OUT_DIR, 'migrate_report.json'), JSON.stringify(result, null, 2));
  if (result.failures && result.failures.length) {
    fs.writeFileSync(path.join(OUT_DIR, 'failures.json'), JSON.stringify(result.failures, null, 2));
  }
  console.log(JSON.stringify({
    outDir: OUT_DIR,
    execute: EXECUTE,
    ok: result.ok,
    error: result.error,
    before: result.before,
    after: result.after,
    planned: result.planned,
    successCount: result.successCount,
    failureCount: result.failureCount,
    note: EXECUTE
      ? 'EXECUTED work_status-only updates'
      : 'DRY-RUN only. Set CONFIRM_MIGRATE=YES EXECUTE=1 to apply.',
  }, null, 2));

  await close();
  if (!result.ok) process.exit(2);
  if (EXECUTE && result.failureCount > 0) process.exit(3);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
