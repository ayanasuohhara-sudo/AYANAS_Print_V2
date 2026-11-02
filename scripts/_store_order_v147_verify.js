'use strict';

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const MANAGE_NO = 'TSP815835U';
const CORP_MANAGE = '110226491';
const WORK_DIR = process.env.V148_WORK
  || fs.readdirSync('/workspace/customize/backups')
    .filter((d) => d.startsWith('store_order_v148_'))
    .map((d) => path.join('/workspace/customize/backups', d))
    .sort()
    .slice(-1)[0];
const ART_DIR = '/opt/cursor/artifacts/store_order_v148';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
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
}

async function findRecord(manageNo) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/16/`);
  await new Promise((r) => setTimeout(r, 3000));
  const info = evalValue(await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const recs = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
        app: 16,
        query: 'manage_no = "' + ${JSON.stringify(manageNo)} + '" limit 1',
        fields: ['$id', 'manage_no', 'customer_code'],
      });
      const rec = (recs.records || [])[0];
      if (!rec) return null;
      return {
        id: rec.$id.value,
        manage_no: rec.manage_no.value,
        customer_code: rec.customer_code && rec.customer_code.value,
        url: location.origin + '/k/16/show#record=' + rec.$id.value,
      };
    })()`,
  }));
  await page.close();
  return info;
}

async function capturePrint(manageNo, label, buttonName) {
  const info = await findRecord(manageNo);
  if (!info) throw new Error('record not found ' + manageNo);
  const page = await openPage(info.url);
  await new Promise((r) => setTimeout(r, 4000));
  // hard reload to pick up plugin v147
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 5000));
  await shot(page, label + '_detail');

  const value = evalValue(await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wanted = ${JSON.stringify(buttonName)};
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
        .find((el) => (el.innerText || '').trim() === wanted);
      if (!btn) {
        window.open = origOpen;
        return { ok: false, reason: 'button not found', wanted, buttons, customer_code: ${JSON.stringify(info.customer_code)} };
      }
      btn.click();
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (window.__ayanasCapturedHtml) break;
      }
      const html = window.__ayanasCapturedHtml || '';
      window.open = origOpen;
      return {
        ok: html.length > 200,
        clicked: wanted,
        customer_code: ${JSON.stringify(info.customer_code)},
        htmlLength: html.length,
        html,
        buttons,
        pluginHint: (document.documentElement.innerHTML.match(/PLUGIN_VERSION[^;]{0,40}/) || [])[0] || null,
      };
    })()`,
  }));

  fs.mkdirSync(path.join(WORK_DIR, 'screens'), { recursive: true });
  if (value && value.html) {
    fs.writeFileSync(path.join(WORK_DIR, 'screens', label + '.html'), value.html);
    fs.writeFileSync(path.join(ART_DIR, label + '.html'), value.html);
    const preview = await openPage('data:text/html;charset=utf-8,' + encodeURIComponent(value.html));
    await new Promise((r) => setTimeout(r, 2000));
    await shot(preview, label);
    await preview.close();
  }
  await page.close();
  const { html, ...meta } = value || {};
  return Object.assign({ manage_no: manageNo, record: info }, meta);
}

function analyzeStoreHtml(html) {
  const checks = {
    title: /店舗受注表/.test(html),
    orderDetailLayout: /order-detail-page/.test(html)
      && /order-detail-sheet--left/.test(html)
      && /order-detail-sheet--right/.test(html),
    workChecks: /□ 下洗い済み/.test(html)
      && /□ しみ抜き済み/.test(html)
      && /□ 修理済み/.test(html),
    paymentBinary: /入金状態/.test(html) && (/入金済/.test(html) || /未入金/.test(html)),
    noPartial: !/一部入金/.test(html),
    noOldCut: !/仕上げ完了登録票/.test(html),
    removedFields: !/>顧客名</.test(html)
      && html.indexOf('得意先伝票番号') === -1
      && html.indexOf('得意先担当・係') === -1,
    leftLower: /store-order-left-lower/.test(html)
      && (html.match(/order-sleeve-tag-table/g) || []).length >= 2
      && (html.match(/data-barcode-value="/g) || []).length >= 3,
    noBottomInfo: !/order-detail-bottom-info/.test(html)
      && !/order-detail-left-bottom/.test(html),
  };
  checks.ok = Object.keys(checks).filter((k) => k !== 'ok').every((k) => checks[k] === true);
  return checks;
}

(async () => {
  fs.mkdirSync(ART_DIR, { recursive: true });
  console.log('work', WORK_DIR);

  const store = await capturePrint(MANAGE_NO, 'store_order_' + MANAGE_NO, '店舗受注表');
  const storeHtmlPath = path.join(WORK_DIR, 'screens', 'store_order_' + MANAGE_NO + '.html');
  const storeHtml = fs.existsSync(storeHtmlPath) ? fs.readFileSync(storeHtmlPath, 'utf8') : '';
  const storeChecks = analyzeStoreHtml(storeHtml);

  let corp = null;
  try {
    corp = await capturePrint(CORP_MANAGE, 'corp_order_' + CORP_MANAGE, '受注明細表');
  } catch (e) {
    corp = { ok: false, error: String(e && e.message || e) };
  }

  const report = {
    at: new Date().toISOString(),
    work: WORK_DIR,
    artifacts: ART_DIR,
    store,
    storeChecks,
    corp: corp && {
      ok: corp.ok,
      clicked: corp.clicked,
      customer_code: corp.customer_code,
      buttons: corp.buttons,
      htmlLength: corp.htmlLength,
      error: corp.error,
      hidesStoreButton: corp.buttons ? corp.buttons.indexOf('店舗受注表') === -1 : null,
      hasOrderDetail: corp.buttons ? corp.buttons.indexOf('受注明細表') !== -1 : null,
    },
  };
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_verify.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'deploy_verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!storeChecks.ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
