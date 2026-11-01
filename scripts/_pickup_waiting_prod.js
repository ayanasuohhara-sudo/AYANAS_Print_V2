'use strict';

/**
 * 引き取り待ち + App92バーコード引き取り 本番反映（承認済み）
 *
 * Modes:
 *   node scripts/_pickup_waiting_prod.js all
 *   node scripts/_pickup_waiting_prod.js backup
 *   node scripts/_pickup_waiting_prod.js add-option
 *   node scripts/_pickup_waiting_prod.js deploy
 *   node scripts/_pickup_waiting_prod.js e2e
 *
 * 実顧客データの一括更新はしない。E2E は [TEST] / P000002 のみ。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const APP34 = 34;
const APP92 = 92;
const APP97 = 97;
const APP96 = 96;
const TEST_PCM = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';
const MODE = process.argv[2] || 'all';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = process.env.PICKUP_PROD_DIR
  || path.join(ROOT, 'customize/backups', 'pickup_waiting_prod_' + STAMP);

const APP19_JS = [
  'internal_ops_config.js',
  'complete_register_engine.js',
  'delivery_completion_guard.js',
  'barcode_delivery.js',
  'store_pickup_shared.js',
  'delivery_complete_sync.js',
  'delivery_a550_edit_guard.js',
  'price_master_register.js',
  'delivery_additional_item_guard.js',
  'additional_item_engine.js',
];

const APP34_JS = [
  'internal_ops_config.js',
  'store_pickup_shared.js',
  'barcode_batch_core.js',
  'barcode_batch_ui.js',
  'location_inbound_engine.js',
  'location_inbound_desktop.js',
];

const APP92_JS = [
  'store_deadline_config.js',
  'store_deadline_engine.js',
  'store_payment_config.js',
  'store_payment_engine.js',
  'store_pickup_shared.js',
  'store_pickup_api.js',
  'store_deadline_desktop.js',
  'store_deadline_pickup.js',
];
const APP92_CSS = ['store_deadline.css'];

const APP97_JS = [
  'store_payment_config.js',
  'store_payment_engine.js',
  'store_payment_numbering.js',
  'store_pickup_shared.js',
  'store_pickup_api.js',
  'store_payment_api.js',
  'store_payment_desktop.js',
  'store_payment_ui.js',
];
const APP97_CSS = ['store_payment.css'];

const DELIVERY_OPTIONS = ['未納品', '納品待ち', '引き取り待ち', '納品済'];

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
      const out={apps:{}};
      const fields=await api('/k/v1/app/form/fields.json','GET',{app:16});
      out.fields16=fields;
      const ds=fields.properties.delivery_status||{};
      out.deliveryStatusBefore={
        defaultValue:ds.defaultValue,
        options:Object.keys(ds.options||{}).sort((a,b)=>(ds.options[a].index||0)-(ds.options[b].index||0))
      };
      for(const app of [16,19,34,92,97]){
        out.apps[app]=await api('/k/v1/app/customize.json','GET',{app});
      }
      return out;
    })()`,
  });
  portal.close();
  const data = meta.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'fields16.json'), JSON.stringify(data.fields16, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'delivery_status_before.json'), JSON.stringify(data.deliveryStatusBefore, null, 2));
  for (const [appId, customize] of Object.entries(data.apps || {})) {
    const dir = path.join(WORK_DIR, 'app' + appId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'customize.json'), JSON.stringify(customize, null, 2));
  }

  // Download remote customize file bodies for rollback
  for (const appId of [19, 34, 92, 97]) {
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

  fs.writeFileSync(path.join(WORK_DIR, 'BACKUP_OK.json'), JSON.stringify({
    at: new Date().toISOString(),
    dir: WORK_DIR,
    deliveryStatusBefore: data.deliveryStatusBefore,
  }, null, 2));
  fs.writeFileSync('/tmp/pickup_waiting_prod_dir.txt', WORK_DIR);
  console.log(JSON.stringify({ ok: true, dir: WORK_DIR, deliveryStatusBefore: data.deliveryStatusBefore }, null, 2));
  return WORK_DIR;
}

async function addOption() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${APP16};
        const labels=${JSON.stringify(DELIVERY_OPTIONS)};
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const current=await api('/k/v1/app/form/fields.json','GET',{app:APP});
        const ds=(current.properties||{}).delivery_status;
        if(!ds) throw new Error('delivery_status missing');
        const options={};
        labels.forEach((label,index)=>{ options[label]={label,index:String(index)}; });
        await api('/k/v1/preview/app/form/fields.json','PUT',{
          app:APP,
          properties:{
            delivery_status:{
              type:'DROP_DOWN',
              code:'delivery_status',
              label: ds.label || '納品状態',
              noLabel: ds.noLabel,
              required: ds.required,
              options,
              defaultValue: ds.defaultValue || '未納品'
            }
          }
        });
        await api('/k/v1/preview/app/deploy.json','POST',{apps:[{app:APP}]});
        let last=null;
        for(let i=0;i<120;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[APP]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,500));
        }
        const after=await api('/k/v1/app/form/fields.json','GET',{app:APP});
        const ads=(after.properties||{}).delivery_status||{};
        const alabels=Object.keys(ads.options||{}).sort((a,b)=>(ads.options[a].index||0)-(ads.options[b].index||0));
        return {ok: !!(last&&last.status==='SUCCESS'), deploy:last, labels:alabels, defaultValue:ads.defaultValue};
      }catch(e){ return {ok:false,error:e.message||String(e)}; }
    })()`,
  });
  await page.close();
  const value = result.result.value;
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'delivery_status_after.json'), JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2));
  if (!value.ok) throw new Error('add-option failed');
  if (!value.labels.includes('引き取り待ち')) throw new Error('引き取り待ち missing after deploy');
  return value;
}

async function deployAll() {
  const mapLocal = (names) => {
    const o = {};
    for (const n of names) o[n] = readLocal(n);
    return o;
  };

  const report = { at: new Date().toISOString(), apps: {} };

  console.error('deploy App19');
  report.apps[19] = await deployCustomize(APP19, APP19_JS, [], mapLocal(APP19_JS));
  console.error('App19', JSON.stringify(report.apps[19]));
  if (!report.apps[19].ok) throw new Error('App19 deploy failed');

  console.error('deploy App34');
  report.apps[34] = await deployCustomize(APP34, APP34_JS, [], mapLocal(APP34_JS));
  console.error('App34', JSON.stringify(report.apps[34]));
  if (!report.apps[34].ok) throw new Error('App34 deploy failed');

  console.error('deploy App92');
  report.apps[92] = await deployCustomize(APP92, APP92_JS, APP92_CSS, mapLocal(APP92_JS.concat(APP92_CSS)));
  console.error('App92', JSON.stringify(report.apps[92]));
  if (!report.apps[92].ok) throw new Error('App92 deploy failed');

  console.error('deploy App97');
  report.apps[97] = await deployCustomize(APP97, APP97_JS, APP97_CSS, mapLocal(APP97_JS.concat(APP97_CSS)));
  console.error('App97', JSON.stringify(report.apps[97]));
  if (!report.apps[97].ok) throw new Error('App97 deploy failed');

  // verify order
  const expect = {
    19: APP19_JS,
    34: APP34_JS,
    92: APP92_JS,
    97: APP97_JS,
  };
  for (const [app, order] of Object.entries(expect)) {
    const got = report.apps[app].desktopJs || [];
    if (JSON.stringify(got) !== JSON.stringify(order)) {
      throw new Error('JS order mismatch app' + app + ' got=' + JSON.stringify(got));
    }
  }
  if (JSON.stringify(report.apps[92].desktopCss) !== JSON.stringify(APP92_CSS)) {
    throw new Error('App92 CSS order mismatch');
  }
  if (JSON.stringify(report.apps[97].desktopCss) !== JSON.stringify(APP97_CSS)) {
    throw new Error('App97 CSS order mismatch');
  }

  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'deploy.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function runE2E() {
  const report = {
    at: new Date().toISOString(),
    timezoneNote: 'Asia/Tokyo',
    steps: [],
    fixtures: null,
    passed: 0,
    failed: 0,
  };
  const assert = (name, cond, detail) => {
    const row = { name, ok: !!cond, detail: detail === undefined ? null : detail };
    report.steps.push(row);
    console.log((cond ? 'OK  ' : 'FAIL ') + name);
    if (!cond && detail) console.log('   ', JSON.stringify(detail).slice(0, 600));
  };

  // Field option verify
  const portal = await attachPortal();
  const fieldCheck = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const f=await api('/k/v1/app/form/fields.json','GET',{app:16});
      const ds=f.properties.delivery_status||{};
      const labels=Object.keys(ds.options||{}).sort((a,b)=>(ds.options[a].index||0)-(ds.options[b].index||0));
      const c19=await api('/k/v1/app/customize.json','GET',{app:19});
      const c34=await api('/k/v1/app/customize.json','GET',{app:34});
      const c92=await api('/k/v1/app/customize.json','GET',{app:92});
      const c97=await api('/k/v1/app/customize.json','GET',{app:97});
      return {
        labels,
        app19:((c19.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
        app34:((c34.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
        app92:((c92.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
        app97:((c97.desktop||{}).js||[]).map(x=>x.file&&x.file.name)
      };
    })()`,
  });
  portal.close();
  const v = fieldCheck.result.value;
  assert('App16 has 引き取り待ち', (v.labels || []).includes('引き取り待ち'), v.labels);
  assert('App19 includes store_pickup_shared', (v.app19 || []).includes('store_pickup_shared.js'), v.app19);
  assert('App34 includes store_pickup_shared', (v.app34 || []).includes('store_pickup_shared.js'), v.app34);
  assert('App92 pickup stack', (v.app92 || []).includes('store_pickup_api.js')
    && (v.app92 || []).includes('store_deadline_pickup.js'), v.app92);
  assert('App97 pickup stack', (v.app97 || []).includes('store_pickup_api.js')
    && (v.app97 || []).indexOf('store_pickup_api.js')
      < (v.app97 || []).indexOf('store_payment_api.js'), v.app97);

  // Create TEST fixtures
  const page16 = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const fixture = await page16.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const pcm=await api('/k/v1/records.json','GET',{app:${APP96},query:'personal_customer_id = "${TEST_PCM}" limit 1'});
      if(!(pcm.records||[]).length) return {ok:false,error:'PCM missing'};
      const src=await api('/k/v1/records.json','GET',{app:16,query:'customer_code = "A550" and manage_no = "103126379" limit 1'});
      const base=src.records[0];
      if(!base) return {ok:false,error:'no A550 template'};
      const srcRow=((base.detail_table&&base.detail_table.value)||[])[0];
      const srcItemCode=srcRow&&srcRow.value&&srcRow.value.item_code&&srcRow.value.item_code.value;
      if(!srcItemCode) return {ok:false,error:'template item_code missing'};
      const stamp=Date.now().toString().slice(-6);
      const today=new Date().toISOString().slice(0,10);
      const specs=[
        {mn:'PK'+stamp+'A', loc:'店舗', note:'slip-at-store'},
        {mn:'PK'+stamp+'B', loc:'工場', note:'slip-at-factory-then-inbound'},
        {mn:'PK'+stamp+'C', loc:'店舗', note:'prepaid-app92'},
        {mn:'PK'+stamp+'D', loc:'店舗', note:'same-day-app97'},
        {mn:'PK'+stamp+'E', loc:'店舗', note:'multi-2'},
        {mn:'PK'+stamp+'F', loc:'店舗', note:'unpaid-block'},
        {mn:'PK'+stamp+'G', loc:'店舗', note:'double-pickup'}
      ];
      const created=[];
      for(const s of specs){
        const record={
          customer_code:{value:'A550'},
          customer_name:{value: base.customer_name ? base.customer_name.value : '店舗'},
          client_name:{value:'${TEST_PCM_NAME}'},
          personal_customer_id:{value:'${TEST_PCM}'},
          manage_no:{value:s.mn},
          kimono_type:{value:'[TEST]PK小紋'},
          location_status:{value:s.loc},
          process_status:{value:'完了'},
          work_status:{value:'仕上げ完了'},
          delivery_status:{value:'未納品'},
          delivery_no:{value:''},
          delivery_date:{value:''},
          order_date:{value:today},
          deadline:{value:today},
          detail_table:{value:[{value:{
            item_code:{value:srcItemCode},
            item_name:{value:'[TEST]PK丸洗い'},
            qty:{value:'1'},
            unit_price:{value:'3000'},
            amount:{value:'3000'}
          }}]}
        };
        const res=await api('/k/v1/record.json','POST',{app:16,record});
        created.push({id:String(res.id), manageNo:s.mn, location:s.loc, note:s.note});
      }
      // corporate control (TEST master Z9P0 if exists)
      let corp=null;
      const corpQ=await api('/k/v1/records.json','GET',{app:16,query:'customer_code = "Z9P0" limit 1',fields:['$id','customer_code','delivery_status','location_status','$revision','manage_no']});
      if((corpQ.records||[]).length){
        const r=corpQ.records[0];
        corp={id:r.$id.value, code:r.customer_code.value, ds:r.delivery_status.value, ls:r.location_status.value, rev:r.$revision.value, mn:r.manage_no.value};
      } else {
        const real=await api('/k/v1/records.json','GET',{app:16,query:'customer_code = "A545" and manage_no = "103126382" limit 1',fields:['$id','customer_code','delivery_status','location_status','$revision','manage_no']});
        if(real.records[0]){
          const r=real.records[0];
          corp={id:r.$id.value, code:r.customer_code.value, ds:r.delivery_status.value, ls:r.location_status.value, rev:r.$revision.value, mn:r.manage_no.value, real:true};
        }
      }
      return {ok:true, stamp, today, created, corp};
    })()`,
  });
  await page16.close();
  report.fixtures = fixture.result.value;
  assert('TEST fixtures created', report.fixtures && report.fixtures.ok && report.fixtures.created.length === 7, report.fixtures);
  if (!report.fixtures || !report.fixtures.ok) {
    report.passed = report.steps.filter((x) => x.ok).length;
    report.failed = report.steps.filter((x) => !x.ok).length;
    fs.mkdirSync(WORK_DIR, { recursive: true });
    fs.writeFileSync(path.join(WORK_DIR, 'e2e_report.json'), JSON.stringify(report, null, 2));
    return report;
  }

  const byNote = Object.fromEntries(report.fixtures.created.map((c) => [c.note, c]));
  const today = report.fixtures.today;
  const corp = report.fixtures.corp;

  // 1) App19 slip → 引き取り待ち / 納品待ち
  const app19 = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
  await new Promise((r) => setTimeout(r, 2500));
  const slip = await app19.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const S=window.CAYANAS_DeliveryCompleteSync;
      const P=window.CAYANAS_StorePickup;
      if(!S||!P) return {ok:false,error:'globals missing', hasS:!!S, hasP:!!P};
      const today=${JSON.stringify(today)};
      const targets=${JSON.stringify([byNote['slip-at-store'], byNote['slip-at-factory-then-inbound'], byNote['prepaid-app92'], byNote['same-day-app97'], byNote['multi-2'], byNote['unpaid-block'], byNote['double-pickup']])};
      const created=await api('/k/v1/record.json','POST',{app:19,record:{
        customer_code:{value:'A550'},
        customer_name:{value:'ayanasu'},
        delivery_date:{value:today},
        delivery_type:{value:'本社納品'},
        delivery_detail:{value: targets.map(t=>({value:{
          manage_no:{value:t.manageNo},
          client_name:{value:'${TEST_PCM_NAME}'},
          kimono_type:{value:'[TEST]PK小紋'},
          item_name:{value:'[TEST]PK丸洗い'},
          qty:{value:'1'},
          unit_price:{value:'3000'}
        }}))}
      }});
      const id=String(created.id);
      const deliveryNo='N'+today.replace(/-/g,'')+'-'+id;
      await api('/k/v1/record.json','PUT',{app:19,id,record:{delivery_no:{value:deliveryNo}}});
      const results=[];
      for(const t of targets){
        const found=await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+t.manageNo+'\"'});
        const order=(found.records||[])[0];
        const plan=S.planStoreOrderSync(order, today, deliveryNo);
        if(plan.action==='put'){
          await api('/k/v1/record.json','PUT',{app:16,id:order.$id.value,record:plan.record});
        }
        const after=(await api('/k/v1/record.json','GET',{app:16,id:order.$id.value})).record;
        results.push({
          note:t.note, mn:t.manageNo, action:plan.action, target:plan.targetStatus,
          ds:after.delivery_status.value, dn:after.delivery_no.value,
          ps:after.process_status.value, ls:after.location_status.value, ws:after.work_status.value
        });
      }
      return {ok:true, deliveryNo, statusPickup:S.STATUS_PICKUP_WAITING, results};
    })()`,
  });
  await app19.close();
  const slipV = slip.result.value;
  assert('App19 sync globals', !!(slipV && slipV.ok), slipV);
  const storeSlip = (slipV.results || []).find((r) => r.note === 'slip-at-store');
  const factorySlip = (slipV.results || []).find((r) => r.note === 'slip-at-factory-then-inbound');
  assert('納品書: 店舗完了 → 引き取り待ち', !!(storeSlip && storeSlip.ds === '引き取り待ち' && storeSlip.dn), storeSlip);
  assert('納品書: 工場完了 → 納品待ち', !!(factorySlip && factorySlip.ds === '納品待ち' && factorySlip.dn), factorySlip);
  assert('納品書: process/location/work 不変', (slipV.results || []).every((r) => r.ps === '完了' && r.ws === '仕上げ完了'), slipV.results);

  // 2) App34 inbound factory → store sets 引き取り待ち
  const app34 = await openPage(`https://${SUB}.cybozu.com/k/${APP34}/`);
  await new Promise((r) => setTimeout(r, 2500));
  const inbound = await app34.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const E=window.CAYANAS_LocationInboundEngine;
      const P=window.CAYANAS_StorePickup;
      if(!E||!P) return {ok:false,error:'globals missing', hasE:!!E, hasP:!!P};
      const mn=${JSON.stringify(byNote['slip-at-factory-then-inbound'].manageNo)};
      const found=await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+mn+'\"'});
      const order=found.records[0];
      const snap={
        customerCode:order.customer_code.value,
        locationStatus:order.location_status.value,
        processStatus:order.process_status.value,
        workStatus:order.work_status.value,
        deliveryStatus:order.delivery_status.value,
        deliveryNo:order.delivery_no.value
      };
      const plan=E.buildInboundPutRecord('店舗', snap);
      if(plan.record){
        await api('/k/v1/record.json','PUT',{app:16,id:order.$id.value,record:plan.record});
      }
      const after=(await api('/k/v1/record.json','GET',{app:16,id:order.$id.value})).record;
      return {
        ok:true, planSummary:plan.summary,
        before:snap,
        after:{ls:after.location_status.value, ds:after.delivery_status.value, ps:after.process_status.value, ws:after.work_status.value, dn:after.delivery_no.value}
      };
    })()`,
  });
  await app34.close();
  const inV = inbound.result.value;
  assert('工場→店舗: location=店舗 & 引き取り待ち', !!(inV && inV.after && inV.after.ls === '店舗' && inV.after.ds === '引き取り待ち'), inV);
  assert('工場→店舗: process/work 不変', !!(inV && inV.after && inV.after.ps === '完了' && inV.after.ws === '仕上げ完了'), inV);

  // Helper: pay + pickup on App97/App92
  const app97 = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  await new Promise((r) => setTimeout(r, 4000));
  const payPickup = await app97.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const Api=window.CAYANAS_StorePayment_Api;
      const Eng=window.CAYANAS_StorePayment_Engine;
      const C=window.CAYANAS_StorePayment;
      const PickupApi=window.CAYANAS_StorePickup_Api;
      const P=window.CAYANAS_StorePickup;
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      if(!Api||!PickupApi||!P) return {ok:false,error:'globals', hasApi:!!Api, hasPickup:!!PickupApi, hasP:!!P, ver:C&&C.VERSION};

      const ids=${JSON.stringify({
        prepaid: byNote['prepaid-app92'].id,
        sameDay: byNote['same-day-app97'].id,
        multi: byNote['multi-2'].id,
        unpaid: byNote['unpaid-block'].id,
        dbl: byNote['double-pickup'].id,
      })};
      const mns=${JSON.stringify({
        prepaid: byNote['prepaid-app92'].manageNo,
        sameDay: byNote['same-day-app97'].manageNo,
        multi: byNote['multi-2'].manageNo,
        unpaid: byNote['unpaid-block'].manageNo,
        dbl: byNote['double-pickup'].manageNo,
      })};

      async function fullPay(orderRecordId){
        const loaded=await Api.loadByPersonalCustomerId('${TEST_PCM}');
        const row=loaded.rows.find(r=>String(r.orderRecordId)===String(orderRecordId));
        if(!row) return {ok:false,error:'row missing '+orderRecordId};
        if(row.balance<=0) return {ok:true,alreadyPaid:true};
        const built=Eng.buildAllocationLinesFromSelection([
          Object.assign({},row,{allocateAmount:row.balance,selectable:true})
        ],'custom');
        return Api.registerPayment({
          personalCustomerId:'${TEST_PCM}',
          clientNameSnapshot:'${TEST_PCM_NAME}',
          transactionId:Eng.createTransactionId(),
          paymentDate:Eng.todayYmd(),
          paymentAmount:built.paymentAmount,
          paymentMethod:C.PAYMENT_METHOD.cash,
          paymentTiming:C.PAYMENT_TIMING.pickup,
          paymentChannel:C.PAYMENT_CHANNEL.store,
          recordKind:C.RECORD_KIND.payment,
          lines:built.lines
        });
      }

      const out={};

      // unpaid block
      const unpaidGate=await PickupApi.completePickup(ids.unpaid,{unpaidHandoverApproved:false});
      out.unpaidBlocked= !unpaidGate.ok && (unpaidGate.code==='unpaid' || /未入金|一部入金|App97/.test(unpaidGate.error||''));
      out.unpaidDetail=unpaidGate;

      // prepaid then App92-style completePickup (shared)
      out.payPrepaid=await fullPay(ids.prepaid);
      out.pickPrepaid=await PickupApi.completePickup(ids.prepaid,{expectedPersonalCustomerId:'${TEST_PCM}'});
      const afterPrepaid=(await api('/k/v1/record.json','GET',{app:16,id:ids.prepaid})).record;
      out.afterPrepaid={ds:afterPrepaid.delivery_status.value, ps:afterPrepaid.process_status.value, ls:afterPrepaid.location_status.value, ws:afterPrepaid.work_status.value};

      // same-day App97 pickup
      out.paySame=await fullPay(ids.sameDay);
      out.pickSame=await Api.completePickup(ids.sameDay,{expectedPersonalCustomerId:'${TEST_PCM}'});
      const afterSame=(await api('/k/v1/record.json','GET',{app:16,id:ids.sameDay})).record;
      out.afterSame={ds:afterSame.delivery_status.value};

      // multi: pay both prepaid already done; pay multi + dbl? pay multi only for multi test with another already paid?
      out.payMulti=await fullPay(ids.multi);
      out.pickMulti1=await PickupApi.completePickup(ids.multi,{expectedPersonalCustomerId:'${TEST_PCM}'});
      // use already paid prepaid is done; pick second newly paid? Use double-pickup target after pay as second of multi
      out.payDbl=await fullPay(ids.dbl);
      out.pickMulti2=await PickupApi.completePickup(ids.dbl,{expectedPersonalCustomerId:'${TEST_PCM}'});
      const afterMulti=(await api('/k/v1/record.json','GET',{app:16,id:ids.multi})).record;
      const afterDbl=(await api('/k/v1/record.json','GET',{app:16,id:ids.dbl})).record;
      out.afterMulti={ds:afterMulti.delivery_status.value};
      out.afterDbl={ds:afterDbl.delivery_status.value};

      // double pickup
      out.double=await PickupApi.completePickup(ids.dbl,{expectedPersonalCustomerId:'${TEST_PCM}'});

      // barcode load on shared
      out.barcode=await PickupApi.loadPickupByBarcode(mns.unpaid);

      // cart pcm mismatch simulation
      out.cartOk=P.canAddToPickupCart({items:[]},{personalCustomerId:'${TEST_PCM}',manageNo:mns.unpaid,orderRecordId:ids.unpaid});
      out.cartMismatch=P.canAddToPickupCart({items:[{personalCustomerId:'${TEST_PCM}',manageNo:mns.unpaid,orderRecordId:ids.unpaid}]},{personalCustomerId:'P999999',manageNo:'X',orderRecordId:'9'});

      return Object.assign({ok:true, ver:C.VERSION}, out);
    })()`,
  });
  await app97.close();
  const pp = payPickup.result.value;
  assert('App97/共有 globals', !!(pp && pp.ok), pp);
  assert('未入金引き取り防止', !!(pp && pp.unpaidBlocked), pp && pp.unpaidDetail);
  assert('先払い後 App92共有引き取り → 納品済', !!(pp && pp.pickPrepaid && pp.pickPrepaid.ok && pp.afterPrepaid && pp.afterPrepaid.ds === '納品済'), pp);
  assert('先払い引き取りで process/location/work 不変', !!(pp && pp.afterPrepaid && pp.afterPrepaid.ps === '完了' && pp.afterPrepaid.ls === '店舗' && pp.afterPrepaid.ws === '仕上げ完了'), pp.afterPrepaid);
  assert('当日入金後 App97引き取り → 納品済', !!(pp && pp.pickSame && pp.pickSame.ok && pp.afterSame && pp.afterSame.ds === '納品済'), pp);
  assert('複数商品引き取り', !!(pp && pp.pickMulti1 && pp.pickMulti1.ok && pp.pickMulti2 && pp.pickMulti2.ok
    && pp.afterMulti.ds === '納品済' && pp.afterDbl.ds === '納品済'), pp);
  assert('二重引き取りは alreadyDone', !!(pp && pp.double && pp.double.ok && pp.double.alreadyDone), pp && pp.double);
  assert('バーコード読取（未入金案内）', !!(pp && pp.barcode && pp.barcode.ok && pp.barcode.candidate && pp.barcode.candidate.guideToApp97), pp && pp.barcode);
  assert('PCM混入防止', !!(pp && pp.cartMismatch && pp.cartMismatch.ok === false), pp && pp.cartMismatch);

  // App92 UI globals / panel
  const app92 = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 4500));
  const ui92 = await app92.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      ver: window.CAYANAS_STORE_DEADLINE && window.CAYANAS_STORE_DEADLINE.VERSION,
      pickup: !!window.CAYANAS_StoreDeadlinePickup,
      api: !!window.CAYANAS_StorePickup_Api,
      panel: !!document.getElementById('cayan-sd-pickup-panel'),
      title: (document.querySelector('.cayan-sd-pickup__title')||{}).textContent || ''
    })`,
  });
  await app92.close();
  assert('App92 v1.2.0 + 引き取りパネル', !!(ui92.result.value && ui92.result.value.ver === '1.2.0'
    && ui92.result.value.api && ui92.result.value.panel), ui92.result.value);

  // Corporate unaffected
  if (corp) {
    const pageCorp = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
    const corpCheck = await pageCorp.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const r=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(corp.id)}})).record;
        return {
          id:r.$id.value,
          ds:r.delivery_status.value,
          ls:r.location_status.value,
          rev:r.$revision.value,
          before:${JSON.stringify(corp)}
        };
      })()`,
    });
    await pageCorp.close();
    const cc = corpCheck.result.value;
    assert('法人サンプル未変更', !!(cc && cc.ds === corp.ds && cc.ls === corp.ls && String(cc.rev) === String(corp.rev)), cc);
  } else {
    assert('法人サンプル未変更（対象なしスキップ）', true, null);
  }

  report.passed = report.steps.filter((x) => x.ok).length;
  report.failed = report.steps.filter((x) => !x.ok).length;
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync(path.join(WORK_DIR, 'e2e_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, failed: report.failed }, null, 2));
  return report;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  if (MODE === 'backup') return backup();
  if (MODE === 'add-option') return addOption();
  if (MODE === 'deploy') return deployAll();
  if (MODE === 'e2e') return runE2E();

  console.error('=== backup ===');
  await backup();
  console.error('=== add-option ===');
  await addOption();
  console.error('=== deploy ===');
  await deployAll();
  console.error('=== e2e ===');
  const e2e = await runE2E();
  if (e2e.failed) {
    console.error('E2E failures:', e2e.failed);
    process.exit(1);
  }
  console.error('ALL OK');
  return e2e;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
