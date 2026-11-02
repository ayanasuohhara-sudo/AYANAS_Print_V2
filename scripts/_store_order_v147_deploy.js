'use strict';

/**
 * Pack済み plugin.zip を v147 として本番 Import し、A550 店舗受注表を検証する。
 * node scripts/_store_order_v147_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const ZIP_SRC = path.join(ROOT, 'plugin.zip');
const ZIP = '/tmp/ayanas-print-v147.zip';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'store_order_v147_' + STAMP);
const ART_DIR = path.join('/opt/cursor/artifacts', 'store_order_v147');
const MANAGE_NO = 'TSP815835U';
const CORP_MANAGE = '110226491';

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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed ' + JSON.stringify(page));
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
  await send('DOM.enable');
  return {
    send,
    close: async () => {
      try {
        ws.close();
      } catch (_) { /* ignore */ }
      try {
        await httpJson('/json/close/' + page.id, 'GET');
      } catch (_) { /* ignore */ }
    },
    id: page.id,
  };
}

async function shot(page, fileBase) {
  const s = await page.send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(s.result.data, 'base64');
  const p1 = path.join(WORK_DIR, 'screens', fileBase + '.png');
  const p2 = path.join(ART_DIR, fileBase + '.png');
  fs.mkdirSync(path.dirname(p1), { recursive: true });
  fs.mkdirSync(path.dirname(p2), { recursive: true });
  fs.writeFileSync(p1, buf);
  fs.writeFileSync(p2, buf);
  return p2;
}

async function uploadPlugin() {
  fs.copyFileSync(ZIP_SRC, ZIP);
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.copyFileSync(ZIP, path.join(WORK_DIR, 'plugin_v147.zip'));

  const page = await openPage(`https://${SUB}.cybozu.com/k/admin/system/plugin/`);
  await new Promise((r) => setTimeout(r, 2500));

  await page.send('Runtime.evaluate', {
    expression: `(()=>{
      const b=Array.from(document.querySelectorAll('button'))
        .find(x=>(x.innerText||'').trim()==='Import' || (x.innerText||'').trim()==='インポート');
      if(!b) throw new Error('Import button not found');
      b.click();
      return true;
    })()`,
  });

  let backendNodeId = null;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const fileRef = await page.send('Runtime.evaluate', {
      expression: `document.querySelector('input[type=file]')`,
    });
    if (fileRef.result && fileRef.result.objectId) {
      const described = await page.send('DOM.describeNode', { objectId: fileRef.result.objectId });
      backendNodeId = described.node && described.node.backendNodeId;
      if (backendNodeId) break;
    }
  }
  if (!backendNodeId) throw new Error('file input not found');
  await page.send('DOM.setFileInputFiles', { backendNodeId, files: [ZIP] });
  await new Promise((r) => setTimeout(r, 1500));

  await page.send('Runtime.evaluate', {
    expression: `(()=>{
      const btns=Array.from(document.querySelectorAll('button'))
        .filter(b=>(b.innerText||'').trim()==='Import');
      const dialog=btns.find(b=>{
        const c=b.className||'';
        return /DialogOk|_DialogOk/i.test(c) || !/_HeaderButton_/i.test(c);
      });
      const target=dialog || btns[btns.length-1];
      if(!target) throw new Error('dialog Import not found');
      target.click();
      return true;
    })()`,
  });

  let verify = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const text=document.body && document.body.innerText || '';
        const has147=/\\b147\\b/.test(text) && /AYANAS\\s*Print/i.test(text);
        const hasSuccess=/成功|Success|Imported|インポート/i.test(text);
        const versions=[...text.matchAll(/AYANAS\\s*Print[^\\n]{0,100}/gi)].map(m=>m[0]).slice(0,5);
        return {has147, hasSuccess, sample:versions, url:location.href};
      })()`,
    });
    verify = r.result.value;
    if (verify && verify.has147) break;
  }
  await shot(page, 'plugin_list_v147');
  await page.close();
  const out = { ok: !!(verify && verify.has147), verify, zip: ZIP, at: new Date().toISOString() };
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_upload.json'), JSON.stringify(out, null, 2));
  console.log('upload', JSON.stringify(out, null, 2));
  if (!out.ok) throw new Error('plugin upload verify failed');
  return out;
}

async function findRecordUrl(manageNo) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/16/`);
  await new Promise((r) => setTimeout(r, 2500));
  const r = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const recs=await kintone.api(kintone.api.url('/k/v1/records',true),'GET',{
        app:16,
        query:'manage_no = "' + ${JSON.stringify(manageNo)} + '" limit 1',
        fields:['$id','manage_no','customer_code']
      });
      const rec=(recs.records||[])[0];
      if(!rec) return null;
      return {
        id: rec.$id.value,
        manage_no: rec.manage_no.value,
        customer_code: rec.customer_code && rec.customer_code.value,
        url: location.origin + '/k/16/show#record=' + rec.$id.value
      };
    })()`,
  });
  await page.close();
  return r.result.value;
}

async function capturePrint(manageNo, label, buttonName) {
  const info = await findRecordUrl(manageNo);
  if (!info) throw new Error('record not found ' + manageNo);
  const page = await openPage(info.url);
  await new Promise((r) => setTimeout(r, 3500));
  await shot(page, label + '_detail');

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const wanted = ${JSON.stringify(buttonName)};
      window.__ayanasCapturedHtml = null;
      const origOpen = window.open;
      window.open = function() {
        return {
          document: {
            open(){},
            write(html){ window.__ayanasCapturedHtml = String(html||''); },
            close(){},
          },
          focus(){},
          close(){},
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
        return { ok:false, reason:'button not found', wanted, buttons, customer_code: ${JSON.stringify(info.customer_code)} };
      }
      const clicked = (btn.innerText || '').trim();
      btn.click();
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 300));
        if (window.__ayanasCapturedHtml) break;
      }
      const html = window.__ayanasCapturedHtml || '';
      window.open = origOpen;
      return {
        ok: html.length > 200,
        clicked,
        customer_code: ${JSON.stringify(info.customer_code)},
        htmlLength: html.length,
        html,
        buttons,
      };
    })()`,
  });

  const value = result.result.value || {};
  const htmlPath = path.join(WORK_DIR, 'screens', label + '.html');
  fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
  if (value.html) {
    fs.writeFileSync(htmlPath, value.html);
    fs.writeFileSync(path.join(ART_DIR, label + '.html'), value.html);
  }
  // open captured html in a tab for screenshot
  if (value.html) {
    const preview = await openPage('data:text/html;charset=utf-8,' + encodeURIComponent(value.html));
    await new Promise((r) => setTimeout(r, 1500));
    await shot(preview, label);
    await preview.close();
  }
  await page.close();
  delete value.html;
  return Object.assign({ manage_no: manageNo, record: info }, value);
}

function analyzeStoreHtml(html) {
  const checks = {
    title: /店舗受注表/.test(html),
    orderDetailLayout: /order-detail-page/.test(html) && /order-detail-sheet--left/.test(html)
      && /order-detail-sheet--right/.test(html),
    workChecks: /□ 下洗い済み/.test(html) && /□ しみ抜き済み/.test(html) && /□ 修理済み/.test(html),
    paymentBinary: /入金状態/.test(html) && (/入金済/.test(html) || /未入金/.test(html)),
    noPartial: !/一部入金/.test(html),
    noOldCut: !/仕上げ完了登録票/.test(html),
    barcodes: (html.match(/data-barcode-value="/g) || []).length >= 2,
    landscapeHint: /report-store-order/.test(html) || /order-detail-page/.test(html),
  };
  checks.ok = Object.keys(checks).every((k) => k === 'ok' || checks[k] === true);
  return checks;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(ART_DIR, { recursive: true });

  const upload = await uploadPlugin();

  const store = await capturePrint(MANAGE_NO, 'store_order_' + MANAGE_NO, '店舗受注表');
  const storeHtml = fs.existsSync(path.join(WORK_DIR, 'screens', 'store_order_' + MANAGE_NO + '.html'))
    ? fs.readFileSync(path.join(WORK_DIR, 'screens', 'store_order_' + MANAGE_NO + '.html'), 'utf8')
    : '';
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
    upload,
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
    },
  };
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_verify.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ART_DIR, 'deploy_verify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!storeChecks.ok) throw new Error('store order checks failed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
