'use strict';

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_kobetsu_src_' + STAMP);
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

  const src = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const out = {};
      const B = window.BulkInvoiceCreate;
      const I = window.InvoiceCreate;
      if (!B) return { error: 'no BulkInvoiceCreate' };
      out.bulkKeys = Object.keys(B);
      out.run = String(B.run);
      out.runBulk = String(B.runBulk);
      out.runIndividual = String(B.runIndividual);
      out.previewRun = String(B.previewRun);
      out.previewContext = String(B.previewContext);
      // find button wiring by scanning scripts for class name
      const hits = [];
      for (const s of Array.from(document.scripts)) {
        const t = s.textContent || '';
        if (!t) continue;
        if (t.indexOf('ayanas-monthly-billing-button') >= 0 || t.indexOf('個別請求作成') >= 0 || t.indexOf('処理中') >= 0) {
          hits.push({
            inlineLen: t.length,
            hasClass: t.indexOf('ayanas-monthly-billing-button') >= 0,
            hasKobetsu: t.indexOf('個別請求作成') >= 0,
            hasProcessing: t.indexOf('処理中') >= 0,
            idxClass: t.indexOf('ayanas-monthly-billing-button'),
            snippet: (() => {
              const i = t.indexOf('個別請求作成');
              const j = t.indexOf('処理中');
              const k = t.indexOf('ayanas-monthly-billing-button');
              const at = [i, j, k].filter((x) => x >= 0).sort((a, b) => a - b)[0];
              return at >= 0 ? t.slice(Math.max(0, at - 200), at + 500) : null;
            })()
          });
        }
      }
      out.inlineHits = hits;
      // DOM buttons with class
      out.domButtons = Array.from(document.querySelectorAll('.ayanas-monthly-billing-button, button')).map((el) => ({
        className: String(el.className || '').slice(0, 120),
        text: String(el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
        id: el.id || '',
        data: Object.assign({}, el.dataset)
      })).filter((b) => /請求|作成|一括|個別|ayanas-monthly/.test(b.text + b.className));
      // patched?
      out.runIsPatched = String(B.run).indexOf('ensurePayloadEnriched') >= 0
        || String(B.run).indexOf('ayanasHeaderEnrichPromise') >= 0
        || String(B.run).indexOf('wrappedApi') >= 0;
      out.buildMonthlyPatched = typeof I !== 'undefined'
        && String(I.buildMonthlyInvoiceRecord).indexOf('__ayanasHeaderEnrichPromise') >= 0;
      out.completionPatched = typeof I !== 'undefined'
        && String(I.buildInvoiceCompletion).indexOf('refreshInvoiceHeaderFromPayments') >= 0;
      return out;
    })()`,
  });

  const value = src.result && src.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'bulk_source.json'), JSON.stringify({
    bulkKeys: value && value.bulkKeys,
    runIsPatched: value && value.runIsPatched,
    buildMonthlyPatched: value && value.buildMonthlyPatched,
    completionPatched: value && value.completionPatched,
    inlineHits: value && value.inlineHits,
    domButtons: value && value.domButtons,
  }, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'run.js.txt'), (value && value.run) || '');
  fs.writeFileSync(path.join(WORK_DIR, 'runBulk.js.txt'), (value && value.runBulk) || '');
  fs.writeFileSync(path.join(WORK_DIR, 'runIndividual.js.txt'), (value && value.runIndividual) || '');
  fs.writeFileSync(path.join(WORK_DIR, 'previewRun.js.txt'), (value && value.previewRun) || '');

  // Also try to fetch plugin content URLs from network
  const net = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
      const interesting = scripts.filter((s) => /plugin|invoice|bulk|desktop|contents/i.test(s));
      const fetched = [];
      for (const url of interesting.slice(0, 30)) {
        try {
          const resp = await fetch(url);
          const text = await resp.text();
          fetched.push({
            url,
            size: text.length,
            hasKobetsu: text.indexOf('個別請求作成') >= 0,
            hasProcessing: text.indexOf('処理中') >= 0,
            hasMonthlyBtn: text.indexOf('ayanas-monthly-billing-button') >= 0,
            hasRunIndividual: text.indexOf('runIndividual') >= 0
          });
          if (text.indexOf('個別請求作成') >= 0 || text.indexOf('ayanas-monthly-billing-button') >= 0) {
            // save snippet around processing
            const i = text.indexOf('処理中');
            fetched[fetched.length - 1].processingSnippet = i >= 0
              ? text.slice(Math.max(0, i - 300), i + 400)
              : null;
            const j = text.indexOf('個別請求作成');
            fetched[fetched.length - 1].kobetsuSnippet = j >= 0
              ? text.slice(Math.max(0, j - 300), j + 500)
              : null;
          }
        } catch (e) {
          fetched.push({ url, error: e.message || String(e) });
        }
      }
      return { interesting, fetched, allScripts: scripts.slice(0, 100) };
    })()`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_scripts.json'), JSON.stringify(net.result && net.result.value, null, 2));

  console.log(JSON.stringify({
    workDir: WORK_DIR,
    runIsPatched: value && value.runIsPatched,
    buildMonthlyPatched: value && value.buildMonthlyPatched,
    completionPatched: value && value.completionPatched,
    runIndividualLen: value && value.runIndividual && value.runIndividual.length,
    runLen: value && value.run && value.run.length,
    inlineHits: value && value.inlineHits && value.inlineHits.length,
    domButtons: value && value.domButtons,
    pluginFetch: net.result && net.result.value && {
      interesting: (net.result.value.interesting || []).length,
      hits: (net.result.value.fetched || []).filter((f) => f.hasKobetsu || f.hasMonthlyBtn || f.hasProcessing)
    }
  }, null, 2));

  await page.close();
})().catch((e) => { console.error(e); process.exit(1); });
