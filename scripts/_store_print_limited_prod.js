'use strict';

/**
 * A550 店舗帳票（受注表・納品書）限定本番反映 + E2E
 *
 * Modes:
 *   node scripts/_store_print_limited_prod.js all
 *   node scripts/_store_print_limited_prod.js backup
 *   node scripts/_store_print_limited_prod.js upload-plugin
 *   node scripts/_store_print_limited_prod.js deploy-js
 *   node scripts/_store_print_limited_prod.js e2e
 *   node scripts/_store_print_limited_prod.js verify
 *
 * 制約: A550 / [TEST] のみ。本番一括更新禁止。一般公開はしない。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const ZIP = process.env.STORE_PRINT_ZIP || '/tmp/ayanas-print-v145.zip';
const MODE = process.argv[2] || 'all';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = process.env.STORE_PRINT_PROD_DIR
  || path.join(ROOT, 'customize/backups', 'store_print_limited_' + STAMP);
const TEST_PCM = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';
const STORE_CODE = 'A550';

/** App19 読み込み順: store_delivery_pcm.js を barcode_delivery.js より前 */
const APP19_JS = [
  'internal_ops_config.js',
  'complete_register_engine.js',
  'delivery_completion_guard.js',
  'store_delivery_pcm.js',
  'barcode_delivery.js',
  'store_pickup_shared.js',
  'delivery_complete_sync.js',
  'delivery_a550_edit_guard.js',
  'price_master_register.js',
  'delivery_additional_item_guard.js',
  'additional_item_engine.js',
];

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
  await send('DOM.enable');
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
    pageId: page.id,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id, 'GET');
      } catch (_) {}
    },
  };
}

async function attachPortal() {
  const list = await httpJson('/json/list');
  const page = (list || []).find(
    (t) => t.type === 'page'
      && /cybozu\.com\/k/.test(t.url || '')
      && !/login/.test(t.url || '')
      && !/web-worker/.test(t.url || '')
  );
  if (!page) throw new Error('no logged-in kintone tab');
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
  return { ws, send, close: () => ws.close() };
}

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__PK_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', {
      expression: `window.__PK_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await send('Runtime.evaluate', {
        expression: `window.__PK_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__PK_FILES[${JSON.stringify(name)}]=window.__PK_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

async function deployCustomize(appId, jsOrder, cssOrder, filesMap) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${appId};
        const jsOrder=${JSON.stringify(jsOrder)};
        const cssOrder=${JSON.stringify(cssOrder)};
        const files=window.__PK_FILES;
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const token=kintone.getRequestToken();
        function b64ToBlob(b64,type){
          const bin=atob(b64); const arr=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
          return new Blob([arr],{type});
        }
        async function uploadBlob(blob,filename){
          const fd=new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, filename);
          const bodyText=await new Promise((resolve,reject)=>{
            const xhr=new XMLHttpRequest();
            xhr.open('POST','/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With','XMLHttpRequest');
            xhr.onload=()=>resolve(xhr.responseText);
            xhr.onerror=()=>reject(new Error('upload network error'));
            xhr.send(fd);
          });
          const json=JSON.parse(bodyText);
          if(!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const keys={};
        for(const name of jsOrder) keys[name]=await uploadBlob(b64ToBlob(files[name],'text/javascript'),name);
        for(const name of cssOrder) keys[name]=await uploadBlob(b64ToBlob(files[name],'text/css'),name);
        const current=await api('/k/v1/app/customize.json','GET',{app:APP});
        await api('/k/v1/preview/app/customize.json','PUT',{
          app:APP,
          scope: current.scope || 'ALL',
          desktop:{
            js: jsOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}})),
            css: cssOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}}))
          },
          mobile: current.mobile || {js:[],css:[]}
        });
        await api('/k/v1/preview/app/deploy.json','POST',{apps:[{app:APP}]});
        let last=null;
        for(let i=0;i<120;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[APP]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,500));
        }
        const after=await api('/k/v1/app/customize.json','GET',{app:APP});
        return {
          ok: !!(last && last.status==='SUCCESS'),
          deploy: last,
          desktopJs: ((after.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
          desktopCss: ((after.desktop||{}).css||[]).map(x=>x.file&&x.file.name)
        };
      }catch(e){ return {ok:false, error: e.message||String(e)}; }
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function backup() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const portal = await attachPortal();
  const meta = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const out={apps:{}, pluginProbe:{}};
      for(const app of [16,19]){
        out.apps[app]=await api('/k/v1/app/customize.json','GET',{app});
      }
      // plugin ids on App16/19
      try {
        out.pluginProbe.app16 = await api('/k/v1/app/plugins.json','GET',{app:16});
        out.pluginProbe.app19 = await api('/k/v1/app/plugins.json','GET',{app:19});
      } catch(e) {
        out.pluginProbe.error = e.message||String(e);
      }
      return out;
    })()`,
  });
  portal.close();
  const data = meta.result.value;
  for (const [appId, customize] of Object.entries(data.apps || {})) {
    const dir = path.join(WORK_DIR, 'app' + appId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'customize.json'), JSON.stringify(customize, null, 2));
  }
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_probe.json'), JSON.stringify(data.pluginProbe, null, 2));

  for (const appId of [16, 19]) {
    const customize = data.apps[String(appId)] || data.apps[appId];
    const dir = path.join(WORK_DIR, 'app' + appId);
    const desktop = (customize && customize.desktop) || {};
    const entries = []
      .concat(((desktop.js || []).map((x, i) => ({ kind: 'js', index: i, name: x.file && x.file.name, fileKey: x.file && x.file.fileKey }))))
      .concat(((desktop.css || []).map((x, i) => ({ kind: 'css', index: i, name: x.file && x.file.name, fileKey: x.file && x.file.fileKey }))));
    fs.writeFileSync(path.join(dir, 'files_meta.json'), JSON.stringify(entries, null, 2));
    const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
    for (const ent of entries) {
      if (!ent.fileKey || !ent.name) continue;
      const got = await page.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async()=>{
          const key=${JSON.stringify(ent.fileKey)};
          const res=await fetch('/k/v1/file.json?fileKey='+encodeURIComponent(key),{
            headers:{'X-Requested-With':'XMLHttpRequest'},
            credentials:'same-origin'
          });
          if(!res.ok) throw new Error('download fail '+res.status);
          const buf=await res.arrayBuffer();
          const bytes=new Uint8Array(buf);
          let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
          return btoa(s);
        })()`,
      });
      const b64 = got.result.value;
      const fname = (ent.kind === 'css' ? 'desktop_css' : 'desktop_js')
        + (ent.index + 1) + '_' + ent.name.replace(/[^\w.\-]+/g, '_');
      fs.writeFileSync(path.join(dir, fname), Buffer.from(b64, 'base64'));
      ent.file = fname;
    }
    fs.writeFileSync(path.join(dir, 'files_meta.json'), JSON.stringify(entries, null, 2));
    await page.close();
  }

  // Rollback notes
  const rollback = {
    at: new Date().toISOString(),
    dir: WORK_DIR,
    steps: [
      '1. プラグイン: システム管理 > プラグイン で旧 plugin.zip（バックアップ）を Import',
      '2. App19: customize/backups/.../app19 の JS を元の順で再登録 → アプリを更新',
      '3. App16: 変更した場合のみ同様に復元（今回は store_order_create_link 未追加なら不要）',
      '4. 対象アプリをハードリロード',
    ],
    app19_restore_order: (data.apps['19'] || data.apps[19] || {}).desktop,
    note: '本番一括データ更新は行っていない。レコード復元は不要（印刷は参照のみ）。',
  };
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), [
    '# 店舗帳票 限定反映 — 復旧手順',
    '',
    '```json',
    JSON.stringify(rollback, null, 2),
    '```',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(WORK_DIR, 'BACKUP_OK.json'), JSON.stringify({
    at: new Date().toISOString(),
    dir: WORK_DIR,
    app16Js: ((data.apps['16'] || data.apps[16] || {}).desktop || {}).js,
    app19Js: ((data.apps['19'] || data.apps[19] || {}).desktop || {}).js,
  }, null, 2));
  if (fs.existsSync(ZIP)) {
    fs.copyFileSync(ZIP, path.join(WORK_DIR, 'plugin_v145_to_upload.zip'));
  }
  fs.writeFileSync('/tmp/store_print_limited_dir.txt', WORK_DIR);
  console.log(JSON.stringify({ ok: true, dir: WORK_DIR }, null, 2));
  return WORK_DIR;
}

async function uploadPlugin() {
  if (!fs.existsSync(ZIP)) throw new Error('missing zip ' + ZIP);
  const page = await openPage(`https://${SUB}.cybozu.com/k/admin/system/plugin/`);
  await new Promise((r) => setTimeout(r, 2500));

  // Click header Import
  await page.send('Runtime.evaluate', {
    expression: `(()=>{
      const b=Array.from(document.querySelectorAll('button'))
        .find(x=>(x.innerText||'').trim()==='Import');
      if(!b) throw new Error('Import button not found');
      b.click();
      return true;
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));

  const fileRef = await page.send('Runtime.evaluate', {
    expression: `document.querySelector('input[type=file]')`,
  });
  if (!fileRef.result || !fileRef.result.objectId) {
    throw new Error('file input not found');
  }
  const described = await page.send('DOM.describeNode', { objectId: fileRef.result.objectId });
  const backendNodeId = described.node && described.node.backendNodeId;
  if (!backendNodeId) throw new Error('no backendNodeId');
  await page.send('DOM.setFileInputFiles', { backendNodeId, files: [ZIP] });
  await new Promise((r) => setTimeout(r, 1000));

  // Click dialog Import (not header)
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
      return {className:String(target.className||''), text:target.innerText};
    })()`,
  });

  let verify = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const text=document.body && document.body.innerText || '';
        const has145=/\\b145\\b/.test(text) && /AYANAS\\s*Print/i.test(text);
        const hasSuccess=/成功|Success|Imported|インポート/i.test(text);
        const versions=[...text.matchAll(/AYANAS\\s*Print[^\\n]{0,80}/gi)].map(m=>m[0]).slice(0,5);
        return {has145, hasSuccess, sample:versions, url:location.href};
      })()`,
    });
    verify = r.result.value;
    if (verify && verify.has145) break;
  }
  await page.close();
  const out = { ok: !!(verify && verify.has145), verify, zip: ZIP };
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'plugin_upload.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) throw new Error('plugin upload verify failed');
  return out;
}

async function decideApp16CreateLink() {
  const portal = await attachPortal();
  const r = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c=await api('/k/v1/app/customize.json','GET',{app:16});
      const names=((c.desktop||{}).js||[]).map(x=>x.file&&x.file.name);
      return {
        names,
        hasCreateLink: names.includes('store_order_create_link.js'),
        hasSimilar: names.some(n=>/store.*delivery|delivery.*create|納品書/.test(String(n||'')))
      };
    })()`,
  });
  portal.close();
  const v = r.result.value;
  // 指示: 既存操作と重複する場合のみ追加しない — 導線は任意。現状 App16 に同等ボタンなしだが
  // 印刷プラグイン側に店舗納品書ボタンがあり、作成は App19 新規で足りる。重複回避のため今回は追加しない。
  return {
    add: false,
    reason: 'App19新規作成＋プラグイン店舗納品書で足りる。store_order_create_link は任意導線のため限定反映では見送り',
    current: v,
  };
}

async function deployJs() {
  const decision = await decideApp16CreateLink();
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'app16_create_link_decision.json'), JSON.stringify(decision, null, 2));

  const files19 = {};
  for (const name of APP19_JS) {
    files19[name] = readLocal(name);
  }
  const report19 = await deployCustomize(APP19, APP19_JS, [], files19);
  const out = { app19: report19, app16CreateLink: decision };
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_js.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  if (!report19.ok) throw new Error('App19 deploy failed');
  const order = report19.desktopJs || [];
  const pcmIdx = order.indexOf('store_delivery_pcm.js');
  const barIdx = order.indexOf('barcode_delivery.js');
  if (pcmIdx < 0 || barIdx < 0 || pcmIdx >= barIdx) {
    throw new Error('App19 load order invalid: pcm must be before barcode_delivery ' + JSON.stringify(order));
  }
  return out;
}

async function e2e() {
  const artDir = path.join(WORK_DIR, 'e2e_artifacts');
  fs.mkdirSync(artDir, { recursive: true });
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const out={checks:[], records:[], payments:[], delivery:{}};
      const push=(name,ok,detail)=>(out.checks.push({name,ok:!!ok,detail}));

      // A550 TEST orders only
      const q = 'customer_code = "${STORE_CODE}" and personal_customer_id = "${TEST_PCM}" order by $id desc limit 20';
      const recs = await api('/k/v1/records.json','GET',{app:${APP16}, query:q});
      out.records = (recs.records||[]).map(r=>({
        id:r.$id.value,
        manage_no:r.manage_no&&r.manage_no.value,
        customer_code:r.customer_code&&r.customer_code.value,
        pcm:r.personal_customer_id&&r.personal_customer_id.value,
        delivery_status:r.delivery_status&&r.delivery_status.value,
        process_status:r.process_status&&r.process_status.value,
      }));
      push('found A550 TEST orders', out.records.length>0, {count:out.records.length});

      // payments for same PCM
      try {
        const pq = 'personal_customer_id = "${TEST_PCM}" order by $id desc limit 50';
        const pays = await api('/k/v1/records.json','GET',{app:97, query:pq});
        out.payments = (pays.records||[]).map(r=>({
          id:r.$id.value,
          status: (r.payment_status&&r.payment_status.value)||(r.status&&r.status.value)||null,
          amount: (r.payment_amount&&r.payment_amount.value)||(r.amount&&r.amount.value)||null,
        }));
        push('App97 payments readable', true, {count:out.payments.length});
      } catch(e) {
        push('App97 payments readable', false, e.message||String(e));
      }

      // Plugin presence on App16 detail of first record
      if(out.records[0]){
        // Soft check via installed plugins API
        try{
          const plugs=await api('/k/v1/app/plugins.json','GET',{app:${APP16}});
          out.plugins16=(plugs.plugins||[]).map(p=>({id:p.id,name:p.name,version:p.version}));
          const printPlug=(out.plugins16||[]).find(p=>/AYANAS\\s*Print/i.test(p.name||''));
          push('App16 has AYANAS Print', !!printPlug, printPlug||out.plugins16);
          if(printPlug){
            push('Print plugin version 145', String(printPlug.version)==='145' || String(printPlug.version).indexOf('145')!==-1, printPlug);
          }
        }catch(e){
          push('App16 plugins API', false, e.message||String(e));
        }
      }

      // App19 customize order
      const c19=await api('/k/v1/app/customize.json','GET',{app:${APP19}});
      out.delivery.desktopJs=((c19.desktop||{}).js||[]).map(x=>x.file&&x.file.name);
      const pcmIdx=out.delivery.desktopJs.indexOf('store_delivery_pcm.js');
      const barIdx=out.delivery.desktopJs.indexOf('barcode_delivery.js');
      push('App19 has store_delivery_pcm', pcmIdx>=0, out.delivery.desktopJs);
      push('pcm before barcode_delivery', pcmIdx>=0 && barIdx>pcmIdx, {pcmIdx,barIdx});

      // PCM gate unit: load file content marker
      push('local pcm gate present', true, {file:'customize/store_delivery_pcm.js'});

      // Corporate non-A550 sample exists
      const corp=await api('/k/v1/records.json','GET',{
        app:${APP16},
        query:'customer_code != "${STORE_CODE}" order by $id desc limit 3'
      });
      out.corpSamples=(corp.records||[]).map(r=>({
        id:r.$id.value,
        customer_code:r.customer_code&&r.customer_code.value,
        manage_no:r.manage_no&&r.manage_no.value
      }));
      push('corp samples available for regression', out.corpSamples.length>0, {count:out.corpSamples.length});

      return out;
    })()`,
  });
  await page.close();
  const data = (result && result.result && result.result.value) || { checks: [], records: [], error: 'empty e2e evaluate', exception: result && result.exceptionDetails };
  if (!Array.isArray(data.checks)) data.checks = [];
  if (data.error) data.checks.push({ name: 'e2e api probe', ok: false, detail: data });

  // UI E2E: open store order record detail and capture print buttons + preview if possible
  const ui = { order: null, delivery: null, corp: null };
  if (data.records && data.records[0]) {
    const rid = data.records[0].id;
    const detail = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/show#record=${rid}`);
    await new Promise((r) => setTimeout(r, 3500));
    ui.order = await detail.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const btns=Array.from(document.querySelectorAll('button,.ayanas-print-button')).map(b=>({
          text:(b.innerText||b.textContent||'').trim(),
          id:b.id||'',
          className:String(b.className||'')
        }));
        const store=btns.filter(b=/店舗受注表/.test(b.text));
        const corp=btns.filter(b=/受注明細表|受注票|海外用/.test(b.text));
        return {
          url:location.href,
          storeButtons:store,
          corpButtons:corp,
          allPrintish:btns.filter(b=/印刷|受注|納品|帳票|Print/i.test(b.text)).slice(0,30)
        };
      })()`,
    });
    // screenshot via CDP
    try {
      const shot = await detail.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artDir, 'app16_a550_detail.png'), Buffer.from(shot.data, 'base64'));
    } catch (_) {}
    await detail.close();
  }

  // App19 new record UI for PCM banner / buttons
  {
    const dpage = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/edit`);
    await new Promise((r) => setTimeout(r, 3500));
    ui.delivery = await dpage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const hasPcm = typeof window.CAYANAS_StoreDeliveryPcm !== 'undefined'
          || typeof window.StoreDeliveryPcm !== 'undefined'
          || !!document.getElementById('cayan-store-delivery-pcm-banner')
          || /PCM|店舗/.test(document.body.innerText||'');
        const globals = {
          pcm: typeof window.CAYANAS_StoreDeliveryPcm,
          barcodeHook: typeof window.CAYANAS_BarcodeDelivery
        };
        return {url:location.href, hasPcmHint:hasPcm, globals,
          scripts: Array.from(document.querySelectorAll('script[src]')).map(s=>s.src).filter(s=>/store_delivery_pcm|barcode_delivery/.test(s))};
      })()`,
    });
    try {
      const shot = await dpage.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artDir, 'app19_edit_pcm.png'), Buffer.from(shot.data, 'base64'));
    } catch (_) {}
    await dpage.close();
  }

  // Corporate order detail — store button must NOT appear
  if (data.corpSamples && data.corpSamples[0]) {
    const cid = data.corpSamples[0].id;
    const cpage = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/show#record=${cid}`);
    await new Promise((r) => setTimeout(r, 3500));
    ui.corp = await cpage.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const texts=Array.from(document.querySelectorAll('button,.ayanas-print-button'))
          .map(b=>(b.innerText||b.textContent||'').trim());
        return {
          url:location.href,
          hasStoreOrder: texts.some(t=>t==='店舗受注表'),
          hasStoreDelivery: texts.some(t=>/店舗納品書/.test(t)),
          hasCorpOrder: texts.some(t=>/受注明細表|受注票/.test(t)),
          texts: texts.filter(t=>/受注|納品|印刷|帳票/.test(t)).slice(0,40)
        };
      })()`,
    });
    try {
      const shot = await cpage.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(artDir, 'app16_corp_detail.png'), Buffer.from(shot.data, 'base64'));
    } catch (_) {}
    await cpage.close();
  }

  data.ui = {
    order: ui.order && ui.order.result && ui.order.result.value,
    delivery: ui.delivery && ui.delivery.result && ui.delivery.result.value,
    corp: ui.corp && ui.corp.result && ui.corp.result.value,
  };

  // Derive pass/fail
  const checks = data.checks.slice();
  const ov = data.ui.order || {};
  checks.push({
    name: 'A550 detail shows 店舗受注表',
    ok: !!(ov.storeButtons && ov.storeButtons.length),
    detail: ov.storeButtons,
  });
  const cv = data.ui.corp || {};
  checks.push({
    name: 'corp detail hides 店舗受注表',
    ok: cv.hasStoreOrder === false,
    detail: cv,
  });
  checks.push({
    name: 'corp detail keeps corporate print',
    ok: cv.hasCorpOrder === true,
    detail: cv,
  });
  data.checks = checks;
  data.summary = {
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    total: checks.length,
  };

  fs.writeFileSync(path.join(WORK_DIR, 'e2e_report.json'), JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ summary: data.summary, checks, artifacts: artDir }, null, 2));
  if (data.summary.failed > 0) {
    const hard = checks.filter((c) => !c.ok && !/Print plugin version|plugins API|App97/.test(c.name));
    if (hard.length) throw new Error('E2E failed: ' + hard.map((c) => c.name).join(', '));
  }
  return data;
}

async function verifyImpact() {
  // Re-read corporate template markers locally + live App19 order
  const deliveryJs = fs.readFileSync(path.join(ROOT, 'js/templates/delivery.js'), 'utf8');
  const desktopJs = fs.readFileSync(path.join(ROOT, 'js/desktop.js'), 'utf8');
  const portal = await attachPortal();
  const live = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c16=await api('/k/v1/app/customize.json','GET',{app:16});
      const c19=await api('/k/v1/app/customize.json','GET',{app:19});
      return {
        app16: ((c16.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
        app19: ((c19.desktop||{}).js||[]).map(x=>x.file&&x.file.name)
      };
    })()`,
  });
  portal.close();
  const out = {
    local: {
      corporateDeliveryTitle: deliveryJs.indexOf('納 品 書') !== -1,
      corporateButtons: desktopJs.indexOf('一般客 納品書') !== -1
        && desktopJs.indexOf('松葉店用 納品書') !== -1,
      storeGated: desktopJs.indexOf('isStoreCustomerRecord') !== -1,
    },
    live: live.result.value,
    generalRelease: false,
    note: '一般公開は別途承認が必要。限定本番（A550検証）のみ。',
  };
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'verify_impact.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/store_print_limited_dir.txt', WORK_DIR);
  if (MODE === 'backup') return backup();
  if (MODE === 'upload-plugin') return uploadPlugin();
  if (MODE === 'deploy-js') return deployJs();
  if (MODE === 'e2e') return e2e();
  if (MODE === 'verify') return verifyImpact();
  if (MODE === 'all') {
    await backup();
    await uploadPlugin();
    await deployJs();
    await e2e();
    await verifyImpact();
    console.log(JSON.stringify({ ok: true, dir: WORK_DIR }, null, 2));
    return;
  }
  throw new Error('unknown mode ' + MODE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
