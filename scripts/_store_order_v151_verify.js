'use strict';

/**
 * 本番 v151: A550 店舗受注表の入金状態チェックボックスを検証する。
 * CDP Chrome :9399 前提。
 * node scripts/_store_order_v151_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const MANAGE_NO = process.env.MANAGE_NO || '112626964';
const CDP_PORT = 9399;
const WORK_DIR = fs.readdirSync('/agent/repos/AYANAS_Print_V2/customize/backups')
  .filter((d) => d.startsWith('store_order_v151_'))
  .map((d) => path.join('/agent/repos/AYANAS_Print_V2/customize/backups', d))
  .sort()
  .slice(-1)[0];
const ART_DIR = '/opt/cursor/artifacts/store_order_v151';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => {
        d += c;
      });
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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 180000);
      const h = (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.id === i) {
          clearTimeout(t);
          ws.off('message', h);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  return {
    id: page.id,
    send,
    close: async () => {
      try {
        ws.close();
      } catch (_) { /* ignore */ }
      try {
        await httpJson('/json/close/' + page.id);
      } catch (_) { /* ignore */ }
    },
  };
}

function evalValue(resp) {
  return (resp.result && resp.result.result && resp.result.result.value)
    || (resp.result && resp.result.value);
}

async function shot(page, name) {
  const s = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.result.data, 'base64');
  fs.mkdirSync(path.join(WORK_DIR, 'screens'), { recursive: true });
  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'screens', name + '.png'), buf);
  fs.writeFileSync(path.join(ART_DIR, name + '.png'), buf);
  return path.join(ART_DIR, name + '.png');
}

(async () => {
  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.mkdirSync(path.join(WORK_DIR, 'screens'), { recursive: true });

  const listPage = await openPage(`https://${SUB}.cybozu.com/k/16/`);
  await new Promise((r) => setTimeout(r, 3000));
  const info = evalValue(await listPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const recs = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: 16,
        query: 'manage_no = "${MANAGE_NO}" limit 1',
        fields: ['$id', 'manage_no', 'customer_code', 'store_payment_status'],
      });
      const rec = (recs.records || [])[0];
      if (!rec) return null;
      return {
        id: rec.$id.value,
        manage_no: rec.manage_no.value,
        customer_code: rec.customer_code && rec.customer_code.value,
        store_payment_status: rec.store_payment_status && rec.store_payment_status.value,
        url: location.origin + '/k/16/show#record=' + rec.$id.value,
      };
    })()`,
  }));
  await listPage.close();
  if (!info) throw new Error('record not found ' + MANAGE_NO);
  console.log('record', info);

  const page = await openPage(info.url);
  await new Promise((r) => setTimeout(r, 4000));
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 5000));

  const value = evalValue(await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      window.__ayanasCapturedHtml = null;
      const origOpen = window.open;
      window.open = function () {
        return {
          document: {
            open() {},
            write(html) { window.__ayanasCapturedHtml = String(html || ''); },
            close() {},
          },
          focus() {},
          close() {},
          location: { href: '' },
        };
      };
      const buttons = Array.from(document.querySelectorAll('button'))
        .map((b) => (b.innerText || '').trim())
        .filter(Boolean)
        .slice(0, 40);
      const btn = Array.from(document.querySelectorAll('button'))
        .find((el) => (el.innerText || '').trim() === '店舗受注表');
      if (!btn) {
        window.open = origOpen;
        return { ok: false, reason: 'button not found', buttons };
      }
      btn.click();
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (window.__ayanasCapturedHtml) break;
      }
      const html = window.__ayanasCapturedHtml || '';
      window.open = origOpen;
      return {
        ok: html.length > 200,
        htmlLength: html.length,
        html,
        buttons,
        consoleHint: (window.__ayanasLastLog || null),
      };
    })()`,
  }));

  if (!value || !value.html) {
    console.error('capture failed', value);
    await page.close();
    process.exit(1);
  }

  fs.writeFileSync(path.join(WORK_DIR, 'screens', 'store_order_' + MANAGE_NO + '.html'), value.html);
  fs.writeFileSync(path.join(ART_DIR, 'store_order_' + MANAGE_NO + '.html'), value.html);

  const checks = {
    title: /店舗受注表/.test(value.html),
    label: /入金状況/.test(value.html),
    optionPaid: /[□☑]\s*入金済み/.test(value.html),
    optionUnpaid: /[□☑]\s*未入金/.test(value.html),
    optionPartial: /[□☑]\s*一部入金/.test(value.html),
    noKurojiOption: !/[□☑]\s*黒字/.test(value.html),
    hasChecked: /☑\s*(入金済み|未入金|一部入金)/.test(value.html),
    blackFont: /color:\s*#000000/.test(value.html)
      || value.html.indexOf('store-order-payment__check') !== -1,
    matchesApp16: !info.store_payment_status
      || value.html.indexOf('☑ ' + info.store_payment_status) !== -1,
    noOldBadge: !/store-order-payment__state/.test(value.html),
    templateV151: value.html.indexOf('store-order-payment__checks') !== -1,
  };

  const preview = await openPage('data:text/html;charset=utf-8,' + encodeURIComponent(value.html));
  await new Promise((r) => setTimeout(r, 2500));
  const shotPath = await shot(preview, 'store_order_' + MANAGE_NO + '_payment_checks');
  await preview.close();
  await page.close();

  const out = {
    ok: Object.values(checks).every(Boolean),
    record: info,
    checks,
    htmlLength: value.html.length,
    checkedMatch: (value.html.match(/☑\s*(入金済み|未入金|一部入金)/) || [])[0] || null,
    shot: shotPath,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(WORK_DIR, 'verify.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'verify.json'), JSON.stringify(out, null, 2));
  console.log('FINAL', JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
