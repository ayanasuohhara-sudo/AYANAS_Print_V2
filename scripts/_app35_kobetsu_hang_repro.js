'use strict';

/**
 * 個別請求作成「処理中」固着の再現（データ変更なし）
 * - patched BulkInvoiceCreate.run が InvoiceUtils.kintoneApi(コールバック式) と衝突して hang するか確認
 * - 一時的に wrap を外した original 相当で、同じ呼び出しが短時間で settle するか比較
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_kobetsu_hang_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => {
      try { resolve(JSON.parse(d || 'null')); } catch (_) { resolve(d); }
    });
  });
  req.on('error', reject);
  req.end();
});

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 120000);
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
    await new Promise((r) => setTimeout(r, 250));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/35/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 3500));

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const withTimeout = (promise, ms, label) => new Promise((resolve) => {
        let done = false;
        const t = setTimeout(() => {
          if (done) return;
          done = true;
          resolve({ label, status: 'timeout', ms });
        }, ms);
        Promise.resolve(promise).then(
          (v) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve({ label, status: 'resolved', ms, type: v == null ? 'null' : typeof v });
          },
          (e) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve({ label, status: 'rejected', ms, error: String(e && e.message || e).slice(0, 300) });
          }
        );
      });

      const opts = {
        closingDate: '末日',
        billingFrom: '2026-10-01',
        billingTo: '2026-10-31',
        customerCode: '__NO_SUCH_CUSTOMER_AYANAS__'
      };

      const kintoneApiSrc = String(InvoiceUtils.kintoneApi);
      const runSrc = String(BulkInvoiceCreate.run);
      const patched = runSrc.indexOf('ensurePayloadEnriched') >= 0
        || runSrc.indexOf('__ayanasHeaderEnrichPromise') >= 0;

      // A) current patched run — expect hang (timeout)
      const patchedResult = await withTimeout(
        BulkInvoiceCreate.runIndividual(opts),
        8000,
        'patched-runIndividual'
      );

      // B) isolate callback-drop: wrap kintone.api like invoice_balance_desktop does (no enrich),
      //    then call InvoiceUtils.kintoneApi once
      const originalApi = kintone.api;
      const wrappedApi = async (url, method, body) => originalApi(url, method, body);
      wrappedApi.url = originalApi.url;
      kintone.api = wrappedApi;
      const callbackDropResult = await withTimeout(
        InvoiceUtils.kintoneApi(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
        5000,
        'kintoneApi-under-async-wrap-no-callbacks'
      );
      kintone.api = originalApi;

      // C) same call without wrap — should resolve
      const nativeResult = await withTimeout(
        InvoiceUtils.kintoneApi(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
        5000,
        'kintoneApi-native'
      );

      // D) wrap that forwards callbacks — should resolve
      const wrappedForward = function (url, method, body, success, fail) {
        return originalApi(url, method, body, success, fail);
      };
      wrappedForward.url = originalApi.url;
      kintone.api = wrappedForward;
      const forwardResult = await withTimeout(
        InvoiceUtils.kintoneApi(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
        5000,
        'kintoneApi-under-callback-forwarding-wrap'
      );
      kintone.api = originalApi;

      // E) promise-style under async wrap (how payment_create calls) — should resolve
      kintone.api = wrappedApi;
      const promiseStyle = await withTimeout(
        kintone.api(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
        5000,
        'promise-style-under-async-wrap'
      );
      kintone.api = originalApi;

      return {
        patched,
        kintoneApiUsesCallbacks: /kintone\\.api\\([^)]*resolve/.test(kintoneApiSrc)
          || kintoneApiSrc.indexOf('resolve') >= 0 && kintoneApiSrc.indexOf('reject') >= 0,
        kintoneApiSrc: kintoneApiSrc.slice(0, 500),
        runSrcHead: runSrc.slice(0, 400),
        results: {
          patchedResult,
          callbackDropResult,
          nativeResult,
          forwardResult,
          promiseStyle
        }
      };
    })()`,
  });

  const v = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'hang_repro.json'), JSON.stringify(v, null, 2));
  console.log(JSON.stringify({ workDir: WORK_DIR, ...v }, null, 2));
  await page.close();
})().catch((e) => { console.error(e); process.exit(1); });
