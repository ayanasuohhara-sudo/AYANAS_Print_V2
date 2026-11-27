'use strict';

/**
 * App35 一覧「個別請求作成」処理中固着の調査
 * CDP_PORT=9399 node scripts/_app35_kobetsu_stuck_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_kobetsu_stuck_' + STAMP);
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
  await send('Console.enable');
  const logs = [];
  ws.on('message', (raw) => {
    try {
      const m = JSON.parse(String(raw));
      if (m.method === 'Runtime.consoleAPICalled') {
        const args = (m.params.args || []).map((a) => a.value ?? a.description ?? '');
        logs.push({ type: m.params.type, args });
      }
      if (m.method === 'Runtime.exceptionThrown') {
        logs.push({ type: 'exception', args: [m.params.exceptionDetails && m.params.exceptionDetails.text] });
      }
    } catch (_) {}
  });
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
    logs,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/35/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 3500));

  const scan = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const buttons = Array.from(document.querySelectorAll('button, a, input[type=button], [role=button]')).map((el, idx) => ({
        idx,
        tag: el.tagName,
        id: el.id || '',
        className: String(el.className || '').slice(0, 160),
        text: String(el.textContent || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60),
        disabled: !!el.disabled,
        onclick: typeof el.onclick
      })).filter((b) => b.text && /請求|作成|一括|個別|処理|取消|再作成|開始残高|松葉/.test(b.text));

      const kobetsu = buttons.find((b) => b.text === '個別請求作成' || b.text.indexOf('個別請求') >= 0) || null;

      // find listeners via getEventListeners if available (Chrome)
      let listenerInfo = null;
      if (kobetsu && typeof getEventListeners === 'function') {
        const el = Array.from(document.querySelectorAll('button, a, input[type=button], [role=button]'))[kobetsu.idx];
        try {
          const ls = getEventListeners(el);
          listenerInfo = Object.keys(ls).map((type) => ({
            type,
            count: (ls[type] || []).length,
            capture: (ls[type] || []).map((x) => !!x.useCapture),
            passive: (ls[type] || []).map((x) => !!x.passive)
          }));
        } catch (e) {
          listenerInfo = { error: e.message || String(e) };
        }
      }

      // globals / plugin
      const g = {
        InvoiceCreate: typeof InvoiceCreate,
        BulkInvoiceCreate: typeof BulkInvoiceCreate,
        PaymentCreateV2: typeof PaymentCreateV2,
        InvoiceBalanceDesktop: typeof InvoiceBalanceDesktop,
        invoiceCreateKeys: typeof InvoiceCreate !== 'undefined' ? Object.keys(InvoiceCreate) : null,
        bulkKeys: typeof BulkInvoiceCreate !== 'undefined' ? Object.keys(BulkInvoiceCreate) : null,
        paymentVer: typeof PaymentCreateV2 !== 'undefined' ? PaymentCreateV2.VERSION : null,
        balanceVer: typeof InvoiceBalanceDesktop !== 'undefined' ? InvoiceBalanceDesktop.VERSION : null,
        bulkRunStr: (typeof BulkInvoiceCreate !== 'undefined' && typeof BulkInvoiceCreate.run === 'function')
          ? String(BulkInvoiceCreate.run).slice(0, 500)
          : null,
        invoiceCreateFns: typeof InvoiceCreate !== 'undefined'
          ? Object.keys(InvoiceCreate).filter((k) => typeof InvoiceCreate[k] === 'function').slice(0, 40)
          : null
      };

      // customize files scan for 個別請求作成 string
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const c = await api('/k/v1/app/customize.json', 'GET', { app: 35 });
      const fileScan = [];
      for (const item of ((c.desktop || {}).js || [])) {
        const name = item.file && item.file.name;
        const key = item.file && item.file.fileKey;
        if (!name || !key) {
          fileScan.push({ name: name || item.type, type: item.type, url: item.url || null });
          continue;
        }
        const url = kintone.api.url('/k/v1/file.json', true) + '&fileKey=' + encodeURIComponent(key);
        const resp = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await resp.text();
        fileScan.push({
          name,
          size: text.length,
          hasKobetsu: text.indexOf('個別請求') >= 0,
          hasProcessing: text.indexOf('処理中') >= 0,
          hasCreateBtnId: text.indexOf('ayanas-invoice-create-button') >= 0,
          hasCarryPass: text.indexOf('ayanasCarryPass') >= 0,
          hasApiWrap: text.indexOf('kintone.api = wrappedApi') >= 0 || text.indexOf('wrappedApi') >= 0
        });
      }

      // plugins
      let plugins = null;
      try {
        plugins = await api('/k/v1/app/plugins.json', 'GET', { app: 35 });
      } catch (e) {
        plugins = { error: e.message || String(e), code: e.code };
      }

      // script URLs that look like plugin
      const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);

      return {
        url: location.href,
        buttons,
        kobetsu,
        listenerInfo,
        globals: g,
        fileScan,
        plugins,
        scripts: scripts.filter((s) => /plugin|invoice|bulk|payment|35/i.test(s)).slice(0, 50),
        allScriptHosts: Array.from(new Set(scripts.map((s) => {
          try { return new URL(s).origin; } catch (_) { return s.slice(0, 40); }
        })))
      };
    })()`,
  });

  const scanVal = scan.result && scan.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'scan.json'), JSON.stringify(scanVal, null, 2));

  // Instrument click without completing full create if dialog appears - observe state
  const clickObs = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const findBtn = () => Array.from(document.querySelectorAll('button, a, input[type=button], [role=button]'))
        .find((el) => {
          const t = String(el.textContent || el.value || '').replace(/\\s+/g, ' ').trim();
          return t === '個別請求作成' || t.indexOf('個別請求作成') >= 0;
        });

      const btn = findBtn();
      if (!btn) return { ok: false, error: 'button not found' };

      const snapshots = [];
      const snap = (label) => {
        const b = findBtn() || btn;
        snapshots.push({
          at: Date.now(),
          label,
          text: String(b.textContent || b.value || '').replace(/\\s+/g, ' ').trim(),
          disabled: !!b.disabled,
          ariaBusy: b.getAttribute('aria-busy'),
          className: String(b.className || '').slice(0, 120),
          dialogs: Array.from(document.querySelectorAll('[role=dialog], .goog-modalpopup, .ocean-ui-dialog, .gaia-ui-dialog'))
            .map((d) => String(d.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200)),
          overlays: Array.from(document.querySelectorAll('.ayanas-processing, .processing, .loading, [class*=loading], [class*=Processing]'))
            .map((d) => ({ className: d.className, text: String(d.textContent || '').trim().slice(0, 80) })).slice(0, 10),
          bodyHit: /処理中/.test(document.body.innerText || '')
        });
      };

      // wrap console
      const logs = [];
      const orig = {
        log: console.log, warn: console.warn, error: console.error, info: console.info
      };
      ['log', 'warn', 'error', 'info'].forEach((k) => {
        console[k] = function () {
          try {
            logs.push({ k, msg: Array.from(arguments).map(String).join(' ').slice(0, 300) });
          } catch (_) {}
          return orig[k].apply(console, arguments);
        };
      });

      // wrap kintone.api to see hanging calls
      const apiCalls = [];
      const originalApi = kintone.api;
      kintone.api = function (url, method, body) {
        const entry = {
          at: Date.now(),
          url: String(url),
          method,
          app: body && body.app,
          pathHint: String(url).slice(0, 120),
          done: false
        };
        apiCalls.push(entry);
        const p = originalApi(url, method, body);
        Promise.resolve(p).then(() => { entry.done = true; entry.ok = true; entry.ms = Date.now() - entry.at; },
          (err) => { entry.done = true; entry.ok = false; entry.error = String(err && err.message || err); entry.ms = Date.now() - entry.at; });
        return p;
      };
      kintone.api.url = originalApi.url;

      snap('before');
      btn.click();

      // observe up to ~20s
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        snap('t+' + ((i + 1) * 0.5) + 's');
        const last = snapshots[snapshots.length - 1];
        // if dialog with form appeared, capture and stop without submitting
        if (last.dialogs && last.dialogs.length) {
          break;
        }
        // if text left 処理中 back to normal, break
        if (i > 2 && last.text.indexOf('処理中') < 0 && snapshots.some((s) => s.text.indexOf('処理中') >= 0)) {
          break;
        }
      }

      // restore
      kintone.api = originalApi;
      console.log = orig.log; console.warn = orig.warn; console.error = orig.error; console.info = orig.info;

      const pending = apiCalls.filter((c) => !c.done);
      return {
        ok: true,
        snapshots,
        apiCalls: apiCalls.slice(0, 80),
        pendingApi: pending,
        logs: logs.slice(0, 80),
        finalText: (findBtn() || btn).textContent,
        finalDisabled: !!(findBtn() || btn).disabled
      };
    })()`,
  });

  fs.writeFileSync(path.join(WORK_DIR, 'click_obs.json'), JSON.stringify(clickObs.result && clickObs.result.value, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'console_cdp.json'), JSON.stringify(page.logs.slice(-100), null, 2));

  console.log(JSON.stringify({
    workDir: WORK_DIR,
    buttons: scanVal && scanVal.buttons,
    kobetsu: scanVal && scanVal.kobetsu,
    globals: scanVal && scanVal.globals,
    fileScan: scanVal && scanVal.fileScan,
    plugins: scanVal && scanVal.plugins,
    click: clickObs.result && clickObs.result.value && {
      ok: clickObs.result.value.ok,
      snapshots: (clickObs.result.value.snapshots || []).filter((s, i, arr) =>
        i === 0 || i === arr.length - 1 || (s.text && s.text.indexOf('処理中') >= 0) || (s.dialogs && s.dialogs.length)
      ),
      pendingApi: clickObs.result.value.pendingApi,
      apiSample: (clickObs.result.value.apiCalls || []).slice(0, 15),
      logs: (clickObs.result.value.logs || []).slice(0, 20),
      finalText: clickObs.result.value.finalText,
      finalDisabled: clickObs.result.value.finalDisabled
    }
  }, null, 2));

  await page.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
