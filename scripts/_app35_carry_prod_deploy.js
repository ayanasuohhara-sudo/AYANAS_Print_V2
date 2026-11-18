'use strict';

/**
 * App35 前回請求額・入金自動引き継ぎ 本番反映
 * - payment_create.js 2.0.17
 * - invoice_balance_desktop.js 1.1.0
 *
 * 前提: CDP :9222 にログイン済み kintone
 *   node scripts/_app35_carry_prod_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SUB = 'o5nppg7kb4ly';
const APP = 35;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app35_carry_' + STAMP);
const ARTIFACTS = '/opt/cursor/artifacts';

const LOCAL_FILES = {
  'payment_create.js': path.join(ROOT, 'customize/payment_create.js'),
  'invoice_balance_desktop.js': path.join(ROOT, 'customize/invoice_balance_desktop.js'),
};

const EXPECT = {
  payment: '2.0.17',
  balance: '1.1.2',
};

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
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
    if (v && v.login) {
      throw new Error('NEED_LOGIN');
    }
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

async function backupAndDiff(page) {
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
  const mobileJs = ((meta.mobile || {}).js || []).map((x) => ({
    name: x.file && x.file.name,
    fileKey: x.file && x.file.fileKey,
    type: x.type,
  }));

  const downloadNames = ['payment_create.js', 'invoice_balance_desktop.js'];
  const diffs = {};

  for (const name of downloadNames) {
    const entry = desktopJs.find((x) => x.name === name);
    if (!entry || !entry.fileKey) {
      diffs[name] = { status: 'MISSING_ON_PROD' };
      continue;
    }
    const text = await evalJson(
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
    fs.writeFileSync(path.join(WORK_DIR, 'files', 'prod_' + name), text);
    const local = fs.readFileSync(LOCAL_FILES[name], 'utf8');
    fs.writeFileSync(path.join(WORK_DIR, 'files', 'local_' + name), local);
    const same = text === local;
    const prodVer = (text.match(/PAYMENT_JS_VERSION:\s*([\d.]+)/)
      || text.match(/INVOICE_BALANCE_JS_VERSION:\s*([\d.]+)/)
      || text.match(/VERSION\s*=\s*'([\d.]+)'/)
      || [])[1] || null;
    const localVer = (local.match(/PAYMENT_JS_VERSION:\s*([\d.]+)/)
      || local.match(/INVOICE_BALANCE_JS_VERSION:\s*([\d.]+)/)
      || [])[1] || null;
    diffs[name] = {
      status: same ? 'IDENTICAL' : 'DIFFERS',
      prodBytes: Buffer.byteLength(text),
      localBytes: Buffer.byteLength(local),
      prodVer,
      localVer,
      fileKey: entry.fileKey,
    };
  }

  return { meta, desktopJs, mobileJs, diffs, revision: meta.revision };
}

async function deploy(page) {
  const paymentB64 = fs.readFileSync(LOCAL_FILES['payment_create.js']).toString('base64');
  const balanceB64 = fs.readFileSync(LOCAL_FILES['invoice_balance_desktop.js']).toString('base64');

  const result = await evalJson(
    page,
    `(async()=>{
      const APP = ${APP};
      const REPLACE = {
        'payment_create.js': ${JSON.stringify(paymentB64)},
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

      // Each customize slot needs a unique fileKey (desktop/mobile 重複禁止)
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
        mobileJs: (after.mobile.js || []).map((x) => x.file && x.file.name),
        payIdx,
        balIdx,
      };
    })()`
  );

  fs.writeFileSync(path.join(WORK_DIR, 'deploy_result.json'), JSON.stringify(result, null, 2));
  return result;
}

async function verifyVersions(page) {
  await page.send('Page.navigate', {
    url: `https://${SUB}.cybozu.com/k/${APP}/`,
  });
  await new Promise((r) => setTimeout(r, 3500));
  return evalJson(
    page,
    `(async()=>{
      // hard reload context already navigated; check globals
      const info = {
        url: location.href,
        payment: typeof PaymentCreateV2 !== 'undefined' ? PaymentCreateV2.VERSION : null,
        balance: typeof InvoiceBalanceDesktop !== 'undefined' ? InvoiceBalanceDesktop.VERSION : null,
      };
      return info;
    })()`
  );
}

async function safeCalcSample(page) {
  // Read-only: pick one billed customer with a prior invoice; simulate refresh without saving
  return evalJson(
    page,
    `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      if (typeof PaymentCreateV2 === 'undefined') {
        return { error: 'PaymentCreateV2 not loaded' };
      }

      // Find a recent 請求済 invoice that has a prior billed sibling
      const recent = await api('/k/v1/records.json','GET',{
        app: 35,
        query: 'invoice_status in ("請求済") order by invoice_date desc, invoice_no desc limit 30',
        fields: ['$id','invoice_no','invoice_date','customer_code','customer_name','invoice_status',
          'carry_over','payment_amount','balance','invoice_amount','total']
      });

      let sample = null;
      for (const rec of (recent.records || [])) {
        const code = rec.customer_code && rec.customer_code.value;
        const no = rec.invoice_no && rec.invoice_no.value;
        if (!code || !no) continue;
        const refresh = await PaymentCreateV2.computeInvoiceHeaderRefresh(code, {
          excludeInvoiceNo: no,
        });
        if (refresh.priorSource !== 'billed') continue;

        const currentAmount = PaymentCreateV2.getBillingTarget(rec);
        const amounts = PaymentCreateV2.computeHeaderAmounts({
          priorBillingTarget: refresh.displayLastInvoiceAmount,
          paymentOnPriorInvoice: refresh.paymentOnLastInvoice,
          currentInvoiceAmount: currentAmount,
        });

        // Also compute as if creating NEXT invoice for this customer (exclude none after this)
        const nextRefresh = await PaymentCreateV2.computeInvoiceHeaderRefresh(code, {
          excludeInvoiceNo: '',
        });
        // For "next" draft sales use 0 to show inherited header only
        const nextAmounts = PaymentCreateV2.computeHeaderAmounts({
          priorBillingTarget: nextRefresh.displayLastInvoiceAmount,
          paymentOnPriorInvoice: nextRefresh.paymentOnLastInvoice,
          currentInvoiceAmount: 0,
        });

        // idempotency: run twice
        const again = await PaymentCreateV2.computeInvoiceHeaderRefresh(code, {
          excludeInvoiceNo: no,
        });

        sample = {
          mode: 'read_only_simulation',
          currentInvoice: {
            id: rec.$id.value,
            invoice_no: no,
            invoice_date: rec.invoice_date.value,
            customer_code: code,
            customer_name: rec.customer_name && rec.customer_name.value,
            status: rec.invoice_status.value,
            stored: {
              carry_over: rec.carry_over && rec.carry_over.value,
              payment_amount: rec.payment_amount && rec.payment_amount.value,
              balance: rec.balance && rec.balance.value,
              invoice_amount: rec.invoice_amount && rec.invoice_amount.value,
              total: rec.total && rec.total.value,
            },
          },
          asIfRebuildThisInvoice: {
            priorInvoiceNo: refresh.priorInvoiceNo,
            priorInvoiceDate: refresh.priorInvoiceDate,
            priorInvoiceStatus: refresh.priorInvoiceStatus,
            note: refresh.note,
            前回請求額_carry_over: amounts.carryOver,
            入金額_payment_amount: amounts.paymentAmount,
            繰越額: amounts.carryForwardAmount,
            今回売上: amounts.invoiceAmount,
            今回請求額_print: amounts.currentBillingAmount,
            balance_field: amounts.balance,
          },
          asIfCreateNextInvoiceHeader: {
            priorInvoiceNo: nextRefresh.priorInvoiceNo,
            priorInvoiceDate: nextRefresh.priorInvoiceDate,
            priorInvoiceStatus: nextRefresh.priorInvoiceStatus,
            note: nextRefresh.note,
            前回請求額_carry_over: nextAmounts.carryOver,
            入金額_payment_amount: nextAmounts.paymentAmount,
            繰越額: nextAmounts.carryForwardAmount,
          },
          idempotent: again.displayLastInvoiceAmount === refresh.displayLastInvoiceAmount
            && again.paymentOnLastInvoice === refresh.paymentOnLastInvoice,
          paymentVersion: PaymentCreateV2.VERSION,
          balanceVersion: typeof InvoiceBalanceDesktop !== 'undefined'
            ? InvoiceBalanceDesktop.VERSION : null,
        };
        break;
      }
      return sample || { error: 'no suitable billed sample found' };
    })()`
  );
}

async function main() {
  ensureDirs();
  for (const [name, p] of Object.entries(LOCAL_FILES)) {
    if (!fs.existsSync(p)) throw new Error('missing local ' + name);
  }

  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP}/`);
  try {
    console.log('1) backup + diff...');
    const before = await backupAndDiff(page);
    fs.writeFileSync(path.join(WORK_DIR, 'diff_summary.json'), JSON.stringify(before.diffs, null, 2));
    console.log(JSON.stringify(before.diffs, null, 2));

    const order = before.desktopJs.map((x) => x.name).filter(Boolean);
    console.log('desktop order:', order.join(' -> '));
    const payIdx = order.indexOf('payment_create.js');
    const balIdx = order.indexOf('invoice_balance_desktop.js');
    if (payIdx < 0 || balIdx < 0 || payIdx > balIdx) {
      throw new Error('abort: load order invalid ' + order.join(','));
    }

    console.log('2) deploy...');
    const deployed = await deploy(page);
    console.log(JSON.stringify(deployed, null, 2));

    console.log('3) verify versions on app list...');
    // open fresh page to avoid cache
    await page.close();
    const page2 = await openPage(`https://${SUB}.cybozu.com/k/${APP}/?t=${Date.now()}`);
    try {
      const ver = await verifyVersions(page2);
      console.log('versions', ver);
      if (ver.payment !== EXPECT.payment) {
        throw new Error('payment version mismatch: ' + ver.payment);
      }
      if (ver.balance !== EXPECT.balance) {
        throw new Error('balance version mismatch: ' + ver.balance);
      }

      console.log('4) safe read-only sample calculation...');
      const sample = await safeCalcSample(page2);
      fs.writeFileSync(path.join(WORK_DIR, 'sample_calc.json'), JSON.stringify(sample, null, 2));
      fs.writeFileSync(path.join(ARTIFACTS, 'app35_carry_prod_sample.json'), JSON.stringify(sample, null, 2));
      console.log(JSON.stringify(sample, null, 2));

      const report = {
        stamp: STAMP,
        workDir: WORK_DIR,
        deployed,
        versions: ver,
        diffsBefore: before.diffs,
        sample,
        expect: EXPECT,
      };
      fs.writeFileSync(path.join(ARTIFACTS, 'app35_carry_prod_deploy_report.json'), JSON.stringify(report, null, 2));
      fs.writeFileSync(path.join(WORK_DIR, 'REPORT.json'), JSON.stringify(report, null, 2));
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
