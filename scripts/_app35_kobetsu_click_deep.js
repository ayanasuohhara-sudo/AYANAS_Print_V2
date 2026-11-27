'use strict';

/**
 * 個別請求作成ボタンを正しい ID でクリックし、処理中固着を再現観察
 * （ダイアログが出たらキャンセルしてデータ変更を避ける）
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_kobetsu_click_' + STAMP);
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
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 300));
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

  // Dump UI handler by monkeypatching button before click + search plugin resources
  const prep = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      // Find plugin JS with button id via performance resources
      const resources = performance.getEntriesByType('resource').map((r) => r.name);
      const candidates = resources.filter((u) => /plugin|contents|invoice|js/i.test(u));
      const found = [];
      for (const url of candidates) {
        try {
          const resp = await fetch(url, { credentials: 'include' });
          const text = await resp.text();
          if (text.indexOf('ayanas-individual-invoice-create-button') >= 0
            || text.indexOf('個別請求作成') >= 0
            || (text.indexOf('処理中') >= 0 && text.indexOf('BulkInvoiceCreate') >= 0)) {
            const i = text.indexOf('ayanas-individual-invoice-create-button');
            const j = text.indexOf('処理中');
            found.push({
              url,
              size: text.length,
              hasBtnId: i >= 0,
              hasProcessing: j >= 0,
              btnSnippet: i >= 0 ? text.slice(Math.max(0, i - 400), i + 800) : null,
              processingSnippet: j >= 0 ? text.slice(Math.max(0, j - 400), j + 600) : null
            });
          }
        } catch (e) {
          // ignore
        }
      }
      return { candidateCount: candidates.length, found, sampleCandidates: candidates.slice(0, 40) };
    })()`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'resource_scan.json'), JSON.stringify(prep.result && prep.result.value, null, 2));

  const click = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const BTN_ID = 'ayanas-individual-invoice-create-button';
      const btn = document.getElementById(BTN_ID);
      if (!btn) return { ok: false, error: 'button missing' };

      const snapshots = [];
      const apiCalls = [];
      const logs = [];
      const snap = (label) => {
        const b = document.getElementById(BTN_ID) || btn;
        const dialogs = Array.from(document.querySelectorAll('div,section,dialog'))
          .filter((el) => {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const t = String(el.innerText || '');
            return /締日|請求|顧客|キャンセル|実行|処理中|個別|作成/.test(t)
              && el.children.length < 40
              && t.length < 1200
              && t.length > 8;
          })
          .slice(0, 8)
          .map((el) => String(el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 240));
        snapshots.push({
          label,
          t: Date.now(),
          text: String(b.textContent || '').trim(),
          disabled: !!b.disabled,
          className: String(b.className || ''),
          dialogs
        });
      };

      const origApi = kintone.api;
      kintone.api = function (url, method, body) {
        const entry = {
          at: Date.now(),
          method,
          url: String(url).slice(0, 160),
          app: body && body.app,
          done: false
        };
        apiCalls.push(entry);
        const ret = origApi(url, method, body);
        Promise.resolve(ret).then(
          () => { entry.done = true; entry.ok = true; entry.ms = Date.now() - entry.at; },
          (err) => {
            entry.done = true; entry.ok = false;
            entry.error = String(err && err.message || err);
            entry.code = err && err.code;
            entry.ms = Date.now() - entry.at;
          }
        );
        return ret;
      };
      kintone.api.url = origApi.url;

      const wrapLog = (level) => {
        const o = console[level];
        console[level] = function () {
          logs.push({ level, msg: Array.from(arguments).map(String).join(' ').slice(0, 400) });
          return o.apply(console, arguments);
        };
        return o;
      };
      const origs = {
        log: wrapLog('log'), warn: wrapLog('warn'), error: wrapLog('error'), info: wrapLog('info')
      };

      // Also wrap BulkInvoiceCreate.run to time it
      let runMeta = { called: false };
      if (window.BulkInvoiceCreate && typeof BulkInvoiceCreate.run === 'function') {
        const originalRun = BulkInvoiceCreate.run.bind(BulkInvoiceCreate);
        BulkInvoiceCreate.run = async function (options) {
          runMeta = { called: true, at: Date.now(), options: options && {
            closingDate: options.closingDate,
            billingFrom: options.billingFrom,
            billingTo: options.billingTo,
            customerCode: options.customerCode
          } };
          try {
            const result = await originalRun(options);
            runMeta.done = true;
            runMeta.ms = Date.now() - runMeta.at;
            runMeta.resultType = result == null ? 'null' : typeof result;
            return result;
          } catch (e) {
            runMeta.done = true;
            runMeta.ms = Date.now() - runMeta.at;
            runMeta.error = String(e && e.message || e);
            throw e;
          }
        };
      }

      snap('before');
      btn.click();

      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 500));
        snap('t+' + ((i + 1) * 0.5) + 's');
        const last = snapshots[snapshots.length - 1];
        // try cancel dialogs if present (avoid creating invoices)
        const cancelBtn = Array.from(document.querySelectorAll('button')).find((el) => {
          const t = String(el.textContent || '').trim();
          return t === 'キャンセル' || t === 'Cancel' || t === '閉じる';
        });
        if (cancelBtn && last.text.indexOf('処理中') >= 0) {
          // keep observing if processing; don't cancel yet
        }
        if (cancelBtn && i === 4 && last.text.indexOf('処理中') < 0) {
          // dialog open without processing? leave it for snapshot then cancel
        }
        if (i === 8) {
          const c = Array.from(document.querySelectorAll('button')).find((el) =>
            /キャンセル|Cancel|閉じる/.test(String(el.textContent || ''))
          );
          if (c) {
            c.click();
            snap('after-cancel-click');
          }
        }
      }

      kintone.api = origApi;
      console.log = origs.log; console.warn = origs.warn; console.error = origs.error; console.info = origs.info;

      return {
        ok: true,
        snapshots,
        apiCalls,
        pendingApi: apiCalls.filter((c) => !c.done),
        failedApi: apiCalls.filter((c) => c.done && c.ok === false),
        logs: logs.slice(0, 100),
        runMeta,
        final: {
          text: String((document.getElementById(BTN_ID) || btn).textContent || '').trim(),
          disabled: !!(document.getElementById(BTN_ID) || btn).disabled
        }
      };
    })()`,
  });

  fs.writeFileSync(path.join(WORK_DIR, 'click_deep.json'), JSON.stringify(click.result && click.result.value, null, 2));

  const v = click.result && click.result.value;
  console.log(JSON.stringify({
    workDir: WORK_DIR,
    resourceHits: prep.result && prep.result.value && (prep.result.value.found || []).map((f) => ({
      url: f.url, size: f.size, hasBtnId: f.hasBtnId, hasProcessing: f.hasProcessing
    })),
    final: v && v.final,
    runMeta: v && v.runMeta,
    pendingApi: v && v.pendingApi,
    failedApi: v && v.failedApi,
    processingSnapshots: v && (v.snapshots || []).filter((s) =>
      (s.text && s.text.indexOf('処理中') >= 0) || s.label === 'before' || s.label.startsWith('after')
    ),
    lastSnapshots: v && (v.snapshots || []).slice(-3),
    logs: v && (v.logs || []).slice(0, 30),
    apiSample: v && (v.apiCalls || []).slice(0, 20)
  }, null, 2));

  await page.close();
})().catch((e) => { console.error(e); process.exit(1); });
