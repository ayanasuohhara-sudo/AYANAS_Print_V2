'use strict';

/**
 * hang 切り分け第2弾（先に wrap 単体、最後に patched run）
 * 各テスト後に必ず kintone.api を復元する
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_kobetsu_hang2_' + STAMP);
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
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 180000);
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
  await new Promise((r) => setTimeout(r, 4000));

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
            resolve({
              label, status: 'resolved', elapsedHintMs: ms,
              appName: v && v.name, appId: v && v.appId
            });
          },
          (e) => {
            if (done) return;
            done = true;
            clearTimeout(t);
            resolve({ label, status: 'rejected', error: String(e && e.message || e).slice(0, 300) });
          }
        );
      });

      const nativeApi = kintone.api; // capture before any test
      const restore = () => { kintone.api = nativeApi; };

      const results = {};

      // 1 native callback-style via InvoiceUtils
      results.nativeKintoneApi = await withTimeout(
        InvoiceUtils.kintoneApi(nativeApi.url('/k/v1/app', true), 'GET', { id: 35 }),
        8000,
        '1-native-kintoneApi'
      );
      restore();

      // 2 async wrap WITHOUT forwarding callbacks (same shape as invoice_balance_desktop)
      {
        const wrappedApi = async (url, method, body) => nativeApi(url, method, body);
        wrappedApi.url = nativeApi.url;
        kintone.api = wrappedApi;
        results.asyncWrapNoCb = await withTimeout(
          InvoiceUtils.kintoneApi(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
          5000,
          '2-async-wrap-no-callbacks'
        );
        restore();
      }

      // 3 wrap that forwards callbacks
      {
        const wrappedForward = function (url, method, body, success, fail) {
          return nativeApi(url, method, body, success, fail);
        };
        wrappedForward.url = nativeApi.url;
        kintone.api = wrappedForward;
        results.forwardWrap = await withTimeout(
          InvoiceUtils.kintoneApi(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
          8000,
          '3-callback-forwarding-wrap'
        );
        restore();
      }

      // 4 promise-style under async wrap
      {
        const wrappedApi = async (url, method, body) => nativeApi(url, method, body);
        wrappedApi.url = nativeApi.url;
        kintone.api = wrappedApi;
        results.promiseUnderAsyncWrap = await withTimeout(
          kintone.api(kintone.api.url('/k/v1/app', true), 'GET', { id: 35 }),
          8000,
          '4-promise-under-async-wrap'
        );
        restore();
      }

      // 5 patched BulkInvoiceCreate.runIndividual — should hang; force-restore after timeout
      const patched = String(BulkInvoiceCreate.run).indexOf('ensurePayloadEnriched') >= 0;
      const beforeApi = kintone.api;
      results.patchedRun = await withTimeout(
        BulkInvoiceCreate.runIndividual({
          closingDate: '末日',
          billingFrom: '2026-10-01',
          billingTo: '2026-10-31',
          customerCode: '__NO_SUCH_CUSTOMER_AYANAS__'
        }),
        6000,
        '5-patched-runIndividual'
      );
      const apiStillSameObject = kintone.api === beforeApi;
      const apiLooksWrapped = String(kintone.api).indexOf('ensurePayloadEnriched') >= 0
        || String(kintone.api).indexOf('isRecordPost') >= 0
        || kintone.api !== nativeApi;
      results.afterHangApiState = {
        apiStillSameObjectAsBeforeRun: apiStillSameObject,
        apiIsNative: kintone.api === nativeApi,
        apiLooksWrapped,
        apiSrcHead: String(kintone.api).slice(0, 200)
      };
      // force restore for page safety
      restore();
      results.afterForceRestoreNative = await withTimeout(
        InvoiceUtils.kintoneApi(nativeApi.url('/k/v1/app', true), 'GET', { id: 35 }),
        8000,
        '6-native-after-force-restore'
      );

      return { patched, results };
    })()`,
  });

  const v = result.result && result.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'hang_repro2.json'), JSON.stringify(v, null, 2));
  console.log(JSON.stringify({ workDir: WORK_DIR, ...v }, null, 2));
  await page.close();
})().catch((e) => { console.error(e); process.exit(1); });
