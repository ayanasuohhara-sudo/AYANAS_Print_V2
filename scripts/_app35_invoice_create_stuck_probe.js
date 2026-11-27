'use strict';

/**
 * App35 「個別請求作成」処理中固着の調査（読取＋UI観察）
 *   node scripts/_app35_invoice_create_stuck_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join('/workspace/customize/backups', 'app35_create_stuck_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });

const CDP_PORT = Number(process.env.CDP_PORT || 9399);

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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
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
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    id: page.id,
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/35/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2000));

  const meta = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const c = await api('/k/v1/app/customize.json', 'GET', { app: 35 });
      const js = ((c.desktop || {}).js || []).map((x) => ({
        name: (x.file && x.file.name) || x.type,
        type: x.type,
        url: x.url || null,
        fileKey: x.file && x.file.fileKey,
        contentUrl: x.file && x.file.fileKey
          ? null
          : null
      }));
      // download file contents names only via file API if possible
      return {
        customizeJs: js,
        css: ((c.desktop || {}).css || []).map((x) => x.file && x.file.name),
        plugins: null,
        globals: {
          InvoiceCreate: typeof InvoiceCreate,
          BulkInvoiceCreate: typeof BulkInvoiceCreate,
          PaymentCreateV2: typeof PaymentCreateV2,
          InvoiceBalanceDesktop: typeof InvoiceBalanceDesktop,
          InvoiceCreateKeys: typeof InvoiceCreate !== 'undefined' ? Object.keys(InvoiceCreate) : null,
          BulkKeys: typeof BulkInvoiceCreate !== 'undefined' ? Object.keys(BulkInvoiceCreate) : null,
          paymentVer: (typeof PaymentCreateV2 !== 'undefined' && PaymentCreateV2.VERSION) || null,
          balanceVer: (typeof InvoiceBalanceDesktop !== 'undefined' && InvoiceBalanceDesktop.VERSION) || null
        },
        scripts: Array.from(document.scripts).map((s) => ({
          src: s.src || '',
          id: s.id || '',
          len: (s.textContent || '').length
        })).filter((s) => s.src || s.len > 0).slice(0, 80)
      };
    })()`,
  });
  const metaVal = meta.result && meta.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'meta.json'), JSON.stringify(metaVal, null, 2));

  // plugins
  const plugins = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      try {
        const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
        const p = await api('/k/v1/app/plugins.json', 'GET', { app: 35 });
        return p;
      } catch (e) {
        return { error: e.message || String(e), code: e.code };
      }
    })()`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'plugins.json'), JSON.stringify(plugins.result && plugins.result.value, null, 2));

  // Open create screen
  await page.close();
  const createPage = await openPage(`https://${SUB}.cybozu.com/k/35/edit`);
  // kintone new record is usually /k/35/edit? or /k/35/? via "新規"
  await createPage.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/35/edit` });
  await new Promise((r) => setTimeout(r, 4000));

  const ui1 = await createPage.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      url: location.href,
      buttons: Array.from(document.querySelectorAll('button, input[type=button], a.gaia-ui-actionmenu-command')).map((el) => ({
        id: el.id || '',
        className: String(el.className || '').slice(0, 120),
        text: String(el.textContent || el.value || '').trim().slice(0, 80),
        disabled: !!el.disabled
      })).filter((b) => /請求|作成|取込|繰越|入金|処理/.test(b.text + b.id)),
      createBtn: (() => {
        const el = document.getElementById('ayanas-invoice-create-button');
        if (!el) return null;
        return {
          id: el.id,
          text: el.textContent,
          disabled: el.disabled,
          dataset: Object.assign({}, el.dataset),
          html: el.outerHTML.slice(0, 500)
        };
      })(),
      space: !!document.getElementById('ayanas-invoice-create-actions')
        || !!(kintone.app.record && kintone.app.record.getSpaceElement
          && kintone.app.record.getSpaceElement('ayanas-invoice-create-actions')),
      bodySnippet: (document.body.innerText || '').slice(0, 1500)
    })`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'create_ui.json'), JSON.stringify(ui1.result && ui1.result.value, null, 2));

  // If not on edit (redirect), try clicking 新規作成 from index
  let createUi = ui1.result && ui1.result.value;
  if (!createUi || !createUi.createBtn) {
    await createPage.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/35/` });
    await new Promise((r) => setTimeout(r, 3000));
    await createPage.send('Runtime.evaluate', {
      expression: `(() => {
        const a = Array.from(document.querySelectorAll('a,button')).find((el) =>
          /新規/.test(el.textContent || '') || (el.getAttribute('href') || '').indexOf('/edit') >= 0
        );
        if (a) a.click();
        return !!(a);
      })()`,
    });
    await new Promise((r) => setTimeout(r, 4000));
    const ui2 = await createPage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        url: location.href,
        buttons: Array.from(document.querySelectorAll('button')).map((el) => ({
          id: el.id || '',
          text: String(el.textContent || '').trim().slice(0, 80),
          disabled: !!el.disabled,
          dataset: Object.assign({}, el.dataset)
        })).filter((b) => /請求|作成|取込|繰越|入金|処理|ayanas/.test(b.text + b.id)),
        createBtn: (() => {
          const el = document.getElementById('ayanas-invoice-create-button');
          if (!el) return null;
          return { id: el.id, text: el.textContent, disabled: el.disabled, dataset: Object.assign({}, el.dataset) };
        })(),
        allButtonTexts: Array.from(document.querySelectorAll('button')).map((el) =>
          String(el.textContent || '').trim()).filter(Boolean).slice(0, 40)
      })`,
    });
    createUi = ui2.result && ui2.result.value;
    fs.writeFileSync(path.join(WORK_DIR, 'create_ui2.json'), JSON.stringify(createUi, null, 2));
  }

  // Search source of create button in loaded scripts
  const srcProbe = await createPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const hits = [];
      const scripts = Array.from(document.scripts);
      for (const s of scripts) {
        const text = s.src ? '' : (s.textContent || '');
        const src = s.src || '(inline)';
        if (/ayanas-invoice-create-button|個別請求|処理中/.test(text)) {
          hits.push({ src, inline: true, idx: text.search(/ayanas-invoice-create-button|個別請求|処理中/) });
        }
        if (s.src && /invoice|payment|bulk|create/i.test(s.src)) {
          hits.push({ src: s.src, candidate: true });
        }
      }
      // Also inspect plugin iframe scripts? skip
      let createHandlerHint = null;
      if (typeof InvoiceCreate !== 'undefined') {
        createHandlerHint = {
          keys: Object.keys(InvoiceCreate),
          toStringSamples: Object.keys(InvoiceCreate).slice(0, 15).map((k) => ({
            k,
            type: typeof InvoiceCreate[k],
            preview: typeof InvoiceCreate[k] === 'function'
              ? String(InvoiceCreate[k]).slice(0, 200)
              : null
          }))
        };
      }
      return { hits, createHandlerHint, href: location.href };
    })()`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'source_hits.json'), JSON.stringify(srcProbe.result && srcProbe.result.value, null, 2));

  // Download customize JS files that might contain the button
  const download = await createPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const c = await api('/k/v1/app/customize.json', 'GET', { app: 35 });
      const files = [];
      for (const item of ((c.desktop || {}).js || [])) {
        const name = item.file && item.file.name;
        const key = item.file && item.file.fileKey;
        if (!name || !key) {
          files.push({ name: name || item.type, type: item.type, url: item.url || null });
          continue;
        }
        // fetch blob via /k/v1/file.json?fileKey=
        const url = kintone.api.url('/k/v1/file.json', true) + '&fileKey=' + encodeURIComponent(key);
        const resp = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await resp.text();
        files.push({
          name,
          size: text.length,
          hasCreateButton: text.indexOf('ayanas-invoice-create-button') >= 0,
          hasKobetsu: text.indexOf('個別') >= 0,
          hasProcessing: text.indexOf('処理中') >= 0,
          snippet: (() => {
            const i = text.indexOf('ayanas-invoice-create-button');
            if (i < 0) {
              const j = text.indexOf('処理中');
              return j >= 0 ? text.slice(Math.max(0, j - 120), j + 200) : null;
            }
            return text.slice(Math.max(0, i - 80), i + 250);
          })()
        });
      }
      // URL type JS
      for (const item of ((c.desktop || {}).js || [])) {
        if (item.type === 'URL' && item.url) {
          try {
            const resp = await fetch(item.url);
            const text = await resp.text();
            files.push({
              name: item.url,
              size: text.length,
              urlType: true,
              hasCreateButton: text.indexOf('ayanas-invoice-create-button') >= 0,
              hasKobetsu: text.indexOf('個別') >= 0,
              hasProcessing: text.indexOf('処理中') >= 0
            });
          } catch (e) {
            files.push({ name: item.url, error: e.message || String(e) });
          }
        }
      }
      return files;
    })()`,
  });
  fs.writeFileSync(path.join(WORK_DIR, 'file_scan.json'), JSON.stringify(download.result && download.result.value, null, 2));

  console.log(JSON.stringify({
    workDir: WORK_DIR,
    customizeJs: metaVal && metaVal.customizeJs,
    globals: metaVal && metaVal.globals,
    plugins: plugins.result && plugins.result.value,
    createUi,
    fileScan: download.result && download.result.value,
  }, null, 2));

  await createPage.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
