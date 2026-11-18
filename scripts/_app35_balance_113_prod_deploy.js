'use strict';

/**
 * App35 invoice_balance_desktop.js 1.1.3 本番反映
 * - 個別請求「処理中」固着修正（kintone.api コールバック転送）
 * - payment_create.js は本番のまま（差し替えなし）
 *
 *   CDP_PORT=9399 node scripts/_app35_balance_113_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const APP = 35;
const CDP_PORT = Number(process.env.CDP_PORT || 9399);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app35_balance_113_' + STAMP);
const ARTIFACTS = '/opt/cursor/artifacts';
const LOCAL_BALANCE = path.join(ROOT, 'customize/invoice_balance_desktop.js');
const EXPECT_BALANCE = '1.1.3';
const EXPECT_PAYMENT = '2.0.17';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (_) {
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
    await new Promise((r) => setTimeout(r, 400));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression:
        "({hasK:typeof kintone!=='undefined',url:location.href,login:!!document.querySelector('input[type=password]')})",
    });
    const v = s.result && s.result.value;
    if (v && v.login) throw new Error('NEED_LOGIN');
    if (v && v.hasK && !/login/i.test(v.url || '')) break;
  }
  return {
    send,
    id: page.id,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id);
      } catch (_) {}
    },
  };
}

async function evalJson(page, expression) {
  const r = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails));
  }
  return r.result && r.result.value;
}

function ensureDirs() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.mkdirSync(path.join(WORK_DIR, 'files'), { recursive: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });
}

async function backup(page) {
  const meta = await evalJson(
    page,
    `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      return api('/k/v1/app/customize.json','GET',{app:${APP}});
    })()`
  );
  fs.writeFileSync(path.join(WORK_DIR, 'before_customize.json'), JSON.stringify(meta, null, 2));

  const desktopJs = ((meta.desktop || {}).js || []).map((x) => ({
    name: x.file && x.file.name,
    fileKey: x.file && x.file.fileKey,
    type: x.type,
  }));

  const entry = desktopJs.find((x) => x.name === 'invoice_balance_desktop.js');
  if (!entry || !entry.fileKey) {
    throw new Error('invoice_balance_desktop.js missing on App35');
  }

  const prodText = await evalJson(
    page,
    `(async()=>{
      const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(${JSON.stringify(entry.fileKey)}), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) throw new Error('download ' + res.status);
      return await res.text();
    })()`
  );
  fs.writeFileSync(path.join(WORK_DIR, 'files', 'prod_invoice_balance_desktop.js'), prodText);
  const local = fs.readFileSync(LOCAL_BALANCE, 'utf8');
  fs.writeFileSync(path.join(WORK_DIR, 'files', 'local_invoice_balance_desktop.js'), local);

  const prodVer = (prodText.match(/INVOICE_BALANCE_JS_VERSION:\s*([\d.]+)/) || [])[1] || null;
  const localVer = (local.match(/INVOICE_BALANCE_JS_VERSION:\s*([\d.]+)/) || [])[1] || null;
  if (localVer !== EXPECT_BALANCE) {
    throw new Error('local version expected ' + EXPECT_BALANCE + ' got ' + localVer);
  }
  if (!local.includes('hasCallbacks') || !local.includes('typeof success === \'function\'')) {
    throw new Error('local file missing callback-forwarding fix markers');
  }

  const order = desktopJs.map((x) => x.name).filter(Boolean);
  const payIdx = order.indexOf('payment_create.js');
  const balIdx = order.indexOf('invoice_balance_desktop.js');
  if (payIdx < 0 || balIdx < 0 || payIdx > balIdx) {
    throw new Error('abort: load order invalid ' + order.join(','));
  }

  const summary = {
    prodVer,
    localVer,
    same: prodText === local,
    prodBytes: Buffer.byteLength(prodText),
    localBytes: Buffer.byteLength(local),
    order,
    payIdx,
    balIdx,
    revision: meta.revision,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'diff_summary.json'), JSON.stringify(summary, null, 2));
  return { meta, desktopJs, summary };
}

async function deploy(page) {
  const balanceB64 = fs.readFileSync(LOCAL_BALANCE).toString('base64');
  const result = await evalJson(
    page,
    `(async()=>{
      const APP = ${APP};
      const REPLACE = {
        'invoice_balance_desktop.js': ${JSON.stringify(balanceB64)},
      };
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);

      const uploadBlob = (blob, name) => new Promise((resolve, reject) => {
        const fd = new FormData();
        fd.append('__REQUEST_TOKEN__', kintone.getRequestToken());
        fd.append('file', blob, name);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/k/v1/file.json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.onload = () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (j.fileKey) resolve(j.fileKey);
            else reject(new Error(xhr.responseText));
          } catch (e) { reject(e); }
        };
        xhr.onerror = () => reject(new Error('upload network'));
        xhr.send(fd);
      });

      const b64ToBlob = (b64, type) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new Blob([bin], { type });
      };

      const downloadBlob = async (fileKey) => {
        const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(fileKey), {
          credentials: 'include',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        if (!res.ok) throw new Error('download fail ' + res.status + ' ' + fileKey);
        return await res.blob();
      };

      const remapList = async (items, defaultType) => {
        const out = [];
        for (const item of (items || [])) {
          if (item.type !== 'FILE' || !item.file) {
            out.push(item);
            continue;
          }
          const name = item.file.name || ('file.' + (defaultType === 'text/css' ? 'css' : 'js'));
          let blob;
          if (REPLACE[name]) {
            blob = b64ToBlob(REPLACE[name], defaultType);
          } else if (item.file.fileKey) {
            blob = await downloadBlob(item.file.fileKey);
          } else {
            throw new Error('missing fileKey for ' + name);
          }
          const fileKey = await uploadBlob(blob, name);
          out.push({ type: 'FILE', file: { fileKey } });
        }
        return out;
      };

      const current = await api('/k/v1/app/customize.json', 'GET', { app: APP });
      const deskNames = (current.desktop.js || []).map((x) => x.file && x.file.name);
      const payIdx = deskNames.indexOf('payment_create.js');
      const balIdx = deskNames.indexOf('invoice_balance_desktop.js');
      if (payIdx < 0 || balIdx < 0) {
        throw new Error('required files missing on App35: ' + JSON.stringify(deskNames));
      }
      if (payIdx > balIdx) {
        throw new Error('load order invalid: payment_create must precede invoice_balance_desktop');
      }

      const desktop = {
        js: await remapList((current.desktop || {}).js || [], 'text/javascript'),
        css: await remapList((current.desktop || {}).css || [], 'text/css'),
      };
      const mobile = {
        js: await remapList((current.mobile || {}).js || [], 'text/javascript'),
        css: await remapList((current.mobile || {}).css || [], 'text/css'),
      };

      await api('/k/v1/preview/app/customize.json', 'PUT', {
        app: APP,
        scope: current.scope || 'ALL',
        desktop,
        mobile,
      });
      await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: APP }] });

      let status = 'PROCESSING';
      let last = null;
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: [APP] });
        last = (st.apps || [])[0];
        status = last && last.status;
        if (status === 'SUCCESS') break;
        if (status === 'FAIL' || status === 'CANCEL') {
          throw new Error('deploy failed: ' + JSON.stringify(last));
        }
      }
      if (status !== 'SUCCESS') throw new Error('deploy timeout status=' + status);

      const after = await api('/k/v1/app/customize.json', 'GET', { app: APP });
      return {
        status,
        revision: after.revision,
        desktopJs: (after.desktop.js || []).map((x) => x.file && x.file.name),
        payIdx,
        balIdx,
      };
    })()`
  );
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_result.json'), JSON.stringify(result, null, 2));
  return result;
}

async function verify(page) {
  return evalJson(
    page,
    `(async () => {
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
              label,
              status: 'resolved',
              type: v == null ? 'null' : typeof v,
              createdCount: v && v.createdCount,
              errorHint: null
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

      const nativeApi = kintone.api;
      const versions = {
        url: location.href,
        payment: typeof PaymentCreateV2 !== 'undefined' ? PaymentCreateV2.VERSION : null,
        balance: typeof InvoiceBalanceDesktop !== 'undefined' ? InvoiceBalanceDesktop.VERSION : null,
        runPatched: typeof BulkInvoiceCreate !== 'undefined'
          && String(BulkInvoiceCreate.run).indexOf('hasCallbacks') >= 0,
        runHasOldBug: typeof BulkInvoiceCreate !== 'undefined'
          && String(BulkInvoiceCreate.run).indexOf('ensurePayloadEnriched') >= 0
          && String(BulkInvoiceCreate.run).indexOf('hasCallbacks') < 0,
      };

      // hang regression: nonexistent customer should reject quickly, not timeout
      const hangCheck = await withTimeout(
        BulkInvoiceCreate.runIndividual({
          closingDate: '末日',
          billingFrom: '2026-10-01',
          billingTo: '2026-10-31',
          customerCode: '__NO_SUCH_CUSTOMER_AYANAS__'
        }),
        15000,
        'runIndividual-missing-customer'
      );

      // api should be restored after run
      const apiRestored = kintone.api === nativeApi;

      // callback path under live wrap should still work if we temporarily apply same shape
      // (already covered by hangCheck settling)

      return { versions, hangCheck, apiRestored };
    })()`
  );
}

async function downloadAfter(page) {
  const meta = await evalJson(
    page,
    `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      return api('/k/v1/app/customize.json','GET',{app:${APP}});
    })()`
  );
  fs.writeFileSync(path.join(WORK_DIR, 'after_customize.json'), JSON.stringify(meta, null, 2));
  const entry = ((meta.desktop || {}).js || []).find(
    (x) => x.file && x.file.name === 'invoice_balance_desktop.js'
  );
  if (!entry || !entry.file.fileKey) throw new Error('after: balance missing');
  const text = await evalJson(
    page,
    `(async()=>{
      const res = await fetch('/k/v1/file.json?fileKey=' + encodeURIComponent(${JSON.stringify(entry.file.fileKey)}), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      if (!res.ok) throw new Error('download after ' + res.status);
      return await res.text();
    })()`
  );
  fs.writeFileSync(path.join(WORK_DIR, 'files', 'prod_after_invoice_balance_desktop.js'), text);
  const ver = (text.match(/INVOICE_BALANCE_JS_VERSION:\s*([\d.]+)/) || [])[1] || null;
  const hasFix = text.includes('hasCallbacks');
  return { ver, hasFix, bytes: Buffer.byteLength(text), revision: meta.revision };
}

async function main() {
  ensureDirs();
  if (!fs.existsSync(LOCAL_BALANCE)) throw new Error('missing local balance js');

  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP}/`);
  try {
    console.log('1) backup...');
    const before = await backup(page);
    console.log(JSON.stringify(before.summary, null, 2));

    console.log('2) deploy 1.1.3...');
    const deployed = await deploy(page);
    console.log(JSON.stringify(deployed, null, 2));

    await page.close();
    const page2 = await openPage(`https://${SUB}.cybozu.com/k/${APP}/?t=${Date.now()}`);
    try {
      // cache-bust reload
      await page2.send('Page.reload', { ignoreCache: true });
      await new Promise((r) => setTimeout(r, 4000));

      console.log('3) verify versions + hang fix...');
      const verified = await verify(page2);
      console.log(JSON.stringify(verified, null, 2));

      const afterFile = await downloadAfter(page2);
      console.log('after file', afterFile);

      if (verified.versions.balance !== EXPECT_BALANCE) {
        throw new Error('balance version mismatch: ' + verified.versions.balance);
      }
      if (verified.versions.payment !== EXPECT_PAYMENT) {
        throw new Error('payment version mismatch: ' + verified.versions.payment);
      }
      if (!verified.versions.runPatched || verified.versions.runHasOldBug) {
        throw new Error('BulkInvoiceCreate.run not showing callback fix');
      }
      if (verified.hangCheck.status === 'timeout') {
        throw new Error('hang still present after deploy');
      }
      if (verified.hangCheck.status !== 'rejected') {
        throw new Error('expected rejected for missing customer, got ' + verified.hangCheck.status);
      }
      if (!verified.apiRestored) {
        throw new Error('kintone.api was not restored after run');
      }
      if (afterFile.ver !== EXPECT_BALANCE || !afterFile.hasFix) {
        throw new Error('after download verification failed');
      }

      const report = {
        stamp: STAMP,
        workDir: WORK_DIR,
        before: before.summary,
        deployed,
        verified,
        afterFile,
        expect: { balance: EXPECT_BALANCE, payment: EXPECT_PAYMENT },
        ok: true,
      };
      fs.writeFileSync(path.join(WORK_DIR, 'REPORT.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(
        path.join(ARTIFACTS, 'app35_balance_113_prod_deploy_report.json'),
        JSON.stringify(report, null, 2)
      );
      console.log('DONE', WORK_DIR);
    } finally {
      await page2.close();
    }
  } catch (e) {
    if (String(e.message) === 'NEED_LOGIN') {
      console.error('NEED_LOGIN');
      process.exit(2);
    }
    throw e;
  } finally {
    try {
      await page.close();
    } catch (_) {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
